//! open_order. Owner: Abhiraj (issue #6).
//!
//! Accepts a quote signed by an anchor, checks it, escrows the sender's USDC and
//! reserves part of the anchor's bond. The 13 steps follow docs/BUILD_PLAN.md
//! section 7 (#6) in the same order, so errors come out in a predictable order and
//! cheap checks run before expensive ones (signature, oracle call, token transfer).

use oracle_interface::{Asset, OracleClient};
use soroban_sdk::{token, Address, Bytes, BytesN, Env};

use crate::errors::Error;
use crate::events;
use crate::registry;
use crate::storage;
use crate::types::{Order, Quote, Status};

pub fn open_order(
    env: &Env,
    sender: Address,
    quote: Quote,
    signature: BytesN<64>,
    recipient_hash: BytesN<32>,
    max_markup_bps: u32,
) -> Result<u64, Error> {
    // 1. The sender must authorise this call (and therefore the USDC transfer below).
    sender.require_auth();

    // 2. Contract settings.
    let cfg = storage::config(env)?;

    // 3. Amounts must be positive.
    if quote.send_usdc <= 0 || quote.landed_local <= 0 {
        return Err(Error::InvalidAmount);
    }

    // 4. The anchor must exist, be active, and serve this corridor.
    let mut anchor = storage::load_anchor(env, &quote.anchor)?;
    if !anchor.active {
        return Err(Error::AnchorInactive);
    }
    if !anchor.corridors.contains(&quote.corridor) {
        return Err(Error::CorridorNotAllowed);
    }

    // 5. The quote must not have expired.
    let now = env.ledger().timestamp();
    if quote.expires_at <= now {
        return Err(Error::QuoteExpired);
    }

    // 6. Each request_id can be used once (replay protection).
    if storage::is_request_used(env, &quote.request_id) {
        return Err(Error::RequestIdUsed);
    }
    storage::mark_request_used(env, &quote.request_id);

    // 7. The anchor really signed exactly this quote. `ed25519_verify` traps (aborts the
    //    whole call, no error code) if the signature doesn't match.
    let digest: Bytes = registry::quote_digest(env, &quote).into();
    env.crypto()
        .ed25519_verify(&anchor.signing_key, &digest, &signature);

    // 8. Market price from the oracle (USD per 1 unit of local currency).
    let oracle = OracleClient::new(env, &cfg.oracle);
    let price = oracle
        .lastprice(&Asset::Other(quote.asset_code.clone()))
        .ok_or(Error::OracleUnavailable)?;
    if price.price <= 0 {
        return Err(Error::OracleUnavailable);
    }
    // A timestamp in the future is treated as fresh.
    if now > price.timestamp && now - price.timestamp > cfg.max_oracle_age_s {
        return Err(Error::OracleStale);
    }

    // 9. Markup: how far below the market rate the landed amount is, all fees included.
    //    landed_usd = landed_local * price / 10^decimals
    //    markup_bps = (send_usdc - landed_usd) * 10000 / send_usdc   (negative = better than market)
    let scale = 10i128
        .checked_pow(oracle.decimals())
        .ok_or(Error::Overflow)?;
    let landed_usd = quote
        .landed_local
        .checked_mul(price.price)
        .and_then(|v| v.checked_div(scale))
        .ok_or(Error::Overflow)?;
    let markup_bps = quote
        .send_usdc
        .checked_sub(landed_usd)
        .and_then(|v| v.checked_mul(10_000))
        .and_then(|v| v.checked_div(quote.send_usdc))
        .ok_or(Error::Overflow)?;
    let cap = core::cmp::min(max_markup_bps, cfg.default_max_markup_bps) as i128;
    if markup_bps > cap {
        return Err(Error::MarkupTooHigh);
    }

    // 10. Sender's daily limit (stand-in for KYC tiers).
    let limit = storage::sender_limit(env, &sender, cfg.default_daily_cap);
    let spent_after = storage::sender_spent_today(env, &sender)
        .checked_add(quote.send_usdc)
        .ok_or(Error::Overflow)?;
    if spent_after > limit.daily_cap {
        return Err(Error::DailyCapExceeded);
    }
    storage::add_sender_spent(env, &sender, quote.send_usdc)?;

    // 11. Reserve part of the anchor's bond against this order.
    let reserve = quote
        .send_usdc
        .checked_mul(cfg.bond_ratio_bps as i128)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(Error::Overflow)?;
    let free_bond = anchor
        .bond
        .checked_sub(anchor.reserved)
        .ok_or(Error::Overflow)?;
    if free_bond < reserve {
        return Err(Error::InsufficientBond);
    }
    anchor.reserved = anchor
        .reserved
        .checked_add(reserve)
        .ok_or(Error::Overflow)?;
    storage::save_anchor(env, &quote.anchor, &anchor);

    // 12. Escrow: move the sender's USDC into this contract.
    token::Client::new(env, &cfg.usdc).transfer(
        &sender,
        &env.current_contract_address(),
        &quote.send_usdc,
    );

    // 13. Store the order and announce it.
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
