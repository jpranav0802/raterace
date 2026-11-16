//! open_order tests (issue #7). At the test price (0.05 USD per MXN), 200 USDC is worth
//! 4,000 MXN at the market rate, so landing 3,940 MXN is a 1.5% markup.
use oracle_interface::Asset;
use soroban_sdk::{symbol_short, BytesN};

use super::helpers::*;
use crate::errors::Error;
use crate::types::Status;

const CAP: u32 = 300; // the sender accepts up to 3% below market

#[test]
fn opens_an_order_and_locks_the_money() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));

    let id = s
        .client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);

    assert_eq!(id, 1);
    // sender's 200 USDC moved into the contract (which already held 3 x 2,000 in bonds)
    assert_eq!(s.balance(&s.sender), usdc(9_800));
    assert_eq!(s.balance(&s.contract_id), usdc(6_200));
    // 105% of the transfer is reserved from the anchor's bond
    let anchor = s.client.get_anchor(&quote.anchor);
    assert_eq!(anchor.reserved, usdc(210));
    assert_eq!(anchor.bond, usdc(2_000));

    let order = s.client.get_order(&id);
    assert_eq!(order.status, Status::Open);
    assert_eq!(order.sender, s.sender);
    assert_eq!(order.quote, quote);
    assert_eq!(order.recipient_hash, s.recipient_hash());
    assert_eq!(order.reserved_bond, usdc(210));
    assert_eq!(order.opened_at, START_TIME);
    assert_eq!(order.payout_deadline, START_TIME + 120);
    assert_eq!(order.challenge_ends, 0);
    assert_eq!(order.payout_ref, None);
}

#[test]
fn order_ids_count_up() {
    let mut s = Setup::new();
    let (q1, s1) = s.signed_quote(0, usdc(100), mxn(1_980));
    let (q2, s2) = s.signed_quote(1, usdc(100), mxn(1_980));
    assert_eq!(s.client.open_order(&s.sender, &q1, &s1, &s.recipient_hash(), &CAP), 1);
    assert_eq!(s.client.open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &CAP), 2);
}

#[test]
fn opened_order_settles_through_the_real_flow() {
    // open_order (this file) feeding mark_paid + confirm (settle.rs): the whole happy path.
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    let id = s
        .client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);

    s.client
        .mark_paid(&quote.anchor, &id, &BytesN::from_array(&s.env, &[7u8; 32]));
    s.client.confirm(&id);

    assert_eq!(s.client.get_order(&id).status, Status::Settled);
    assert_eq!(s.balance(&quote.anchor), usdc(3_200)); // 3,000 + the 200 it earned
    assert_eq!(s.client.get_anchor(&quote.anchor).reserved, 0);
    assert_eq!(s.balance(&s.contract_id), usdc(6_000));
}

#[test]
fn opened_order_refunds_with_penalty_when_the_anchor_never_pays() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(2, usdc(200), mxn(3_966));
    let id = s
        .client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);

    s.advance(121);
    s.client.refund_expired(&id);

    assert_eq!(s.client.get_order(&id).status, Status::Refunded);
    assert_eq!(s.balance(&s.sender), usdc(10_010)); // everything back + 10 penalty
    let anchor = s.client.get_anchor(&quote.anchor);
    assert_eq!(anchor.bond, usdc(1_990));
    assert!(!anchor.active); // suspended after one penalty

    // and a suspended anchor cannot win another order
    let (q2, s2) = s.signed_quote(2, usdc(200), mxn(3_966));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &CAP),
        Err(Ok(Error::AnchorInactive))
    );
}

// ---------- signature ----------

#[test]
fn rejects_a_signature_from_another_key() {
    let mut s = Setup::new();
    let quote = s.quote(0, usdc(200), mxn(3_940));
    let wrong = s.sign(&quote, &s.anchors[1].signing);
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &wrong, &s.recipient_hash(), &CAP)
        .is_err());
    assert_eq!(s.balance(&s.sender), usdc(10_000));
}

#[test]
fn rejects_a_quote_changed_after_signing() {
    let mut s = Setup::new();
    let (mut quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    quote.landed_local -= 1; // the anchor tries to pay out less than it signed for
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP)
        .is_err());

    let (mut quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    quote.anchor = s.anchors[1].address.clone(); // someone else claims the quote
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP)
        .is_err());
}

// ---------- expiry and replay ----------

#[test]
fn rejects_an_expired_quote() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    s.advance(120); // expires_at == now
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::QuoteExpired))
    );
}

#[test]
fn rejects_a_reused_quote() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::RequestIdUsed))
    );
    assert_eq!(s.balance(&s.sender), usdc(9_800)); // charged once only
}

// ---------- oracle ----------

#[test]
fn rejects_when_the_oracle_has_no_price() {
    let mut s = Setup::new();
    s.oracle.clear(&Asset::Other(asset_code()));
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::OracleUnavailable))
    );
}

#[test]
fn rejects_a_stale_oracle_price() {
    let mut s = Setup::new();
    s.advance(601); // price is now 601 s old; the limit is 600
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::OracleStale))
    );

    // a fresh price fixes it
    s.set_price(MXN_PRICE);
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
}

// ---------- markup ----------

#[test]
fn rejects_a_quote_too_far_below_the_market() {
    let mut s = Setup::new();
    // 3,760 MXN on a 4,000 MXN market amount = 6% markup
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_760));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::MarkupTooHigh))
    );
}

#[test]
fn markup_cap_is_exact_at_the_boundary() {
    let mut s = Setup::new();
    // exactly 3.00% is allowed
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_880));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
    // 3.01% is not
    let (quote, sig) = s.signed_quote(1, usdc(200), mxn(3_880) - mxn(4) / 10);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::MarkupTooHigh))
    );
}

