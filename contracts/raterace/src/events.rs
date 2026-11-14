//! Contract events. FROZEN: docs/BUILD_PLAN.md section 4.9.
//! On-chain shape: topics = [event name (snake_case symbol), the #[topic] field],
//! data = map of the remaining fields. No personal data, ever.
use soroban_sdk::{contractevent, Address, BytesN, Env, Symbol, Vec};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registered {
    #[topic]
    pub anchor: Address,
    pub corridors: Vec<Symbol>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AnchorActive {
    #[topic]
    pub anchor: Address,
    pub active: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BondAdded {
    #[topic]
    pub anchor: Address,
    pub amount: i128,
    pub bond: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BondWithdrawn {
    #[topic]
    pub anchor: Address,
    pub amount: i128,
    pub bond: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Awarded {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
    pub sender: Address,
    pub send_usdc: i128,
    pub landed_local: i128,
    pub corridor: Symbol,
    pub payout_deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paid {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
    pub payout_ref: BytesN<32>,
    pub challenge_ends: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Confirmed {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Released {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Disputed {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolved {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
    pub anchor_at_fault: bool,
    pub penalty: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub order_id: u64,
    pub anchor: Address,
    pub refund: i128,
    pub penalty: i128,
}

// ---------- emit helpers (use these from the modules) ----------

pub fn emit_registered(env: &Env, anchor: &Address, corridors: &Vec<Symbol>) {
    Registered {
        anchor: anchor.clone(),
        corridors: corridors.clone(),
    }
    .publish(env);
}

pub fn emit_anchor_active(env: &Env, anchor: &Address, active: bool) {
    AnchorActive {
        anchor: anchor.clone(),
        active,
    }
    .publish(env);
}

pub fn emit_bond_added(env: &Env, anchor: &Address, amount: i128, bond: i128) {
    BondAdded {
        anchor: anchor.clone(),
        amount,
        bond,
    }
    .publish(env);
}

pub fn emit_bond_withdrawn(env: &Env, anchor: &Address, amount: i128, bond: i128) {
    BondWithdrawn {
        anchor: anchor.clone(),
        amount,
        bond,
    }
    .publish(env);
}

#[allow(clippy::too_many_arguments)]
pub fn emit_awarded(
    env: &Env,
    order_id: u64,
    anchor: &Address,
    sender: &Address,
    send_usdc: i128,
    landed_local: i128,
    corridor: &Symbol,
    payout_deadline: u64,
) {
    Awarded {
        order_id,
        anchor: anchor.clone(),
        sender: sender.clone(),
        send_usdc,
        landed_local,
        corridor: corridor.clone(),
        payout_deadline,
    }
    .publish(env);
}

pub fn emit_paid(
    env: &Env,
    order_id: u64,
    anchor: &Address,
    payout_ref: &BytesN<32>,
    challenge_ends: u64,
) {
    Paid {
        order_id,
        anchor: anchor.clone(),
        payout_ref: payout_ref.clone(),
        challenge_ends,
    }
    .publish(env);
}

pub fn emit_confirmed(env: &Env, order_id: u64, anchor: &Address) {
    Confirmed {
        order_id,
        anchor: anchor.clone(),
    }
    .publish(env);
}

pub fn emit_released(env: &Env, order_id: u64, anchor: &Address) {
    Released {
        order_id,
        anchor: anchor.clone(),
    }
    .publish(env);
}

pub fn emit_disputed(env: &Env, order_id: u64, anchor: &Address) {
    Disputed {
        order_id,
        anchor: anchor.clone(),
    }
    .publish(env);
}

pub fn emit_resolved(
    env: &Env,
    order_id: u64,
    anchor: &Address,
    anchor_at_fault: bool,
    penalty: i128,
) {
    Resolved {
        order_id,
        anchor: anchor.clone(),
        anchor_at_fault,
        penalty,
    }
    .publish(env);
}

pub fn emit_refunded(env: &Env, order_id: u64, anchor: &Address, refund: i128, penalty: i128) {
    Refunded {
        order_id,
        anchor: anchor.clone(),
        refund,
        penalty,
    }
    .publish(env);
}
