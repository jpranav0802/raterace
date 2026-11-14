//! Config, anchors, bonds, sender limits and the quote digest.
//! Owner: Pranav (issue #5). See docs/BUILD_PLAN.md sections 4.7 and 6.
use soroban_sdk::{token, xdr::ToXdr, Address, BytesN, Env, Symbol, Vec};

use crate::errors::Error;
use crate::events;
use crate::storage;
use crate::types::{Anchor, Config, Quote, SenderLimit};

const BPS: u32 = 10_000;

fn validate_config(config: &Config) -> Result<(), Error> {
    let min_ratio = BPS.checked_add(config.penalty_bps).ok_or(Error::InvalidConfig)?;
    if config.bond_ratio_bps < min_ratio
        || config.penalty_bps > BPS
        || config.default_max_markup_bps > BPS
        || config.max_oracle_age_s == 0
        || config.payout_window_s == 0
        || config.challenge_window_s == 0
        || config.default_daily_cap <= 0
        || config.max_slashes == 0
    {
        return Err(Error::InvalidConfig);
    }
    Ok(())
}

pub fn init(env: &Env, config: Config) -> Result<(), Error> {
    config.admin.require_auth();
    if storage::has_config(env) {
        return Err(Error::AlreadyInitialized);
    }
    validate_config(&config)?;
    storage::set_config(env, &config);
    Ok(())
}

pub fn update_config(env: &Env, config: Config) -> Result<(), Error> {
    let current = storage::config(env)?;
    current.admin.require_auth();
    validate_config(&config)?;
    storage::set_config(env, &config);
    Ok(())
}

pub fn register_anchor(
    env: &Env,
    anchor: Address,
    signing_key: BytesN<32>,
    corridors: Vec<Symbol>,
) -> Result<(), Error> {
    anchor.require_auth();
    storage::config(env)?;
    if storage::anchor_exists(env, &anchor) {
        return Err(Error::AnchorExists);
    }
    let data = Anchor {
        signing_key,
        corridors: corridors.clone(),
        bond: 0,
        reserved: 0,
        filled: 0,
        disputed: 0,
        slashed: 0,
        active: false,
    };
    storage::save_anchor(env, &anchor, &data);
    storage::push_anchor_id(env, &anchor);
    events::emit_registered(env, &anchor, &corridors);
    Ok(())
}

pub fn set_active(env: &Env, anchor: Address, active: bool) -> Result<(), Error> {
    let config = storage::config(env)?;
    config.admin.require_auth();
    let mut data = storage::load_anchor(env, &anchor)?;
    data.active = active;
    storage::save_anchor(env, &anchor, &data);
    events::emit_anchor_active(env, &anchor, active);
    Ok(())
}

pub fn add_bond(env: &Env, anchor: Address, amount: i128) -> Result<(), Error> {
    anchor.require_auth();
    let config = storage::config(env)?;
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let mut data = storage::load_anchor(env, &anchor)?;
    token::Client::new(env, &config.usdc).transfer(
        &anchor,
        &env.current_contract_address(),
        &amount,
    );
    data.bond = data.bond.checked_add(amount).ok_or(Error::Overflow)?;
    storage::save_anchor(env, &anchor, &data);
    events::emit_bond_added(env, &anchor, amount, data.bond);
    Ok(())
}

pub fn withdraw_bond(env: &Env, anchor: Address, amount: i128) -> Result<(), Error> {
    anchor.require_auth();
    let config = storage::config(env)?;
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let mut data = storage::load_anchor(env, &anchor)?;
    let free = data.bond.checked_sub(data.reserved).ok_or(Error::Overflow)?;
    if amount > free {
        return Err(Error::InsufficientBond);
    }
    data.bond = data.bond.checked_sub(amount).ok_or(Error::Overflow)?;
    storage::save_anchor(env, &anchor, &data);
    token::Client::new(env, &config.usdc).transfer(
        &env.current_contract_address(),
        &anchor,
        &amount,
    );
    events::emit_bond_withdrawn(env, &anchor, amount, data.bond);
    Ok(())
}

pub fn set_sender_limit(
    env: &Env,
    sender: Address,
    tier: u32,
    daily_cap: i128,
) -> Result<(), Error> {
    let config = storage::config(env)?;
    config.admin.require_auth();
    if daily_cap < 0 {
        return Err(Error::InvalidAmount);
    }
    storage::set_sender_limit(env, &sender, &SenderLimit { tier, daily_cap });
    Ok(())
}

pub fn get_sender_limit(env: &Env, sender: Address) -> Result<SenderLimit, Error> {
    let config = storage::config(env)?;
    Ok(storage::sender_limit(env, &sender, config.default_daily_cap))
}

/// sha256(quote XDR). The anchor's ed25519 signature is over these 32 bytes.
pub fn quote_digest(env: &Env, quote: &Quote) -> BytesN<32> {
    env.crypto().sha256(&quote.clone().to_xdr(env)).to_bytes()
}
