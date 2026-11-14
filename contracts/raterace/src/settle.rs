//! Settlement. Owner: Avani (issue #8).
//! Follow docs/BUILD_PLAN.md section 8 (#8) and the money rules in section 4.7.
//! Helpers you need: storage::*, events::emit_*, soroban_sdk::token::Client.
#![allow(unused_variables)] // remove when implemented

use soroban_sdk::{Address, BytesN, Env};

use crate::errors::Error;

pub fn mark_paid(
    env: &Env,
    anchor: Address,
    order_id: u64,
    payout_ref: BytesN<32>,
) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}

pub fn confirm(env: &Env, order_id: u64) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}

pub fn release(env: &Env, order_id: u64) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}

pub fn dispute(env: &Env, order_id: u64) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}

pub fn resolve(env: &Env, order_id: u64, anchor_at_fault: bool) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}

pub fn refund_expired(env: &Env, order_id: u64) -> Result<(), Error> {
    todo!("owner: Avani, issue #8")
}
