//! FROZEN error codes: docs/BUILD_PLAN.md section 4.6.
//! packages/shared/src/constants.ts mirrors these numbers; keep them in sync.
//!
//! Note: a bad quote signature is NOT one of these. `ed25519_verify` traps the
//! whole call (host error), so tests use `try_open_order(..).is_err()`.
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidConfig = 3,
    InvalidAmount = 4,
    Overflow = 5,
    /// New orders are paused by the admin (emergency stop). Money already in can still leave.
    Paused = 6,

    AnchorExists = 10,
    AnchorNotFound = 11,
    AnchorInactive = 12,
    CorridorNotAllowed = 13,
    InsufficientBond = 14,
    NotOrderAnchor = 15,
    TooManyAnchors = 16,

    QuoteExpired = 20,
    RequestIdUsed = 21,
    OracleUnavailable = 22,
    OracleStale = 23,
    MarkupTooHigh = 24,
    DailyCapExceeded = 25,
    QuoteLifetimeTooLong = 26,

    OrderNotFound = 30,
    WrongStatus = 31,
    DeadlinePassed = 32,
    DeadlineNotPassed = 33,
    ChallengeWindowOpen = 34,
    ChallengeWindowClosed = 35,
}
