//! Settlement. Owner: Avani (issue #8).
//! Follow docs/BUILD_PLAN.md section 8 (#8) and the money rules in section 4.7.
//! Helpers you need: storage::*, events::emit_*, soroban_sdk::token::Client.

use soroban_sdk::{token, Address, BytesN, Env};

use crate::errors::Error;
use crate::events;
use crate::storage;
use crate::types::{Anchor, Config, Order, Status};

/// The anchor says "I paid the family". It gets the escrowed USDC, and its bond
/// stays locked for the challenge window in case the sender reports a problem.
pub fn mark_paid(
    env: &Env,
    anchor: Address,
    order_id: u64,
    payout_ref: BytesN<32>,
) -> Result<(), Error> {
    // 1. Who is asking: the anchor must have signed.
    anchor.require_auth();

    // 2. Load what we need.
    let cfg = storage::config(env)?;
    let mut order = storage::load_order(env, order_id)?;

    // 3. Checks: right anchor, right status, still on time.
    if order.quote.anchor != anchor {
        return Err(Error::NotOrderAnchor);
    }
    if order.status != Status::Open {
        return Err(Error::WrongStatus);
    }
    let now = env.ledger().timestamp();
    if now > order.payout_deadline {
        return Err(Error::DeadlinePassed);
    }

    // 4. Move money: escrow (contract) -> anchor.
    token::Client::new(env, &cfg.usdc).transfer(
        &env.current_contract_address(),
        &anchor,
        &order.quote.send_usdc,
    );

    // 5. Update the anchor and the order, then save both.
    let mut anchor_data = storage::load_anchor(env, &anchor)?;
    anchor_data.filled = anchor_data.filled.checked_add(1).ok_or(Error::Overflow)?;

    let challenge_ends = now
        .checked_add(cfg.challenge_window_s)
        .ok_or(Error::Overflow)?;
    order.status = Status::Paid;
    order.payout_ref = Some(payout_ref.clone());
    order.challenge_ends = challenge_ends;

    storage::save_anchor(env, &anchor, &anchor_data);
    storage::save_order(env, &order);

    // 6. Tell the outside world (indexer, tracker page).
    events::emit_paid(env, order_id, &anchor, &payout_ref, challenge_ends);
    Ok(())
}

/// Unlocks the part of the anchor's bond that this order was holding.
/// Called once when an order finishes (Settled, Refunded or Slashed).
fn unlock_bond(env: &Env, order: &Order) -> Result<(), Error> {
    let mut anchor_data = storage::load_anchor(env, &order.quote.anchor)?;
    anchor_data.reserved = anchor_data
        .reserved
        .checked_sub(order.reserved_bond)
        .ok_or(Error::Overflow)?;
    storage::save_anchor(env, &order.quote.anchor, &anchor_data);
    Ok(())
}

/// The sender says "the money arrived". The order is done and the anchor's bond unlocks.
pub fn confirm(env: &Env, order_id: u64) -> Result<(), Error> {
    let mut order = storage::load_order(env, order_id)?;
    // Only the sender can confirm.
    order.sender.require_auth();
    if order.status != Status::Paid {
        return Err(Error::WrongStatus);
    }
    unlock_bond(env, &order)?;
    order.status = Status::Settled;
    storage::save_order(env, &order);
    events::emit_confirmed(env, order_id, &order.quote.anchor);
    Ok(())
}

/// Nobody reported a problem before the challenge window closed, so anyone can
/// finish the order. Same result as `confirm`, triggered by time instead of the sender.
pub fn release(env: &Env, order_id: u64) -> Result<(), Error> {
    let mut order = storage::load_order(env, order_id)?;
    if order.status != Status::Paid {
        return Err(Error::WrongStatus);
    }
    if env.ledger().timestamp() <= order.challenge_ends {
        return Err(Error::ChallengeWindowOpen);
    }
    unlock_bond(env, &order)?;
    order.status = Status::Settled;
    storage::save_order(env, &order);
    events::emit_released(env, order_id, &order.quote.anchor);
    Ok(())
}

/// penalty = send_usdc * penalty_bps / 10000  (5% in the demo: $10 on $200).
fn penalty(cfg: &Config, order: &Order) -> Result<i128, Error> {
    order
        .quote
        .send_usdc
        .checked_mul(cfg.penalty_bps as i128)
        .and_then(|x| x.checked_div(10_000))
        .ok_or(Error::Overflow)
}

