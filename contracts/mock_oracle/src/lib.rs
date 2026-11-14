//! Mock oracle with the same read interface as Reflector (SEP-40).
//! Owner: Abhiraj (issue #4). Function list is FROZEN: docs/BUILD_PLAN.md section 4.4.
//! This is a compiling stub: every body is `todo!()` until #4 is implemented.
#![no_std]
use oracle_interface::{Asset, PriceData};
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    /// Store the admin. Callable once.
    pub fn init(_env: Env, _admin: Address) {
        todo!("owner: Abhiraj, issue #4")
    }

    /// Admin only. Stores `price` with timestamp = current ledger time.
    pub fn set_price(_env: Env, _asset: Asset, _price: i128) {
        todo!("owner: Abhiraj, issue #4")
    }

    /// Admin only. Stores `price` with the given timestamp (stale-price demo).
    pub fn set_price_at(_env: Env, _asset: Asset, _price: i128, _timestamp: u64) {
        todo!("owner: Abhiraj, issue #4")
    }

    /// `None` if the asset has never been priced.
    pub fn lastprice(_env: Env, _asset: Asset) -> Option<PriceData> {
        todo!("owner: Abhiraj, issue #4")
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
    pub fn assets(_env: Env) -> Vec<Asset> {
        todo!("owner: Abhiraj, issue #4")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn decimals_is_14() {
        let env = Env::default();
        let id = env.register(MockOracle, ());
        let client = MockOracleClient::new(&env, &id);
        assert_eq!(client.decimals(), 14);
        assert_eq!(client.resolution(), 300);
    }
}
