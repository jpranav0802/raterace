//! Shared test setup. Anyone may ADD helpers at the bottom; don't change existing ones
//! without telling the team.
#![allow(dead_code)]

extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use oracle_interface::{Asset, PriceData};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Symbol,
};

use crate::types::{Config, Quote};
use crate::{RateRaceContract, RateRaceContractClient};

/// 1 USDC / 1 MXN in on-chain units (7 decimals).
pub const UNIT: i128 = 10_000_000;
/// 0.05 USD per MXN (20 MXN per USD), 14 decimals. Illustrative test value.
pub const MXN_PRICE: i128 = 5_000_000_000_000;
/// Test clock start (unix seconds).
pub const START_TIME: u64 = 1_800_000_000;

pub fn usdc(amount: i128) -> i128 {
    amount * UNIT
}

pub fn mxn(amount: i128) -> i128 {
    amount * UNIT
}

pub fn corridor() -> Symbol {
    symbol_short!("MX_SPEI")
}

pub fn asset_code() -> Symbol {
    symbol_short!("MXN")
}

// ---------- a tiny Reflector-compatible oracle, only for these unit tests ----------
// (The deployable mock lives in contracts/mock_oracle, issue #4.)

#[contracttype]
#[derive(Clone)]
enum OracleKey {
    Price(Asset),
}

#[contract]
pub struct TestOracle;

#[contractimpl]
impl TestOracle {
    pub fn set(env: Env, asset: Asset, price: i128, timestamp: u64) {
        env.storage()
            .persistent()
            .set(&OracleKey::Price(asset), &PriceData { price, timestamp });
    }

    pub fn clear(env: Env, asset: Asset) {
        env.storage().persistent().remove(&OracleKey::Price(asset));
    }

    pub fn lastprice(env: Env, asset: Asset) -> Option<PriceData> {
        env.storage().persistent().get(&OracleKey::Price(asset))
    }

    pub fn decimals(_env: Env) -> u32 {
        14
    }
}

// ---------- setup ----------

/// Demo values from docs/BUILD_PLAN.md (payout 120 s, challenge 60 s, bond 105%, penalty 5%).
pub fn demo_config(admin: &Address, usdc_id: &Address, oracle_id: &Address) -> Config {
    Config {
        admin: admin.clone(),
        usdc: usdc_id.clone(),
        oracle: oracle_id.clone(),
        max_oracle_age_s: 600,
        payout_window_s: 120,
        challenge_window_s: 60,
        bond_ratio_bps: 10_500,
        penalty_bps: 500,
        default_max_markup_bps: 300,
        default_daily_cap: usdc(1_000),
        max_slashes: 1,
    }
}

pub struct TestAnchor {
    pub address: Address,
    /// ed25519 key the anchor signs quotes with.
    pub signing: SigningKey,
}

pub struct Setup {
    pub env: Env,
    pub admin: Address,
    pub sender: Address,
    pub usdc_id: Address,
    pub oracle_id: Address,
    pub contract_id: Address,
    pub client: RateRaceContractClient<'static>,
    pub token: TokenClient<'static>,
    pub oracle: TestOracleClient<'static>,
    /// [0] alpha, [1] beta, [2] gamma: registered, bonded 2,000 USDC, active.
    pub anchors: std::vec::Vec<TestAnchor>,
    next_request: u8,
}

impl Setup {
    /// Fully initialised world: contract deployed with the demo config, oracle priced,
    /// sender holds 10,000 USDC, three active anchors with 5,000 USDC each of which 2,000
    /// is bonded. All auths are mocked (`env.mock_all_auths()`).
    pub fn new() -> Setup {
        Setup::with_config(|_| {})
    }

    /// Like `new()`, but lets a test change the config the contract is deployed with.
    /// Panics if the constructor rejects the config.
    pub fn with_config(tweak: impl FnOnce(&mut Config)) -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(START_TIME);

        let admin = Address::generate(&env);
        let sender = Address::generate(&env);

        let issuer = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(issuer);
        let usdc_id = sac.address();
        StellarAssetClient::new(&env, &usdc_id).mint(&sender, &usdc(10_000));

