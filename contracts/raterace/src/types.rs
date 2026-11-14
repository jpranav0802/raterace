//! FROZEN: docs/BUILD_PLAN.md section 4.5. Do not change without team agreement (4.11).
//! Amounts are i128 with 7 decimals (1 USDC = 10_000_000). Times are unix seconds.
use soroban_sdk::{contracttype, Address, BytesN, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    /// USDC Stellar Asset Contract.
    pub usdc: Address,
    /// Reflector-compatible oracle (our mock on testnet).
    pub oracle: Address,
    /// Reject oracle prices older than this (e.g. 600).
    pub max_oracle_age_s: u64,
    /// Time the anchor has to pay out after `open_order` (demo 120).
    pub payout_window_s: u64,
    /// Time the sender has to dispute after `mark_paid` (demo 60).
    pub challenge_window_s: u64,
    /// Bond reserved per order, in bps of send_usdc (10500 = 105%). Must be >= 10000 + penalty_bps.
    pub bond_ratio_bps: u32,
    /// Penalty paid to the sender from the bond when the anchor fails (500 = 5%).
    pub penalty_bps: u32,
    /// Hard cap on markup vs the oracle rate (300 = 3%).
    pub default_max_markup_bps: u32,
    /// Daily sending cap for senders with no explicit limit.
    pub default_daily_cap: i128,
    /// Anchor is auto-suspended when its slashed count reaches this (1 = after one slash).
    pub max_slashes: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Anchor {
    /// ed25519 public key used ONLY to sign quotes.
    pub signing_key: BytesN<32>,
    /// Corridors this anchor may serve, e.g. MX_SPEI.
    pub corridors: Vec<Symbol>,
    /// Total USDC bonded.
    pub bond: i128,
    /// Part of the bond locked by unfinished orders.
    pub reserved: i128,
    pub filled: u32,
    pub disputed: u32,
    pub slashed: u32,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Quote {
    pub anchor: Address,
    /// Single use (replay protection).
    pub request_id: BytesN<32>,
    pub corridor: Symbol,
    /// Local currency code for the oracle lookup, e.g. MXN.
    pub asset_code: Symbol,
    pub send_usdc: i128,
    /// What the recipient receives AFTER all fees, in local currency (7 decimals).
    pub landed_local: i128,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Open,
    Paid,
    Disputed,
    Settled,
    Refunded,
    Slashed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub id: u64,
    pub sender: Address,
    pub quote: Quote,
    /// sha256 of the recipient details. Never raw personal data.
    pub recipient_hash: BytesN<32>,
    pub status: Status,
    pub reserved_bond: i128,
    pub opened_at: u64,
    pub payout_deadline: u64,
    /// 0 until `mark_paid`.
    pub challenge_ends: u64,
    /// sha256 of the anchor's payout receipt.
    pub payout_ref: Option<BytesN<32>>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SenderLimit {
    pub tier: u32,
    pub daily_cap: i128,
}