/// Counts a slash against the anchor and suspends it once it reaches `max_slashes`.
/// The caller saves the anchor afterwards.
fn apply_slash(env: &Env, cfg: &Config, addr: &Address, anchor_data: &mut Anchor) -> Result<(), Error> {
    anchor_data.slashed = anchor_data.slashed.checked_add(1).ok_or(Error::Overflow)?;
    if anchor_data.slashed >= cfg.max_slashes && anchor_data.active {
        anchor_data.active = false;
        events::emit_anchor_active(env, addr, false);
    }
    Ok(())
}

/// The sender says "the money never arrived", inside the challenge window.
/// The order freezes until the admin resolves it; the anchor's bond stays locked.
pub fn dispute(env: &Env, order_id: u64) -> Result<(), Error> {
    let mut order = storage::load_order(env, order_id)?;
    order.sender.require_auth();
    if order.status != Status::Paid {
        return Err(Error::WrongStatus);
    }
    if env.ledger().timestamp() > order.challenge_ends {
        return Err(Error::ChallengeWindowClosed);
    }

    let mut anchor_data = storage::load_anchor(env, &order.quote.anchor)?;
    anchor_data.disputed = anchor_data.disputed.checked_add(1).ok_or(Error::Overflow)?;
    order.status = Status::Disputed;

    storage::save_anchor(env, &order.quote.anchor, &anchor_data);
    storage::save_order(env, &order);
    events::emit_disputed(env, order_id, &order.quote.anchor);
    Ok(())
}

/// The admin decides a dispute.
/// At fault: the anchor was already paid, so the sender's refund + penalty comes out of
/// the anchor's bond; the anchor is slashed (and suspended). Not at fault: order settles.
pub fn resolve(env: &Env, order_id: u64, anchor_at_fault: bool) -> Result<(), Error> {
    let cfg = storage::config(env)?;
    cfg.admin.require_auth();
    let mut order = storage::load_order(env, order_id)?;
    if order.status != Status::Disputed {
        return Err(Error::WrongStatus);
    }

    if !anchor_at_fault {
        unlock_bond(env, &order)?;
        order.status = Status::Settled;
        storage::save_order(env, &order);
        events::emit_resolved(env, order_id, &order.quote.anchor, false, 0);
        return Ok(());
    }

    let penalty = penalty(&cfg, &order)?;
    let refund = order
        .quote
        .send_usdc
        .checked_add(penalty)
        .ok_or(Error::Overflow)?;

    // Money: contract (from the bond) -> sender.
    token::Client::new(env, &cfg.usdc).transfer(
        &env.current_contract_address(),
        &order.sender,
        &refund,
    );

    let addr = order.quote.anchor.clone();
    let mut anchor_data = storage::load_anchor(env, &addr)?;
    anchor_data.bond = anchor_data.bond.checked_sub(refund).ok_or(Error::Overflow)?;
    anchor_data.reserved = anchor_data
        .reserved
        .checked_sub(order.reserved_bond)
        .ok_or(Error::Overflow)?;
    apply_slash(env, &cfg, &addr, &mut anchor_data)?;
    order.status = Status::Slashed;

    storage::save_anchor(env, &addr, &anchor_data);
    storage::save_order(env, &order);
    events::emit_resolved(env, order_id, &addr, true, penalty);
    Ok(())
}

/// The anchor missed the payout deadline. Anyone can trigger this: the sender gets
/// their escrowed USDC back plus a penalty taken from the anchor's bond, and the
/// anchor is slashed (and suspended).
pub fn refund_expired(env: &Env, order_id: u64) -> Result<(), Error> {
    let cfg = storage::config(env)?;
    let mut order = storage::load_order(env, order_id)?;
    if order.status != Status::Open {
        return Err(Error::WrongStatus);
    }
    if env.ledger().timestamp() <= order.payout_deadline {
        return Err(Error::DeadlineNotPassed);
    }

    let penalty = penalty(&cfg, &order)?;
    let refund = order
        .quote
        .send_usdc
        .checked_add(penalty)
        .ok_or(Error::Overflow)?;

    // Money: contract -> sender (the escrowed send_usdc + penalty from the bond).
    token::Client::new(env, &cfg.usdc).transfer(
        &env.current_contract_address(),
        &order.sender,
        &refund,
    );

    let addr = order.quote.anchor.clone();
    let mut anchor_data = storage::load_anchor(env, &addr)?;
    anchor_data.bond = anchor_data.bond.checked_sub(penalty).ok_or(Error::Overflow)?;
    anchor_data.reserved = anchor_data
        .reserved
        .checked_sub(order.reserved_bond)
        .ok_or(Error::Overflow)?;
    apply_slash(env, &cfg, &addr, &mut anchor_data)?;
    order.status = Status::Refunded;

    storage::save_anchor(env, &addr, &anchor_data);
    storage::save_order(env, &order);
    events::emit_refunded(env, order_id, &addr, refund, penalty);
    Ok(())
}
