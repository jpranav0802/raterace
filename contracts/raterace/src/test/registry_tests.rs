//! Registry tests. Owner: Pranav (issue #5).
extern crate std;

use soroban_sdk::{testutils::Events as _, vec, Bytes};

use super::helpers::*;
use crate::errors::Error;

#[test]
fn init_stores_config() {
    let s = Setup::bare();
    let cfg = s.default_config();
    s.client.init(&cfg);
    assert_eq!(s.client.get_config(), cfg);
}

#[test]
fn init_twice_fails() {
    let s = Setup::new();
    assert_eq!(
        s.client.try_init(&s.default_config()),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn calls_before_init_fail() {
    let s = Setup::bare();
    assert_eq!(s.client.try_get_config(), Err(Ok(Error::NotInitialized)));
    let a = s.new_anchor(1);
    assert_eq!(
        s.client
            .try_register_anchor(&a.address, &s.signing_key_bytes(&a), &vec![&s.env, corridor()]),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn invalid_config_rejected() {
    let s = Setup::bare();

    // bond must cover the transfer plus the penalty
    let mut cfg = s.default_config();
    cfg.bond_ratio_bps = 10_400;
    assert_eq!(s.client.try_init(&cfg), Err(Ok(Error::InvalidConfig)));

    let mut cfg = s.default_config();
    cfg.payout_window_s = 0;
    assert_eq!(s.client.try_init(&cfg), Err(Ok(Error::InvalidConfig)));

    let mut cfg = s.default_config();
    cfg.max_slashes = 0;
    assert_eq!(s.client.try_init(&cfg), Err(Ok(Error::InvalidConfig)));
}

#[test]
fn update_config_changes_windows() {
    let s = Setup::new();
    let mut cfg = s.default_config();
    cfg.payout_window_s = 900;
    s.client.update_config(&cfg);
    assert_eq!(s.client.get_config().payout_window_s, 900);

    cfg.challenge_window_s = 0;
    assert_eq!(s.client.try_update_config(&cfg), Err(Ok(Error::InvalidConfig)));
}

#[test]
fn register_starts_inactive_and_unbonded() {
    let s = Setup::new();
    let a = s.new_anchor(7);
    s.client
        .register_anchor(&a.address, &s.signing_key_bytes(&a), &vec![&s.env, corridor()]);

    let data = s.client.get_anchor(&a.address);
    assert!(!data.active);
    assert_eq!(data.bond, 0);
    assert_eq!(data.reserved, 0);
    assert_eq!(data.signing_key, s.signing_key_bytes(&a));
    assert_eq!(data.corridors, vec![&s.env, corridor()]);
    assert_eq!(s.client.list_anchor_ids().len(), 4);
}

#[test]
fn register_twice_fails() {
    let s = Setup::new();
    let a = &s.anchors[0];
    assert_eq!(
        s.client
            .try_register_anchor(&a.address, &s.signing_key_bytes(a), &vec![&s.env, corridor()]),
        Err(Ok(Error::AnchorExists))
    );
}

#[test]
fn setup_anchors_are_active_and_bonded() {
    let s = Setup::new();
    for a in &s.anchors {
        let data = s.client.get_anchor(&a.address);
        assert!(data.active);
        assert_eq!(data.bond, usdc(2_000));
        assert_eq!(s.balance(&a.address), usdc(3_000));
    }
    assert_eq!(s.balance(&s.contract_id), usdc(6_000));
}

#[test]
fn set_active_toggles_and_requires_known_anchor() {
    let s = Setup::new();
    let a = &s.anchors[0];
    s.client.set_active(&a.address, &false);
    assert!(!s.client.get_anchor(&a.address).active);

    let stranger = s.new_anchor(9);
    assert_eq!(
        s.client.try_set_active(&stranger.address, &true),
        Err(Ok(Error::AnchorNotFound))
    );
}

#[test]
fn admin_functions_require_admin_auth() {
    let s = Setup::new();
    let a = &s.anchors[0];
    // Drop the mocked auths: nobody has signed anything now.
    s.env.set_auths(&[]);
    assert!(s.client.try_set_active(&a.address, &false).is_err());
    assert!(s.client.try_update_config(&s.default_config()).is_err());
    assert!(s
        .client
        .try_set_sender_limit(&s.sender, &1, &usdc(5_000))
        .is_err());
    // Anchor functions need the anchor's auth too.
    assert!(s.client.try_add_bond(&a.address, &usdc(1)).is_err());
    assert!(s.client.try_withdraw_bond(&a.address, &usdc(1)).is_err());
    assert!(s.client.get_anchor(&a.address).active);
}

#[test]
fn add_bond_moves_usdc() {
    let s = Setup::new();
    let a = &s.anchors[0];
    s.client.add_bond(&a.address, &usdc(500));
    assert_eq!(s.client.get_anchor(&a.address).bond, usdc(2_500));
    assert_eq!(s.balance(&a.address), usdc(2_500));
    assert_eq!(s.balance(&s.contract_id), usdc(6_500));

    assert_eq!(
        s.client.try_add_bond(&a.address, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.client.try_add_bond(&a.address, &-1),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn withdraw_bond_limited_to_free_bond() {
    let s = Setup::new();
    let a = &s.anchors[0];
    s.client.withdraw_bond(&a.address, &usdc(500));
    assert_eq!(s.client.get_anchor(&a.address).bond, usdc(1_500));
    assert_eq!(s.balance(&a.address), usdc(3_500));

    assert_eq!(
        s.client.try_withdraw_bond(&a.address, &usdc(1_501)),
        Err(Ok(Error::InsufficientBond))
    );
    assert_eq!(
        s.client.try_withdraw_bond(&a.address, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn sender_limit_defaults_then_overrides() {
    let s = Setup::new();
    let limit = s.client.get_sender_limit(&s.sender);
    assert_eq!(limit.tier, 0);
    assert_eq!(limit.daily_cap, usdc(1_000));

    s.client.set_sender_limit(&s.sender, &2, &usdc(5_000));
    let limit = s.client.get_sender_limit(&s.sender);
    assert_eq!(limit.tier, 2);
    assert_eq!(limit.daily_cap, usdc(5_000));
}

#[test]
fn quote_digest_is_deterministic_and_binds_every_field() {
    let mut s = Setup::new();
    let q = s.quote(0, usdc(200), mxn(3_940));
    let d = s.client.quote_digest(&q);
    assert_eq!(d, s.client.quote_digest(&q.clone()));

    let mut q2 = q.clone();
    q2.landed_local += 1;
    assert_ne!(d, s.client.quote_digest(&q2));

    let mut q3 = q.clone();
    q3.expires_at += 1;
    assert_ne!(d, s.client.quote_digest(&q3));

    let mut q4 = q.clone();
    q4.anchor = s.anchors[1].address.clone();
    assert_ne!(d, s.client.quote_digest(&q4));
}

/// The signing pattern everyone uses: sign the digest off-chain with ed25519,
/// verify on-chain with `env.crypto().ed25519_verify` (which traps on a bad signature).
#[test]
fn signed_quote_verifies_on_chain() {
    let mut s = Setup::new();
    let (quote, sig) = s.signed_quote(0, usdc(200), mxn(3_940));
    let digest = s.client.quote_digest(&quote);
    let key = s.client.get_anchor(&quote.anchor).signing_key;
    let msg: Bytes = digest.into();
    s.env.crypto().ed25519_verify(&key, &msg, &sig);
}

#[test]
#[should_panic]
fn signature_from_another_key_is_rejected() {
    let mut s = Setup::new();
    let (quote, _) = s.signed_quote(0, usdc(200), mxn(3_940));
    let wrong_sig = s.sign(&quote, &s.anchors[1].signing);
    let digest = s.client.quote_digest(&quote);
    let key = s.client.get_anchor(&quote.anchor).signing_key;
    let msg: Bytes = digest.into();
    s.env.crypto().ed25519_verify(&key, &msg, &wrong_sig);
}

/// Prints the on-chain shape of our events for the indexer (issue #16).
/// Run: cargo test -p raterace print_event_shape -- --nocapture
#[test]
fn print_event_shape() {
    let s = Setup::new();
    let a = s.new_anchor(8);
    s.client
        .register_anchor(&a.address, &s.signing_key_bytes(&a), &vec![&s.env, corridor()]);
    let events = s.env.events().all();
    std::println!("{:#?}", events);
}
