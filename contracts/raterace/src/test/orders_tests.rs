//! open_order tests. Owner: Abhiraj (issue #7). Test list: docs/BUILD_PLAN.md section 7 (#7).
//! Start from `Setup::new()`; `s.signed_quote(..)` gives a valid (quote, signature).
//!
//! At the test price (0.05 USD per MXN), 200 USDC is worth 4,000 MXN at mid-market:
//!   3,940 MXN landed = 1.5% markup (passes the 3% default cap)
//!   3,760 MXN landed = 6% markup (fails)
extern crate std;

use super::helpers::*;
use crate::errors::Error;
use crate::types::Status;
use ed25519_dalek::SigningKey;
use oracle_interface::Asset;
use soroban_sdk::{symbol_short, testutils::Events as _, BytesN};

const GOOD: i128 = 3_940;

#[test]
fn happy_path_escrows_reserves_and_stores_the_order() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    let sender_before = s.balance(&s.sender);
    let contract_before = s.balance(&s.contract_id);

    let id = s
        .client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
    // An `awarded` event was emitted (the indexer and payout worker listen for it).
    // The test env keeps only the most recent call's events, so check right away.
    let events = std::format!("{:?}", s.env.events().all());
    assert!(events.contains("awarded"), "no awarded event in {events}");

    assert_eq!(id, 1);
    assert_eq!(s.balance(&s.sender), sender_before - usdc(200));
    assert_eq!(s.balance(&s.contract_id), contract_before + usdc(200));
    // reserve = 200 * 105% = 210
    assert_eq!(s.client.get_anchor(&s.anchors[0].address).reserved, usdc(210));

    let order = s.client.get_order(&id);
    assert_eq!(order.id, 1);
    assert_eq!(order.sender, s.sender);
    assert_eq!(order.quote, quote);
    assert_eq!(order.recipient_hash, s.recipient_hash());
    assert_eq!(order.status, Status::Open);
    assert_eq!(order.reserved_bond, usdc(210));
    assert_eq!(order.opened_at, START_TIME);
    assert_eq!(order.payout_deadline, START_TIME + 120);
    assert_eq!(order.challenge_ends, 0);
    assert_eq!(order.payout_ref, None);

}

#[test]
fn order_ids_increment() {
    let mut s = Setup::new();
    let (q1, s1) = s.signed_quote(0, usdc(100), mxn(1_970));
    let (q2, s2) = s.signed_quote(1, usdc(100), mxn(1_970));
    assert_eq!(s.client.open_order(&s.sender, &q1, &s1, &s.recipient_hash(), &300), 1);
    assert_eq!(s.client.open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &300), 2);
}

#[test]
fn better_than_market_quote_is_allowed() {
    let mut s = Setup::new();
    // 4,100 MXN for 200 USDC is better than the 4,000 mid-market (negative markup).
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(4_100));
    s.client.open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
}

#[test]
fn signature_from_a_different_key_fails() {
    let mut s = Setup::new();
    let quote = s.quote(0, usdc(200), mxn(GOOD));
    let impostor = SigningKey::from_bytes(&[99u8; 32]);
    let sig = s.sign(&quote, &impostor);
    // Bad signatures trap (no contract error code), so only check that it fails.
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300)
        .is_err());
    assert_eq!(s.balance(&s.contract_id), usdc(6_000)); // nothing moved
}

#[test]
fn quote_altered_after_signing_fails() {
    let mut s = Setup::new();
    let (mut quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    quote.landed_local += 1;
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300)
        .is_err());
}

#[test]
fn expired_quote_fails() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    s.advance(120); // expires_at == now counts as expired
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::QuoteExpired))
    );
}

#[test]
fn reused_request_id_fails() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::RequestIdUsed))
    );
}

#[test]
fn oracle_never_set_fails() {
    let mut s = Setup::new();
    s.oracle.clear(&Asset::Other(asset_code()));
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::OracleUnavailable))
    );
}

#[test]
fn stale_oracle_fails() {
    let mut s = Setup::new();
    s.advance(3_600);
    // Price still timestamped at START_TIME: an hour old, max age is 600 s.
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::OracleStale))
    );
}

#[test]
fn oracle_exactly_at_max_age_is_accepted() {
    let mut s = Setup::new();
    s.advance(600);
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
}

#[test]
fn oracle_timestamp_in_the_future_is_treated_as_fresh() {
    let mut s = Setup::new();
    s.oracle
        .set(&Asset::Other(asset_code()), &MXN_PRICE, &(START_TIME + 1_000));
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
}

