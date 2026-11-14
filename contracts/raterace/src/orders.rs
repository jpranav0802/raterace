//! open_order. Owner: Abhiraj (issue #6).
//! Follow the 13 steps in docs/BUILD_PLAN.md section 7 (#6), in that order.
//! Helpers you need: storage::*, events::emit_awarded, registry::quote_digest,
//! oracle_interface::{Asset, OracleClient}, soroban_sdk::token::Client.
#![allow(unused_variables)] // remove when implemented

use soroban_sdk::{Address, BytesN, Env};

use crate::errors::Error;
use crate::types::Quote;

pub fn open_order(
    env: &Env,
    sender: Address,
    quote: Quote,
    signature: BytesN<64>,
    recipient_hash: BytesN<32>,
    max_markup_bps: u32,
) -> Result<u64, Error> {
    todo!("owner: Abhiraj, issue #6")
}
