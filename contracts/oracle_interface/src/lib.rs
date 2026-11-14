//! Reflector-compatible (SEP-40) oracle interface.
//! FROZEN: see docs/BUILD_PLAN.md section 4.4. Do not change without team agreement.
//! The RateRace contract talks to the oracle only through `OracleClient`,
//! so the real Reflector feed can replace our mock by changing one address.
#![no_std]
use soroban_sdk::{contractclient, contracttype, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    /// Price with `decimals()` decimals (14 for fiat feeds). USD per 1 unit of the asset.
    pub price: i128,
    /// Unix seconds in our mock. (Reflector's unit is checked in issue #4.)
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait Oracle {
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
    fn decimals(env: Env) -> u32;
    fn resolution(env: Env) -> u32;
    fn assets(env: Env) -> Vec<Asset>;
}