        let oracle_id = env.register(TestOracle, ());
        let oracle = TestOracleClient::new(&env, &oracle_id);
        oracle.set(&Asset::Other(asset_code()), &MXN_PRICE, &START_TIME);

        let mut config = demo_config(&admin, &usdc_id, &oracle_id);
        tweak(&mut config);
        // The config is a constructor argument: deploy and initialise are one atomic step.
        let contract_id = env.register(RateRaceContract, (config,));
        let client = RateRaceContractClient::new(&env, &contract_id);
        let token = TokenClient::new(&env, &usdc_id);

        let mut s = Setup {
            env,
            admin,
            sender,
            usdc_id,
            oracle_id,
            contract_id,
            client,
            token,
            oracle,
            anchors: std::vec::Vec::new(),
            next_request: 0,
        };
        for i in 0..3u8 {
            let anchor = s.new_anchor(i + 1);
            s.client.register_anchor(
                &anchor.address,
                &s.signing_key_bytes(&anchor),
                &vec![&s.env, corridor()],
            );
            s.client.add_bond(&anchor.address, &usdc(2_000));
            s.client.set_active(&anchor.address, &true);
            s.anchors.push(anchor);
        }
        s
    }

    /// The config `new()` deploys with.
    pub fn default_config(&self) -> Config {
        demo_config(&self.admin, &self.usdc_id, &self.oracle_id)
    }

    /// A funded (5,000 USDC) but unregistered anchor with a deterministic signing key.
    pub fn new_anchor(&self, seed: u8) -> TestAnchor {
        let address = Address::generate(&self.env);
        StellarAssetClient::new(&self.env, &self.usdc_id).mint(&address, &usdc(5_000));
        TestAnchor {
            address,
            signing: SigningKey::from_bytes(&[seed; 32]),
        }
    }

    pub fn signing_key_bytes(&self, anchor: &TestAnchor) -> BytesN<32> {
        BytesN::from_array(&self.env, &anchor.signing.verifying_key().to_bytes())
    }

    /// An unsigned quote from `anchors[idx]`, valid for 120 s, with a fresh request_id.
    pub fn quote(&mut self, idx: usize, send_usdc: i128, landed_local: i128) -> Quote {
        self.next_request += 1;
        Quote {
            anchor: self.anchors[idx].address.clone(),
            request_id: BytesN::from_array(&self.env, &[self.next_request; 32]),
            corridor: corridor(),
            asset_code: asset_code(),
            send_usdc,
            landed_local,
            expires_at: self.now() + 120,
        }
    }

    /// Sign `quote` with the given key, exactly like an anchor does off-chain:
    /// signature over the 32 bytes returned by `quote_digest`.
    pub fn sign(&self, quote: &Quote, key: &SigningKey) -> BytesN<64> {
        let digest = self.client.quote_digest(quote);
        BytesN::from_array(&self.env, &key.sign(&digest.to_array()).to_bytes())
    }

    /// A valid (quote, signature) pair from `anchors[idx]`.
    /// At the test price, 200 USDC = 4,000 MXN at mid-market; e.g. landed 3,940 MXN = 1.5% markup.
    pub fn signed_quote(
        &mut self,
        idx: usize,
        send_usdc: i128,
        landed_local: i128,
    ) -> (Quote, BytesN<64>) {
        let quote = self.quote(idx, send_usdc, landed_local);
        let sig = self.sign(&quote, &self.anchors[idx].signing);
        (quote, sig)
    }

    /// A stand-in recipient hash (sha256 of recipient details in the real app).
    pub fn recipient_hash(&self) -> BytesN<32> {
        BytesN::from_array(&self.env, &[9u8; 32])
    }

    pub fn now(&self) -> u64 {
        self.env.ledger().timestamp()
    }

    /// Move the ledger clock forward.
    pub fn advance(&self, seconds: u64) {
        self.env.ledger().set_timestamp(self.now() + seconds);
    }

    /// Set the oracle MXN price with the current time as its timestamp.
    pub fn set_price(&self, price: i128) {
        self.oracle
            .set(&Asset::Other(asset_code()), &price, &self.now());
    }

    pub fn balance(&self, who: &Address) -> i128 {
        self.token.balance(who)
    }
}