#[test]
fn sender_can_tighten_the_cap_but_not_loosen_it() {
    let mut s = Setup::new();
    // 1.5% markup, sender only accepts 1%
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &100),
        Err(Ok(Error::MarkupTooHigh))
    );
    // 6% markup, sender asks for a 10% cap: the contract's 3% cap still wins
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_760));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &1_000),
        Err(Ok(Error::MarkupTooHigh))
    );
}

#[test]
fn a_quote_better_than_the_market_is_allowed() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(4_010));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
}

// ---------- anchor ----------

#[test]
fn rejects_an_inactive_anchor() {
    let mut s = Setup::new();
    s.client.set_active(&s.anchors[0].address, &false);
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::AnchorInactive))
    );
}

#[test]
fn rejects_an_unknown_anchor() {
    let mut s = Setup::new();
    let stranger = s.new_anchor(42);
    let mut quote = s.quote(0, usdc(200), mxn(3_940));
    quote.anchor = stranger.address.clone();
    let sig = s.sign(&quote, &stranger.signing);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::AnchorNotFound))
    );
}

#[test]
fn rejects_a_corridor_the_anchor_does_not_serve() {
    let mut s = Setup::new();
    let mut quote = s.quote(0, usdc(200), mxn(3_940));
    quote.corridor = symbol_short!("BR_PIX");
    let sig = s.sign(&quote, &s.anchors[0].signing);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::CorridorNotAllowed))
    );
}

#[test]
fn rejects_when_the_anchor_lacks_free_bond() {
    let mut s = Setup::new();
    s.client.set_sender_limit(&s.sender, &2, &usdc(10_000));
    // 2,000 USDC bond covers 1,904.76 USDC of orders at 105%. 1,900 fits...
    let (quote, sig) = s.signed_quote(0, usdc(1_900), mxn(37_500));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
    // ...and then there is only 5 USDC of bond left: a 10 USDC order needs 10.5.
    let (quote, sig) = s.signed_quote(0, usdc(10), mxn(197));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::InsufficientBond))
    );
}

// ---------- sender ----------

#[test]
fn enforces_the_senders_daily_cap() {
    let mut s = Setup::new();
    // default cap is 1,000 USDC a day
    let (quote, sig) = s.signed_quote(0, usdc(900), mxn(17_800));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
    let (quote, sig) = s.signed_quote(1, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::DailyCapExceeded))
    );

    // the next day the allowance is back
    s.advance(86_400);
    s.set_price(MXN_PRICE);
    let (quote, sig) = s.signed_quote(1, usdc(200), mxn(3_940));
    s.client
        .open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
}

#[test]
fn rejects_zero_or_negative_amounts() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, 0, mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::InvalidAmount))
    );
    let (quote, sig) = s.signed_quote(0, usdc(200), -1);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn requires_the_senders_signature() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    s.env.set_auths(&[]);
    assert!(s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP)
        .is_err());
}

#[test]
fn a_failed_order_changes_nothing() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_760)); // 6% markup: rejected
    let _ = s
        .client
        .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP);
    assert_eq!(s.balance(&s.sender), usdc(10_000));
    assert_eq!(s.client.get_anchor(&quote.anchor).reserved, 0);
    assert_eq!(s.client.try_get_order(&1), Err(Ok(Error::OrderNotFound)));
    // the same request id is still usable, because the failed call was rolled back
    let (ok_quote, ok_sig) = {
        let mut q = quote.clone();
        q.landed_local = mxn(3_940);
        let sig = s.sign(&q, &s.anchors[0].signing);
        (q, sig)
    };
    s.client
        .open_order(&s.sender, &ok_quote, &ok_sig, &s.recipient_hash(), &CAP);
}

// ---------- hardening ----------

#[test]
fn rejects_a_quote_that_stays_valid_too_long() {
    let mut s = Setup::new();
    let mut quote = s.quote(0, usdc(200), mxn(3_940));
    quote.expires_at = s.now() + 3_601; // more than an hour
    let sig = s.sign(&quote, &s.anchors[0].signing);
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &quote, &sig, &s.recipient_hash(), &CAP),
        Err(Ok(Error::QuoteLifetimeTooLong))
    );
}

#[test]
fn pause_blocks_new_orders_but_money_can_still_leave() {
    let mut s = Setup::new();
    let (q1, s1) = s.signed_quote(0, usdc(200), mxn(3_940));
    let (q2, s2) = s.signed_quote(2, usdc(200), mxn(3_966));
    let paid = s.client.open_order(&s.sender, &q1, &s1, &s.recipient_hash(), &CAP);
    let stuck = s.client.open_order(&s.sender, &q2, &s2, &s.recipient_hash(), &CAP);

    s.client.pause();

    // no new orders
    let (q3, s3) = s.signed_quote(1, usdc(200), mxn(3_940));
    assert_eq!(
        s.client
            .try_open_order(&s.sender, &q3, &s3, &s.recipient_hash(), &CAP),
        Err(Ok(Error::Paused))
    );

    // but the anchor can still be paid, the sender can still confirm...
    s.client
        .mark_paid(&q1.anchor, &paid, &BytesN::from_array(&s.env, &[7u8; 32]));
    s.client.confirm(&paid);
    assert_eq!(s.client.get_order(&paid).status, Status::Settled);

    // ...and a missed deadline still refunds
    s.advance(121);
    s.client.refund_expired(&stuck);
    assert_eq!(s.client.get_order(&stuck).status, Status::Refunded);

    s.client.unpause();
    s.set_price(MXN_PRICE);
    let (q4, s4) = s.signed_quote(1, usdc(200), mxn(3_940));
    s.client
        .open_order(&s.sender, &q4, &s4, &s.recipient_hash(), &CAP);
}
