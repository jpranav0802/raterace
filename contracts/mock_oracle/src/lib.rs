//! Mock oracle with the same read interface as Reflector (SEP-40).
//! Function list is FROZEN: docs/BUILD_PLAN.md section 4.4.
//!
//! Testnet stand-in for the Reflector fiat feed. The admin sets prices by hand;
//! `set_price_at` lets the demo show the RateRace contract rejecting a stale price.
//! Prices have 14 decimals (USD per 1 unit of the asset); timestamps are unix seconds.
#![no_std]
use oracle_interface::{Asset, PriceData};
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum OracleError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidPrice = 3,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Assets,
    Price(Asset),
}

#[contract]
pub struct MockOracle;

fn admin(env: &Env) -> Result<Address, OracleError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(OracleError::NotInitialized)
}

fn store(env: &Env, asset: Asset, price: i128, timestamp: u64) -> Result<(), OracleError> {
    admin(env)?.require_auth();
    if price <= 0 {
        return Err(OracleError::InvalidPrice);
    }
    let key = DataKey::Price(asset.clone());
    if !env.storage().persistent().has(&key) {
        let mut assets: Vec<Asset> = env
            .storage()
            .persistent()
            .get(&DataKey::Assets)
            .unwrap_or_else(|| Vec::new(env));
        assets.push_back(asset);
        env.storage().persistent().set(&DataKey::Assets, &assets);
    }
    env.storage()
        .persistent()
        .set(&key, &PriceData { price, timestamp });
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Assets, TTL_THRESHOLD, TTL_EXTEND);
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
    Ok(())
}

#[contractimpl]
impl MockOracle {
    /// Store the admin. Callable once. Auth: `admin`.
    pub fn init(env: Env, admin: Address) -> Result<(), OracleError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(OracleError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Admin only. Stores `price` with timestamp = current ledger time.
    pub fn set_price(env: Env, asset: Asset, price: i128) -> Result<(), OracleError> {
        let now = env.ledger().timestamp();
        store(&env, asset, price, now)
    }

    /// Admin only. Stores `price` with the given timestamp (stale-price demo).
    pub fn set_price_at(
        env: Env,
        asset: Asset,
        price: i128,
        timestamp: u64,
    ) -> Result<(), OracleError> {
        store(&env, asset, price, timestamp)
    }

    /// `None` if the asset has never been priced.
    pub fn lastprice(env: Env, asset: Asset) -> Option<PriceData> {
        env.storage().persistent().get(&DataKey::Price(asset))
    }

    /// Always 14 (same as Reflector fiat feeds).
    pub fn decimals(_env: Env) -> u32 {
        14
    }

    /// Always 300 seconds.
    pub fn resolution(_env: Env) -> u32 {
        300
    }

    /// Assets that have a price.
    pub fn assets(env: Env) -> Vec<Asset> {
        env.storage()
            .persistent()
            .get(&DataKey::Assets)
            .unwrap_or_else(|| Vec::new(&env))
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use oracle_interface::OracleClient;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Ledger},
        vec, Env,
    };

    const MXN_PRICE: i128 = 5_000_000_000_000; // 0.05 USD per MXN, 14 decimals

    fn setup() -> (Env, Address, MockOracleClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(1_800_000_000);
        let id = env.register(MockOracle, ());
        let client = MockOracleClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.init(&admin);
        (env, id, client)
    }

    fn mxn() -> Asset {
        Asset::Other(symbol_short!("MXN"))
    }

    #[test]
    fn constants_match_reflector_fiat_feed() {
        let (_env, _id, client) = setup();
        assert_eq!(client.decimals(), 14);
        assert_eq!(client.resolution(), 300);
    }

    #[test]
    fn lastprice_is_none_until_set() {
        let (_env, _id, client) = setup();
        assert_eq!(client.lastprice(&mxn()), None);
        assert_eq!(client.assets().len(), 0);
    }

    #[test]
    fn set_price_uses_ledger_time() {
        let (env, _id, client) = setup();
        client.set_price(&mxn(), &MXN_PRICE);
        assert_eq!(
            client.lastprice(&mxn()),
            Some(PriceData {
                price: MXN_PRICE,
                timestamp: 1_800_000_000
            })
        );
        assert_eq!(client.assets(), vec![&env, mxn()]);
    }

    #[test]
    fn set_price_at_stores_given_timestamp() {
        let (_env, _id, client) = setup();
        client.set_price_at(&mxn(), &MXN_PRICE, &1_799_990_000);
        assert_eq!(client.lastprice(&mxn()).unwrap().timestamp, 1_799_990_000);
    }

    #[test]
    fn updating_a_price_does_not_duplicate_the_asset() {
        let (env, _id, client) = setup();
        client.set_price(&mxn(), &MXN_PRICE);
        client.set_price(&mxn(), &(MXN_PRICE + 1));
        client.set_price(&Asset::Other(symbol_short!("BRL")), &17_800_000_000_000);
        assert_eq!(client.assets().len(), 2);
        assert_eq!(client.lastprice(&mxn()).unwrap().price, MXN_PRICE + 1);
        let _ = env;
    }

    #[test]
    fn rejects_bad_input() {
        let (_env, _id, client) = setup();
        assert_eq!(
            client.try_set_price(&mxn(), &0),
            Err(Ok(OracleError::InvalidPrice))
        );
        assert_eq!(
            client.try_set_price(&mxn(), &-5),
            Err(Ok(OracleError::InvalidPrice))
        );
    }

    #[test]
    fn init_twice_fails() {
        let (env, _id, client) = setup();
        assert_eq!(
            client.try_init(&Address::generate(&env)),
            Err(Ok(OracleError::AlreadyInitialized))
        );
    }

    #[test]
    fn only_admin_can_set_prices() {
        let (env, _id, client) = setup();
        env.set_auths(&[]);
        assert!(client.try_set_price(&mxn(), &MXN_PRICE).is_err());
        assert!(client.try_set_price_at(&mxn(), &MXN_PRICE, &1).is_err());
        assert_eq!(client.lastprice(&mxn()), None);
    }

    #[test]
    fn set_before_init_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(MockOracle, ());
        let client = MockOracleClient::new(&env, &id);
        assert_eq!(
            client.try_set_price(&mxn(), &MXN_PRICE),
            Err(Ok(OracleError::NotInitialized))
        );
    }

    /// The RateRace contract reads the oracle through `oracle_interface::OracleClient`.
    #[test]
    fn readable_through_the_shared_interface() {
        let (env, id, client) = setup();
        client.set_price(&mxn(), &MXN_PRICE);
        let shared = OracleClient::new(&env, &id);
        assert_eq!(shared.lastprice(&mxn()).unwrap().price, MXN_PRICE);
        assert_eq!(shared.decimals(), 14);
        assert_eq!(shared.resolution(), 300);
        assert_eq!(shared.assets().len(), 1);
    }
}
