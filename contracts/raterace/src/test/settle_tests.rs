//! Settlement tests. Owner: Avani (issue #9).
use super::helpers::*;
use crate::errors::Error;
use crate::storage;
use crate::types::{Order, Status};
use soroban_sdk::BytesN;

/// Creates an Open order without calling `open_order` (issue #6): escrows the sender's
/// USDC in the contract, reserves the anchor's bond and stores the order. Returns the id.
fn seed_order(s: &mut Setup, anchor_idx: usize, send_usdc: i128, landed_local: i128) -> u64 {
    let (quote, _sig) = s.signed_quote(anchor_idx, send_usdc, landed_local);
    let cfg = s.client.get_config();
    let reserve = send_usdc * cfg.bond_ratio_bps as i128 / 10_000;

    // escrow: sender -> contract
    s.token.transfer(&s.sender, &s.contract_id, &send_usdc);

    let now = s.now();
    let sender = s.sender.clone();
    let recipient_hash = s.recipient_hash();
    s.env.as_contract(&s.contract_id, || {
        let mut anchor = storage::load_anchor(&s.env, &quote.anchor).unwrap();
        anchor.reserved += reserve;
        storage::save_anchor(&s.env, &quote.anchor, &anchor);

        let id = storage::next_order_id(&s.env);
        storage::save_order(
            &s.env,
            &Order {
                id,
                sender,
                quote: quote.clone(),
                recipient_hash,
                status: Status::Open,
                reserved_bond: reserve,
                opened_at: now,
                payout_deadline: now + cfg.payout_window_s,
                challenge_ends: 0,
                payout_ref: None,
            },
        );
        id
    })
}

/// A stand-in payout receipt hash.
fn receipt(s: &Setup) -> BytesN<32> {
    BytesN::from_array(&s.env, &[1u8; 32])
}

#[test]
fn seed_order_matches_what_open_order_will_store() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let order = s.client.get_order(&id);
    assert_eq!(id, 1);
    assert_eq!(order.status, Status::Open);
    assert_eq!(order.reserved_bond, usdc(210));
    assert_eq!(order.payout_deadline, START_TIME + 120);
    assert_eq!(s.balance(&s.sender), usdc(9_800));
    assert_eq!(s.balance(&s.contract_id), usdc(6_200));
    assert_eq!(s.client.get_anchor(&s.anchors[0].address).reserved, usdc(210));
}

#[test]
fn mark_paid_pays_the_anchor_and_starts_the_challenge_window() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    let alpha_before = s.balance(&alpha);
    let contract_before = s.balance(&s.contract_id);

    s.client.mark_paid(&alpha, &id, &receipt(&s));

    let order = s.client.get_order(&id);
    assert_eq!(order.status, Status::Paid);
    assert_eq!(order.payout_ref, Some(receipt(&s)));
    assert_eq!(order.challenge_ends, START_TIME + 60);
    assert_eq!(s.balance(&alpha), alpha_before + usdc(200));
    assert_eq!(s.balance(&s.contract_id), contract_before - usdc(200));
    let anchor = s.client.get_anchor(&alpha);
    assert_eq!(anchor.filled, 1);
    assert_eq!(anchor.reserved, usdc(210)); // still locked until confirm/release
}

#[test]
fn confirm_settles_and_unlocks_the_bond() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    let alpha_before = s.balance(&alpha);
    let contract_before = s.balance(&s.contract_id);

    s.client.mark_paid(&alpha, &id, &receipt(&s));
    s.client.confirm(&id);

    let order = s.client.get_order(&id);
    assert_eq!(order.status, Status::Settled);
    assert_eq!(order.payout_ref, Some(receipt(&s)));
    assert_eq!(s.balance(&alpha), alpha_before + usdc(200));
    assert_eq!(s.balance(&s.contract_id), contract_before - usdc(200));
    let anchor = s.client.get_anchor(&alpha);
    assert_eq!(anchor.reserved, 0);
    assert_eq!(anchor.filled, 1);
}

#[test]
fn release_settles_after_the_challenge_window() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.client.mark_paid(&alpha, &id, &receipt(&s));

    s.advance(61);
    s.client.release(&id);

    assert_eq!(s.client.get_order(&id).status, Status::Settled);
    assert_eq!(s.client.get_anchor(&alpha).reserved, 0);
}

#[test]
fn release_before_the_window_ends_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.client.mark_paid(&alpha, &id, &receipt(&s));

    assert_eq!(s.client.try_release(&id), Err(Ok(Error::ChallengeWindowOpen)));
}