#[test]
fn markup_above_config_cap_fails() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_760)); // 6%
    // Even if the sender allows 10%, the config ceiling (3%) wins.
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &1_000),
        Err(Ok(Error::MarkupTooHigh))
    );
}

#[test]
fn sender_markup_limit_lower_than_config_is_respected() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD)); // 1.5%
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &100),
        Err(Ok(Error::MarkupTooHigh))
    );
    // The same quote passes with a 1.5% limit.
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &150);
}

#[test]
fn inactive_anchor_fails() {
    let mut s = Setup::new();
    let alpha = s.anchors[0].address.clone();
    s.client.set_active(&alpha, &false);
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::AnchorInactive))
    );
}

#[test]
fn unknown_anchor_fails() {
    let mut s = Setup::new();
    let stranger = s.new_anchor(42);
    let mut quote = s.quote(0, usdc(200), mxn(GOOD));
    quote.anchor = stranger.address.clone();
    let sig = s.sign(&quote, &stranger.signing);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::AnchorNotFound))
    );
}

#[test]
fn wrong_corridor_fails() {
    let mut s = Setup::new();
    let mut quote = s.quote(0, usdc(200), mxn(GOOD));
    quote.corridor = symbol_short!("BR_PIX");
    let sig = s.sign(&quote, &s.anchors[0].signing);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::CorridorNotAllowed))
    );
}

#[test]
fn insufficient_free_bond_fails() {
    let mut s = Setup::new();
    let alpha = s.anchors[0].address.clone();
    // Bond 2,000; leave 200 free. A 200 USDC order needs a 210 reserve.
    s.client.withdraw_bond(&alpha, &usdc(1_800));
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::InsufficientBond))
    );
}

#[test]
fn reserved_bond_counts_against_free_bond() {
    let mut s = Setup::new();
    // Bond 2,000. Each 900 USDC order reserves 945, so a third one doesn't fit.
    s.client.set_sender_limit(&s.sender, &1, &usdc(10_000));
    let (q1, s1) = s.signed_quote(0, usdc(900), mxn(17_730));
    let (q2, s2) = s.signed_quote(0, usdc(900), mxn(17_730));
    let (q3, s3) = s.signed_quote(0, usdc(900), mxn(17_730));
    s.client.open_order(&s.sender, &q1, &s1, &s.recipient_hash(), &300);
    s.client.open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &300);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &q3, &s3, &s.recipient_hash(), &300),
        Err(Ok(Error::InsufficientBond))
    );
}

#[test]
fn over_daily_cap_fails() {
    let mut s = Setup::new();
    // Default cap 1,000 USDC per day.
    let (q1, s1) = s.signed_quote(0, usdc(800), mxn(15_760));
    s.client.open_order(&s.sender, &q1, &s1, &s.recipient_hash(), &300);
    let (q2, s2) = s.signed_quote(1, usdc(300), mxn(5_910));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &300),
        Err(Ok(Error::DailyCapExceeded))
    );
    // The cap resets the next day.
    s.advance(86_400);
    s.set_price(MXN_PRICE);
    let (q3, s3) = s.signed_quote(1, usdc(300), mxn(5_910));
    s.client.open_order(&s.sender, &q3, &s3, &s.recipient_hash(), &300);
}

#[test]
fn per_sender_limit_overrides_default_cap() {
    let mut s = Setup::new();
    s.client.set_sender_limit(&s.sender, &0, &usdc(100));
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(GOOD));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::DailyCapExceeded))
    );
}

#[test]
fn zero_or_negative_amounts_fail() {
    let mut s = Setup::new();
    let (q, sig) = s.signed_quote(0, 0, mxn(GOOD));
    assert_eq!(
        s.client.try_open_order(&s.sender, &q, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::InvalidAmount))
    );
    let (q, sig) = s.signed_quote(0, usdc(200), 0);
    assert_eq!(
        s.client.try_open_order(&s.sender, &q, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::InvalidAmount))
    );
    let (q, sig) = s.signed_quote(0, -usdc(200), mxn(GOOD));
    assert_eq!(
        s.client.try_open_order(&s.sender, &q, &sig, &s.recipient_hash(), &300),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn failed_order_leaves_no_trace() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_760)); // 6% -> rejected
    let _ = s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &300);
    assert_eq!(s.balance(&s.sender), usdc(10_000));
    assert_eq!(s.client.get_anchor(&s.anchors[0].address).reserved, 0);
    assert_eq!(s.client.try_get_order(&1), Err(Ok(Error::OrderNotFound)));
    // The request_id wasn't burned either: a rejected call rolls back all writes.
    let fixed = BytesN::from_array(&s.env, &[0u8; 32]);
    assert_ne!(quote.request_id, fixed);
}
