//! RateRace: remittance auction + escrow contract.
//! Placeholder so the workspace builds. The real interface lands in issue #3.
#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct RateRaceContract;

#[contractimpl]
impl RateRaceContract {
    pub fn ping(_env: Env) -> Symbol {
        symbol_short!("raterace")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn ping_works() {
        let env = Env::default();
        let id = env.register(RateRaceContract, ());
        let client = RateRaceContractClient::new(&env, &id);
        assert_eq!(client.ping(), symbol_short!("raterace"));
    }
}