#[test]
fn confirm_on_an_open_order_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    assert_eq!(s.client.try_confirm(&id), Err(Ok(Error::WrongStatus)));
}

/// Seed an order with alpha, mark it paid, and dispute it. Returns the id.
fn disputed_order(s: &mut Setup) -> u64 {
    let id = seed_order(s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.client.mark_paid(&alpha, &id, &receipt(s));
    s.client.dispute(&id);
    id
}

#[test]
fn dispute_inside_the_window_freezes_the_order() {
    let mut s = Setup::new();
    let id = disputed_order(&mut s);
    assert_eq!(s.client.get_order(&id).status, Status::Disputed);
    let anchor = s.client.get_anchor(&s.anchors[0].address);
    assert_eq!(anchor.disputed, 1);
    assert_eq!(anchor.reserved, usdc(210)); // bond stays locked
}

#[test]
fn dispute_after_the_window_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.client.mark_paid(&alpha, &id, &receipt(&s));
    s.advance(61);
    assert_eq!(s.client.try_dispute(&id), Err(Ok(Error::ChallengeWindowClosed)));
}

#[test]
fn resolve_at_fault_refunds_sender_from_the_bond_and_suspends_the_anchor() {
    let mut s = Setup::new();
    let id = disputed_order(&mut s);
    s.client.resolve(&id, &true);

    assert_eq!(s.client.get_order(&id).status, Status::Slashed);
    // sender: 10,000 - 200 sent + 210 back
    assert_eq!(s.balance(&s.sender), usdc(10_010));
    let anchor = s.client.get_anchor(&s.anchors[0].address);
    assert_eq!(anchor.bond, usdc(1_790));
    assert_eq!(anchor.reserved, 0);
    assert_eq!(anchor.slashed, 1);
    assert!(!anchor.active);
}

#[test]
fn resolve_not_at_fault_settles_and_keeps_the_anchor_active() {
    let mut s = Setup::new();
    let id = disputed_order(&mut s);
    s.client.resolve(&id, &false);

    assert_eq!(s.client.get_order(&id).status, Status::Settled);
    let anchor = s.client.get_anchor(&s.anchors[0].address);
    assert_eq!(anchor.bond, usdc(2_000));
    assert_eq!(anchor.reserved, 0);
    assert_eq!(anchor.slashed, 0);
    assert!(anchor.active);
}

#[test]
fn resolve_on_an_order_that_is_not_disputed_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    assert_eq!(s.client.try_resolve(&id, &true), Err(Ok(Error::WrongStatus)));
}

#[test]
fn refund_before_the_deadline_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 2, usdc(200), mxn(3_960)); // gamma
    assert_eq!(s.client.try_refund_expired(&id), Err(Ok(Error::DeadlineNotPassed)));
}

#[test]
fn refund_after_the_deadline_pays_sender_and_suspends_the_anchor() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 2, usdc(200), mxn(3_960)); // gamma never pays
    s.advance(121);
    s.client.refund_expired(&id);

    assert_eq!(s.client.get_order(&id).status, Status::Refunded);
    // sender: 10,000 - 200 sent + 210 back
    assert_eq!(s.balance(&s.sender), usdc(10_010));
    let gamma = s.client.get_anchor(&s.anchors[2].address);
    assert_eq!(gamma.bond, usdc(1_990));
    assert_eq!(gamma.reserved, 0);
    assert_eq!(gamma.slashed, 1);
    assert!(!gamma.active);
}

#[test]
fn refund_twice_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 2, usdc(200), mxn(3_960));
    s.advance(121);
    s.client.refund_expired(&id);
    assert_eq!(s.client.try_refund_expired(&id), Err(Ok(Error::WrongStatus)));
}

// ---------- mark_paid failure paths ----------

#[test]
fn mark_paid_twice_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.client.mark_paid(&alpha, &id, &receipt(&s));
    assert_eq!(
        s.client.try_mark_paid(&alpha, &id, &receipt(&s)),
        Err(Ok(Error::WrongStatus))
    );
}

#[test]
fn mark_paid_by_a_different_anchor_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940)); // alpha's order
    let beta = s.anchors[1].address.clone();
    assert_eq!(
        s.client.try_mark_paid(&beta, &id, &receipt(&s)),
        Err(Ok(Error::NotOrderAnchor))
    );
}

