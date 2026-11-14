//! Storage keys and helpers. FROZEN: docs/BUILD_PLAN.md section 4.8.
//! Modules use these helpers instead of touching `env.storage()` directly.
use soroban_sdk::{contracttype, Address, BytesN, Env, Vec};

use crate::errors::Error;
use crate::types::{Anchor, Config, Order, SenderLimit};

/// ~5 s per ledger.
pub const DAY_LEDGERS: u32 = 17_280;
const PERSISTENT_THRESHOLD: u32 = DAY_LEDGERS;
const PERSISTENT_EXTEND: u32 = 30 * DAY_LEDGERS;
const TEMP_THRESHOLD: u32 = DAY_LEDGERS;
const TEMP_EXTEND: u32 = 2 * DAY_LEDGERS;
const SECONDS_PER_DAY: u64 = 86_400;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// instance
    Config,
    /// instance, u64, next id to hand out (starts at 1)
    NextOrderId,
    /// persistent, Vec<Address>
    AnchorList,
    /// persistent
    Anchor(Address),
    /// persistent
    Order(u64),
    /// persistent
    SenderLimit(Address),
    /// temporary, i128 spent; u64 = unix day (timestamp / 86400)
    SenderDay(Address, u64),
    /// temporary, bool
    RequestId(BytesN<32>),
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_THRESHOLD, PERSISTENT_EXTEND);
}

fn bump_temporary(env: &Env, key: &DataKey) {
    env.storage()
        .temporary()
        .extend_ttl(key, TEMP_THRESHOLD, TEMP_EXTEND);
}

// ---------- config ----------

pub fn has_config(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

pub fn config(env: &Env) -> Result<Config, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)
}

pub fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
    bump_instance(env);
}

// ---------- anchors ----------

pub fn anchor_exists(env: &Env, anchor: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Anchor(anchor.clone()))
}

pub fn load_anchor(env: &Env, anchor: &Address) -> Result<Anchor, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Anchor(anchor.clone()))
        .ok_or(Error::AnchorNotFound)
}

pub fn save_anchor(env: &Env, anchor: &Address, data: &Anchor) {
    let key = DataKey::Anchor(anchor.clone());
    env.storage().persistent().set(&key, data);
    bump_persistent(env, &key);
    bump_instance(env);
}

pub fn anchor_ids(env: &Env) -> Vec<Address> {
    env.storage()
        .persistent()
        .get(&DataKey::AnchorList)
        .unwrap_or_else(|| Vec::new(env))
}

pub fn push_anchor_id(env: &Env, anchor: &Address) {
    let mut ids = anchor_ids(env);
    ids.push_back(anchor.clone());
    env.storage().persistent().set(&DataKey::AnchorList, &ids);
    bump_persistent(env, &DataKey::AnchorList);
}

// ---------- orders ----------

/// Returns the next order id (1, 2, 3, ...) and advances the counter.
pub fn next_order_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextOrderId)
        .unwrap_or(1);
    env.storage().instance().set(&DataKey::NextOrderId, &(id + 1));
    id
}

pub fn load_order(env: &Env, id: u64) -> Result<Order, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Order(id))
        .ok_or(Error::OrderNotFound)
}

pub fn save_order(env: &Env, order: &Order) {
    let key = DataKey::Order(order.id);
    env.storage().persistent().set(&key, order);
    bump_persistent(env, &key);
    bump_instance(env);
}

// ---------- replay protection ----------

pub fn is_request_used(env: &Env, request_id: &BytesN<32>) -> bool {
    env.storage()
        .temporary()
        .has(&DataKey::RequestId(request_id.clone()))
}

pub fn mark_request_used(env: &Env, request_id: &BytesN<32>) {
    let key = DataKey::RequestId(request_id.clone());
    env.storage().temporary().set(&key, &true);
    bump_temporary(env, &key);
}

// ---------- sender limits ----------

/// The sender's limit, or `{ tier: 0, daily_cap: default }` if none was set.
pub fn sender_limit(env: &Env, sender: &Address, default_daily_cap: i128) -> SenderLimit {
    env.storage()
        .persistent()
        .get(&DataKey::SenderLimit(sender.clone()))
        .unwrap_or(SenderLimit {
            tier: 0,
            daily_cap: default_daily_cap,
        })
}

pub fn set_sender_limit(env: &Env, sender: &Address, limit: &SenderLimit) {
    let key = DataKey::SenderLimit(sender.clone());
    env.storage().persistent().set(&key, limit);
    bump_persistent(env, &key);
}

fn sender_day_key(env: &Env, sender: &Address) -> DataKey {
    DataKey::SenderDay(sender.clone(), env.ledger().timestamp() / SECONDS_PER_DAY)
}

/// USDC the sender has sent today (UTC day).
pub fn sender_spent_today(env: &Env, sender: &Address) -> i128 {
    env.storage()
        .temporary()
        .get(&sender_day_key(env, sender))
        .unwrap_or(0)
}

pub fn add_sender_spent(env: &Env, sender: &Address, amount: i128) -> Result<(), Error> {
    let key = sender_day_key(env, sender);
    let spent = sender_spent_today(env, sender)
        .checked_add(amount)
        .ok_or(Error::Overflow)?;
    env.storage().temporary().set(&key, &spent);
    bump_temporary(env, &key);
    Ok(())
}
