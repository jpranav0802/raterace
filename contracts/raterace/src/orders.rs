//! open_order: accept a signed quote and lock the money.
//! Steps follow docs/BUILD_PLAN.md section 7 (#6), in order. Cheap checks come first;
//! nothing is written or moved until every check has passed (a failed call reverts anyway).
use oracle_interface::{Asset, OracleClient};
use soroban_sdk::{token, Address, Bytes, BytesN, Env};

use crate::errors::Error;
use crate::events;
use crate::registry;
use crate::storage;
use crate::types::{Order, Quote, Status};

const BPS: i128 = 10_000;

pub fn open_order(
    env: &Env,
    sender: Address,
    quote: Quote,
    signature: BytesN<64>,
    recipient_hash: BytesN<32>,
    max_markup_bps: u32,
) -> Result<u64, Error> {
    // 1. Only the sender can spend the sender's money.
    sender.require_auth();

    let cfg = storage::config(env)?;

    // 2. Sane amounts.
    if quote.send_usdc <= 0 || quote.landed_local <= 0 {
        return Err(Error::InvalidAmount);
    }

    // 3. The anchor must be registered, approved and allowed on this corridor.
    let mut anchor = storage::load_anchor(env, &quote.anchor)?;
    if !anchor.active {
        return Err(Error::AnchorInactive);
    }
    if !anchor.corridors.contains(&quote.corridor) {
        return Err(Error::CorridorNotAllowed);
    }

    // 4. The quote must still be valid.
    let now = env.ledger().timestamp();
    if quote.expires_at <= now {
        return Err(Error::QuoteExpired);
    }

    // 5. Each quote can be used once (replay protection).
    if storage::is_request_used(env, &quote.request_id) {
        return Err(Error::RequestIdUsed);
    }

    // 6. The quote must really come from this anchor and be unaltered: verify the anchor's
    //    ed25519 signature over sha256(quote). A bad signature aborts the whole call.
    let digest: Bytes = registry::quote_digest(env, &quote).into();
    env.crypto()
        .ed25519_verify(&anchor.signing_key, &digest, &signature);

    // 7. Market rate from the oracle. No price or a stale price means no deal.
    let oracle = OracleClient::new(env, &cfg.oracle);
    let price = oracle
        .lastprice(&Asset::Other(quote.asset_code.clone()))
        .ok_or(Error::OracleUnavailable)?;
    if price.price <= 0 {
        return Err(Error::OracleUnavailable);
    }
    if now.saturating_sub(price.timestamp) > cfg.max_oracle_age_s {
        return Err(Error::OracleStale);
    }

    // 8. Markup check: how far below the market rate does this offer land, all fees included?
    //    landed_usd = landed_local * price / 10^decimals
    //    markup_bps = (send_usdc - landed_usd) * 10000 / send_usdc   (negative = better than market)
    let scale = 10i128
        .checked_pow(oracle.decimals())
        .ok_or(Error::Overflow)?;
    let landed_usd = quote
        .landed_local
        .checked_mul(price.price)
        .and_then(|x| x.checked_div(scale))
        .ok_or(Error::Overflow)?;
    let markup_bps = quote
        .send_usdc
        .checked_sub(landed_usd)
        .and_then(|x| x.checked_mul(BPS))
        .and_then(|x| x.checked_div(quote.send_usdc))
        .ok_or(Error::Overflow)?;
    // The sender may ask for a tighter cap, never a looser one.
    let cap = max_markup_bps.min(cfg.default_max_markup_bps) as i128;
    if markup_bps > cap {
        return Err(Error::MarkupTooHigh);
    }

    // 9. Sender's daily limit (stand-in for KYC tiers).
    let limit = storage::sender_limit(env, &sender, cfg.default_daily_cap);
    let spent = storage::sender_spent_today(env, &sender)
        .checked_add(quote.send_usdc)
        .ok_or(Error::Overflow)?;
    if spent > limit.daily_cap {
        return Err(Error::DailyCapExceeded);
    }

    // 10. The anchor must have enough free bond to cover this order.
    let reserve = quote
        .send_usdc
        .checked_mul(cfg.bond_ratio_bps as i128)
        .and_then(|x| x.checked_div(BPS))
        .ok_or(Error::Overflow)?;
    let free = anchor
        .bond
        .checked_sub(anchor.reserved)
        .ok_or(Error::Overflow)?;
    if free < reserve {
        return Err(Error::InsufficientBond);
    }

    // ---- every check passed: record and move money ----

    storage::mark_request_used(env, &quote.request_id);
    storage::add_sender_spent(env, &sender, quote.send_usdc)?;

    anchor.reserved = anchor
        .reserved
        .checked_add(reserve)
        .ok_or(Error::Overflow)?;
    storage::save_anchor(env, &quote.anchor, &anchor);

    // Escrow: sender -> contract.
    token::Client::new(env, &cfg.usdc).transfer(
        &sender,
        &env.current_contract_address(),
        &quote.send_usdc,
    );

    let id = storage::next_order_id(env);
    let payout_deadline = now
        .checked_add(cfg.payout_window_s)
        .ok_or(Error::Overflow)?;
    let order = Order {
        id,
        sender: sender.clone(),
        quote: quote.clone(),
        recipient_hash,
        status: Status::Open,
        reserved_bond: reserve,
        opened_at: now,
        payout_deadline,
        challenge_ends: 0,
        payout_ref: None,
    };
    storage::save_order(env, &order);

    events::emit_awarded(
        env,
        id,
        &quote.anchor,
        &sender,
        quote.send_usdc,
        quote.landed_local,
        &quote.corridor,
        payout_deadline,
    );
    Ok(id)
}