#[test]
fn mark_paid_after_the_deadline_fails() {
    let mut s = Setup::new();
    let id = seed_order(&mut s, 0, usdc(200), mxn(3_940));
    let alpha = s.anchors[0].address.clone();
    s.advance(121);
    assert_eq!(
        s.client.try_mark_paid(&alpha, &id, &receipt(&s)),
        Err(Ok(Error::DeadlinePassed))
    );
}

// ---------- unknown order ----------

#[test]
fn unknown_order_id_fails_everywhere() {
    let s = Setup::new();
    let alpha = s.anchors[0].address.clone();
    let missing = 99u64;
    assert_eq!(
        s.client.try_mark_paid(&alpha, &missing, &receipt(&s)),
        Err(Ok(Error::OrderNotFound))
    );
    assert_eq!(s.client.try_confirm(&missing), Err(Ok(Error::OrderNotFound)));
    assert_eq!(s.client.try_release(&missing), Err(Ok(Error::OrderNotFound)));
    assert_eq!(s.client.try_dispute(&missing), Err(Ok(Error::OrderNotFound)));
    assert_eq!(s.client.try_resolve(&missing, &true), Err(Ok(Error::OrderNotFound)));
    assert_eq!(s.client.try_refund_expired(&missing), Err(Ok(Error::OrderNotFound)));
    assert_eq!(s.client.try_get_order(&missing), Err(Ok(Error::OrderNotFound)));
}

// ---------- auth: without signatures, the guarded calls are refused ----------

#[test]
fn guarded_calls_fail_without_the_right_signature() {
    let mut s = Setup::new();
    let alpha = s.anchors[0].address.clone();

    // One order in each state the guarded calls need.
    let open_id = seed_order(&mut s, 0, usdc(100), mxn(1_970));
    let paid_id = seed_order(&mut s, 0, usdc(100), mxn(1_970));
    s.client.mark_paid(&alpha, &paid_id, &receipt(&s));
    let disputed_id = seed_order(&mut s, 0, usdc(100), mxn(1_970));
    s.client.mark_paid(&alpha, &disputed_id, &receipt(&s));
    s.client.dispute(&disputed_id);

    // Turn off the mocked signatures.
    s.env.set_auths(&[]);

    assert!(s.client.try_mark_paid(&alpha, &open_id, &receipt(&s)).is_err());
    assert!(s.client.try_confirm(&paid_id).is_err());
    assert!(s.client.try_dispute(&paid_id).is_err());
    assert!(s.client.try_resolve(&disputed_id, &true).is_err());

    // Nothing changed.
    assert_eq!(s.client.get_order(&open_id).status, Status::Open);
    assert_eq!(s.client.get_order(&paid_id).status, Status::Paid);
    assert_eq!(s.client.get_order(&disputed_id).status, Status::Disputed);
}

// ---------- money invariant ----------

/// The contract must always hold exactly: every anchor's bond + the escrow of Open orders.
fn assert_money_adds_up(s: &Setup, open_escrow: i128) {
    let bonds: i128 = s
        .anchors
        .iter()
        .map(|a| s.client.get_anchor(&a.address).bond)
        .sum();
    assert_eq!(s.balance(&s.contract_id), bonds + open_escrow);
}

#[test]
fn contract_balance_always_equals_bonds_plus_open_escrow() {
    let mut s = Setup::new();
    let alpha = s.anchors[0].address.clone();
    let beta = s.anchors[1].address.clone();
    assert_money_adds_up(&s, 0);

    let a = seed_order(&mut s, 0, usdc(200), mxn(3_940)); // alpha: happy path
    let b = seed_order(&mut s, 2, usdc(200), mxn(3_960)); // gamma: never pays
    let c = seed_order(&mut s, 1, usdc(200), mxn(3_920)); // beta: disputed, at fault
    assert_money_adds_up(&s, usdc(600));

    s.client.mark_paid(&alpha, &a, &receipt(&s));
    assert_money_adds_up(&s, usdc(400));
    s.client.confirm(&a);
    assert_money_adds_up(&s, usdc(400));

    s.client.mark_paid(&beta, &c, &receipt(&s));
    assert_money_adds_up(&s, usdc(200));
    s.client.dispute(&c);
    s.client.resolve(&c, &true);
    assert_money_adds_up(&s, usdc(200));

    s.advance(121);
    s.client.refund_expired(&b);
    assert_money_adds_up(&s, 0);

    let d = seed_order(&mut s, 0, usdc(50), mxn(985)); // one left open
    assert_eq!(s.client.get_order(&d).status, Status::Open);
    assert_money_adds_up(&s, usdc(50));
}
