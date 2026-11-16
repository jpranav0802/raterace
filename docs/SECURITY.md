# RateRace contract: security review

Reviewed 15 Nov 2026 against the security guide in Stellar's official developer skill
([stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill), `skills/smart-contracts/security.md`,
listed on [skills.stellar.org](https://skills.stellar.org/)) and the "Common Pitfalls" in Stellar's
[Soroban development guide](https://github.com/stellar/ecosystem-resources/tree/main/soroban-development).

This is a self-review for a testnet prototype. It is not a professional audit.

## What the review changed

The review found four things worth fixing. All four are fixed, tested and deployed.

| Finding | Risk | Fix |
|---|---|---|
| The contract was deployed first and initialised in a second transaction (`init`) | Anyone could call `init` in between and make themselves admin | `init` is gone. Config is a **constructor** argument, so deploy and initialise are one atomic transaction. Same for the mock oracle |
| A quote could be signed with any expiry | Used request ids are remembered for two days; a quote valid for longer could be replayed after that | Quotes may be valid for **at most one hour** (`QuoteLifetimeTooLong`) |
| Anyone can register as an (inactive) anchor, and the anchor list had no limit | An attacker could grow the list until registering became too expensive | The list is **capped at 200** (`TooManyAnchors`) |
| No emergency control | No way to stop new money coming in if a bug were found | **Pause** built on OpenZeppelin's Pausable (`stellar-contract-utils`). While paused, no new orders open; paying, confirming, disputing and refunding still work, so money is never trapped |

## Checklist from the Stellar developer skill

| Check | Status | Where |
|---|---|---|
| Privileged functions require auth from an address loaded from storage | Yes | Admin comes from stored config: `set_active`, `resolve`, `update_config`, `set_sender_limit`, `pause`, `unpause` |
| Every layer that uses an address's authority re-authorises it | Yes | `open_order` requires the sender's auth before moving the sender's USDC; `add_bond`, `withdraw_bond`, `mark_paid` require the anchor's; `confirm`, `dispute` require the order's sender |
| Initialisation can only happen once | Yes | Constructor; there is no `init` function |
| External contracts are allowlisted, return values sanity-checked | Yes | The only external contracts are the USDC token and the oracle, both fixed in config by the admin. Oracle price must be positive and at most 10 minutes old; no price means no order |
| Arithmetic checked; input signs and ranges validated | Yes | `checked_*` everywhere and `overflow-checks = true`; amounts must be positive; config is validated |
| Storage keys typed and collision-free | Yes | One `#[contracttype]` `DataKey` enum |
| TTLs extended; TTL not used as a security mechanism | Yes | Every write extends its entry. Replay protection relies on the quote's explicit expiry plus the one-hour cap, not on an entry expiring |
| Loops and footprints bounded on attacker-shaped input | Yes | The only growing collection is the anchor list, capped at 200 |
| Events for auditable state changes; error codes never renumbered | Yes | 11 events, no personal data in any of them; retired codes are kept |
| Caller-supplied slippage bound | Yes | The sender passes `max_markup_bps`; the contract enforces the tighter of that and its own 3% cap |
| Emergency controls (pause) | Yes | See above |
| Upgrade path | Not applicable | The contract is not upgradeable; a new version is a new deployment |
| Deployed WASM traceable to source (SEP-55 attestation) | **Not yet** | Stellar Lab shows the build as unverified. Roadmap |

Things the platform rules out for us: reentrancy and `delegatecall`-style hijacks do not exist on Soroban, and the host enforces replay protection on signed authorisations.

## Soroban "Common Pitfalls"

| Pitfall | How RateRace handles it |
|---|---|
| Panics with unhelpful messages | Every public function returns `Result<_, Error>` with a numbered error. The one deliberate trap is a bad quote signature (`ed25519_verify`) |
| Integer overflow | Checked arithmetic throughout |
| Missing authorisation | See the checklist above; tests remove all signatures and confirm each guarded call fails |
| Storage TTL | Persistent and instance entries are extended on every write |

## Tests

73 unit tests (65 contract, 8 mock oracle). Every rejection path has a test, including: wrong or
altered signature, expired or reused quote, missing or stale oracle price, markup over the cap,
daily limit, insufficient bond, unauthorised callers, double payout, late payout, early refund,
and a balance invariant (contract balance = bonds + escrow of open orders).

## Known limits (disclosed)

- **The admin is one key.** It approves anchors, resolves disputes and can pause. Production needs a multisig or role-based access control.
- **The bank payout is off-chain.** The contract cannot see it; it relies on the anchor's bond, the dispute window and the sender's confirmation.
- **Token edge cases.** USDC is a Stellar Asset Contract. If a sender removes their USDC trustline while an order is open, a refund to them fails until they restore it.
- **Mock oracle on testnet.** Reflector's testnet feed has no live MXN price (see `contracts/mock_oracle/REFLECTOR_CHECK.md`). The contract reads it through the Reflector interface, so mainnet is a one-address change.
- **Amounts and addresses are public on-chain.** Recipient details are not: only a hash is stored.
- **OpenZeppelin version.** We use `stellar-contract-utils` 0.8.0, the release that supports our SDK line. We have not checked whether that exact release is covered by a published audit report.
- **Static analysis.** Scout (`cargo scout-audit`) result: _pending_.
