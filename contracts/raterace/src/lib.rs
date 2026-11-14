//! RateRace: every remittance becomes a live auction.
//!
//! Anchors sign quotes for the exact amount the family receives. This contract
//! verifies the signature on-chain, checks the markup against an oracle, holds the
//! sender's USDC in escrow, reserves part of the anchor's bond, pays the anchor only
//! after it reports the payout, and refunds the sender plus a penalty if it fails.
//!
//! The public interface below is FROZEN: docs/BUILD_PLAN.md section 4.7.
//! This file only forwards to the modules:
//!   registry.rs (Pranav)  config, anchors, bonds, sender limits, quote_digest
//!   orders.rs   (Abhiraj) open_order
//!   settle.rs   (Avani)   mark_paid, confirm, release, dispute, resolve, refund_expired
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol, Vec};

pub mod errors;
pub mod events;
pub mod orders;
pub mod registry;
pub mod settle;
pub mod storage;
pub mod types;

#[cfg(test)]
mod test;

pub use errors::Error;
pub use types::{Anchor, Config, Order, Quote, SenderLimit, Status};

#[contract]
pub struct RateRaceContract;

#[contractimpl]
impl RateRaceContract {
    // ---------- setup (registry.rs) ----------

    /// One-time setup. Auth: `config.admin`.
    pub fn init(env: Env, config: Config) -> Result<(), Error> {
        registry::init(&env, config)
    }

    /// Replace the config (e.g. demo time windows). Auth: current admin.
    pub fn update_config(env: Env, config: Config) -> Result<(), Error> {
        registry::update_config(&env, config)
    }

    // ---------- anchors (registry.rs) ----------

    /// Register as an anchor (inactive until the admin approves). Auth: `anchor`.
    pub fn register_anchor(
        env: Env,
        anchor: Address,
        signing_key: BytesN<32>,
        corridors: Vec<Symbol>,
    ) -> Result<(), Error> {
        registry::register_anchor(&env, anchor, signing_key, corridors)
    }

    /// Approve or suspend an anchor. Auth: admin.
    pub fn set_active(env: Env, anchor: Address, active: bool) -> Result<(), Error> {
        registry::set_active(&env, anchor, active)
    }

    /// Deposit USDC into the anchor's bond. Auth: `anchor`.
    pub fn add_bond(env: Env, anchor: Address, amount: i128) -> Result<(), Error> {
        registry::add_bond(&env, anchor, amount)
    }

    /// Withdraw unreserved bond. Auth: `anchor`.
    pub fn withdraw_bond(env: Env, anchor: Address, amount: i128) -> Result<(), Error> {
        registry::withdraw_bond(&env, anchor, amount)
    }

    /// Set a sender's tier and daily cap (stand-in for KYC tiers). Auth: admin.
    pub fn set_sender_limit(
        env: Env,
        sender: Address,
        tier: u32,
        daily_cap: i128,
    ) -> Result<(), Error> {
        registry::set_sender_limit(&env, sender, tier, daily_cap)
    }

    /// sha256 of the quote's XDR. Anchors sign exactly these 32 bytes.
    /// Off-chain code gets them by simulating this function (never re-encode in JS).
    pub fn quote_digest(env: Env, quote: Quote) -> BytesN<32> {
        registry::quote_digest(&env, &quote)
    }

    // ---------- orders (orders.rs) ----------

    /// Accept a signed quote: verify it, check markup vs the oracle, escrow the
    /// sender's USDC and reserve the anchor's bond. Returns the order id. Auth: `sender`.
    pub fn open_order(
        env: Env,
        sender: Address,
        quote: Quote,
        signature: BytesN<64>,
        recipient_hash: BytesN<32>,
        max_markup_bps: u32,
    ) -> Result<u64, Error> {
        orders::open_order(&env, sender, quote, signature, recipient_hash, max_markup_bps)
    }

    // ---------- settlement (settle.rs) ----------

    /// Anchor reports the payout and receives the escrowed USDC. Auth: `anchor`.
    pub fn mark_paid(
        env: Env,
        anchor: Address,
        order_id: u64,
        payout_ref: BytesN<32>,
    ) -> Result<(), Error> {
        settle::mark_paid(&env, anchor, order_id, payout_ref)
    }

    /// Sender confirms the money arrived; releases the bond. Auth: order sender.
    pub fn confirm(env: Env, order_id: u64) -> Result<(), Error> {
        settle::confirm(&env, order_id)
    }

    /// Anyone: release the bond once the challenge window has passed.
    pub fn release(env: Env, order_id: u64) -> Result<(), Error> {
        settle::release(&env, order_id)
    }

    /// Sender reports a problem within the challenge window. Auth: order sender.
    pub fn dispute(env: Env, order_id: u64) -> Result<(), Error> {
        settle::dispute(&env, order_id)
    }

    /// Admin decides a dispute. At fault: sender repaid + penalty from the bond.
    pub fn resolve(env: Env, order_id: u64, anchor_at_fault: bool) -> Result<(), Error> {
        settle::resolve(&env, order_id, anchor_at_fault)
    }

    /// Anyone: after a missed payout deadline, refund the sender + penalty from the bond.
    pub fn refund_expired(env: Env, order_id: u64) -> Result<(), Error> {
        settle::refund_expired(&env, order_id)
    }

    // ---------- read-only ----------

    pub fn get_config(env: Env) -> Result<Config, Error> {
        storage::config(&env)
    }

    pub fn get_anchor(env: Env, anchor: Address) -> Result<Anchor, Error> {
        storage::load_anchor(&env, &anchor)
    }

    pub fn list_anchor_ids(env: Env) -> Vec<Address> {
        storage::anchor_ids(&env)
    }

    pub fn get_sender_limit(env: Env, sender: Address) -> Result<SenderLimit, Error> {
        registry::get_sender_limit(&env, sender)
    }

    pub fn get_order(env: Env, order_id: u64) -> Result<Order, Error> {
        storage::load_order(&env, order_id)
    }
}
