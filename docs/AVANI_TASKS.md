# RateRace: Avani's tasks (handoff for your own Claude)

Written Sat 14 Nov 2026, 4:40 PM Toronto. Give this whole file to your Claude together with `docs/BUILD_PLAN.md` from the repo. Where the two disagree, **this file wins** (it is newer).

- Repo: https://github.com/jpranav0802/raterace (you have write access as `avani131313`)
- Issues: https://github.com/jpranav0802/raterace/issues · Board: https://github.com/users/jpranav0802/projects/1
- Showcase and Devpost deadline: **Mon 16 Nov, 4:00 PM**
- Team: Pranav (`jpranav0802`), Abhiraj (`Erenius-Valoraen`), Avani (`avani131313`)

---

## 1. What RateRace is (30 seconds)

Every remittance is a live auction. A sender sends $200 (USDC on Stellar) to a family in Mexico. Three payout providers ("anchors": Alpha, Beta, Gamma; mocked by us on testnet) each sign a quote for the exact pesos the family receives after all fees. The best wins. A Soroban contract verifies the anchor's signature, checks the markup against an oracle, holds the sender's USDC in escrow, and reserves part of the anchor's bond.

**Your part is everything after the order is opened:** the anchor reports the payout and gets paid, the sender confirms or disputes, the bond is released, and if the anchor misses the deadline the sender is refunded plus a penalty and the anchor is suspended. Then the services and screen that show this to the user.

## 2. What is already on `main` (state at 4:40 PM)

| Thing | Status |
|---|---|
| Repo scaffold: Rust workspace, npm workspaces, web shell | Merged |
| Frozen contract interface: `types.rs`, `errors.rs`, `storage.rs`, `events.rs`, `lib.rs` (20 public functions) | Merged. **Do not change** (see section 7) |
| `registry.rs` (Pranav): config, anchors, bonds, sender limits, `quote_digest` | Merged, 17 tests pass |
| `orders.rs` (Abhiraj): `open_order` | **Stub** (`todo!()`), not started |
| `settle.rs` (**you**): 6 functions | **Stub** (`todo!()`) with final signatures |
| Shared test setup `contracts/raterace/src/test/helpers.rs` | Merged |
| Design system (black and grey, shadcn-style) + reference page `/design` | Merged |
| Mock oracle contract | Written, on branch `pranav/4-mock-oracle`, not merged yet. **You don't need it**: unit tests use a built-in `TestOracle` |
| Testnet deploy, router, anchors, indexer logic, real pages | Not started |

Versions (pinned, don't upgrade): Rust stable + target `wasm32v1-none`, Stellar CLI 30.0.1, `soroban-sdk` 29.0.1, `@stellar/stellar-sdk` 17.4.0, Node >= 22.12, TypeScript 5.9.

## 3. Laptop setup (once)

Mac (Windows: install Rust from rustup.rs, `winget install --id Stellar.StellarCLI`, Node 22 from nodejs.org, GitHub CLI from cli.github.com):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup target add wasm32v1-none
brew install stellar-cli gh node@22
gh auth login
gh repo clone jpranav0802/raterace
cd raterace
npm install
cargo test
stellar contract build
```

Expected: `cargo test` shows `17 passed` for `raterace`; the build ends with `Build Complete` twice. Then comment your `stellar --version` and `node -v` on issue #1.

Set your identity so commits are credited to you:

```bash
git config --global user.name "Avani Tiwari"
git config --global user.email "<the email on your GitHub account>"
```

zsh tip: don't paste commands that contain `# comments`; zsh errors on them.

## 4. Your tasks, in order

### Can start right now (no dependency on anyone)

#### Task A: settlement contract (issue #8, never-cut) — do this first
Branch `avani/8-settlement`. File: `contracts/raterace/src/settle.rs` (only this file; remove the `#![allow(unused_variables)]` line when done).

Use the helpers, never raw `env.storage()`:
- `storage::config(env)?`, `storage::load_order(env, id)?`, `storage::save_order(env, &order)`, `storage::load_anchor(env, &addr)?`, `storage::save_anchor(env, &addr, &anchor)`
- `events::emit_paid / emit_confirmed / emit_released / emit_disputed / emit_resolved / emit_refunded / emit_anchor_active`
- `soroban_sdk::token::Client::new(env, &cfg.usdc).transfer(&from, &to, &amount)`; the contract's own address is `env.current_contract_address()`
- `env.ledger().timestamp()` = now (unix seconds)
- Errors: `Error::OrderNotFound` (from `load_order`), `WrongStatus`, `NotOrderAnchor`, `DeadlinePassed`, `DeadlineNotPassed`, `ChallengeWindowOpen`, `ChallengeWindowClosed`, `Overflow`

Definitions: `reserve = order.reserved_bond`; `penalty = order.quote.send_usdc * cfg.penalty_bps / 10000` (checked math → `Error::Overflow`).

Pattern for every function: load config and order → check auth → check status → check time → move money → update anchor and order → save both → emit event.

| # | Function | Rules |
|---|---|---|
| A1 | `mark_paid(anchor, order_id, payout_ref)` | `anchor.require_auth()`; `order.quote.anchor == anchor` else `NotOrderAnchor`; status `Open` else `WrongStatus`; `now <= order.payout_deadline` else `DeadlinePassed`; transfer `send_usdc` contract → anchor; set status `Paid`, `payout_ref = Some(..)`, `challenge_ends = now + cfg.challenge_window_s`; `anchor.filled += 1`; `emit_paid` |
| A2 | `confirm(order_id)` | `order.sender.require_auth()`; status `Paid`; `anchor.reserved -= reserve`; status `Settled`; `emit_confirmed` |
| A2 | `release(order_id)` | no auth; status `Paid`; `now > order.challenge_ends` else `ChallengeWindowOpen`; `anchor.reserved -= reserve`; `Settled`; `emit_released` |
| A3 | `dispute(order_id)` | `order.sender.require_auth()`; status `Paid`; `now <= order.challenge_ends` else `ChallengeWindowClosed`; status `Disputed`; `anchor.disputed += 1`; `emit_disputed` |
| A3 | `resolve(order_id, anchor_at_fault)` | `cfg.admin.require_auth()`; status `Disputed`. **At fault:** transfer `send_usdc + penalty` contract → sender (it comes out of the bond, because the anchor was already paid); `anchor.bond -= send_usdc + penalty`; `anchor.reserved -= reserve`; `anchor.slashed += 1`; status `Slashed`; auto-suspend check. **Not at fault:** `anchor.reserved -= reserve`; status `Settled`. `emit_resolved(.., anchor_at_fault, penalty or 0)` |
| A4 | `refund_expired(order_id)` | no auth; status `Open`; `now > order.payout_deadline` else `DeadlineNotPassed`; transfer `send_usdc + penalty` contract → sender (escrow + penalty from bond); `anchor.bond -= penalty`; `anchor.reserved -= reserve`; `anchor.slashed += 1`; status `Refunded`; auto-suspend check; `emit_refunded(.., refund = send_usdc + penalty, penalty)` |

**Auto-suspend (write one private helper and use it in both slash paths):** after `slashed += 1`, if `anchor.slashed >= cfg.max_slashes` and the anchor is active → `anchor.active = false` and `emit_anchor_active(env, &addr, false)`.

**Money invariant to keep in your head:** contract USDC balance = sum of all anchor bonds + `send_usdc` of every `Open` order. Demo numbers at $200: reserve $210, penalty $10, refund $210.

Done when: `cargo test` and `stellar contract build` pass; PR `Closes #8` (can be the same PR as Task B).

#### Task B: settlement tests (issue #9, never-cut)
File: `contracts/raterace/src/test/settle_tests.rs` (only this file).

`open_order` doesn't exist yet, so start with this helper (already verified to compile and pass against `main`). It creates an Open order exactly as `open_order` will leave it:

```rust
//! Settlement tests. Owner: Avani (issue #9).
use super::helpers::*;
use crate::storage;
use crate::types::{Order, Status};

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
```

What `Setup::new()` gives you (read `test/helpers.rs`): `s.env`, `s.client` (contract), `s.token` (USDC), `s.admin`, `s.sender` (10,000 USDC), `s.contract_id`, `s.anchors[0..3]` (alpha, beta, gamma; each registered, active, 2,000 USDC bonded, 3,000 USDC in wallet), `s.advance(seconds)`, `s.now()`, `s.balance(&addr)`, `usdc(n)`, `mxn(n)`, `START_TIME`. All auths are mocked; `s.env.set_auths(&[])` removes them for "unauthorized" tests. Config: payout window 120 s, challenge window 60 s, bond 105%, penalty 5%, `max_slashes` 1.

Assert errors like this: `assert_eq!(s.client.try_release(&id), Err(Ok(Error::ChallengeWindowOpen)));`

Tests to write (one `#[test]` each):
1. seed → `mark_paid` → `confirm`: anchor wallet +200, contract −200, `reserved` back to 0, status `Settled`, `filled == 1`, `payout_ref` stored
2. seed → `mark_paid` → `advance(61)` → `release`: `Settled`
3. `mark_paid` twice → `WrongStatus`
4. `mark_paid` by a different anchor → `NotOrderAnchor`
5. `advance(121)` then `mark_paid` → `DeadlinePassed`
6. `release` before the window ends → `ChallengeWindowOpen`
7. `confirm` on an `Open` order → `WrongStatus`
8. `dispute` inside the window → `Disputed`, `disputed == 1`; `dispute` after `advance(61)` → `ChallengeWindowClosed`
9. `resolve(true)`: sender ends at 10,010 USDC (got 210 back), anchor `bond == 1,790`, `reserved == 0`, `slashed == 1`, status `Slashed`, anchor `active == false`
10. `resolve(false)`: `Settled`, bond unchanged, anchor still active
11. `resolve` on a non-disputed order → `WrongStatus`
12. `refund_expired` before the deadline → `DeadlineNotPassed`
13. `advance(121)` → `refund_expired`: sender at 10,010 USDC, anchor `bond == 1,990`, `reserved == 0`, `slashed == 1`, `Refunded`, anchor suspended
14. `refund_expired` twice → `WrongStatus`
15. unknown order id → `OrderNotFound`
16. auth: after `s.env.set_auths(&[])`, `try_confirm`, `try_dispute`, `try_mark_paid`, `try_resolve` all `is_err()`
17. invariant after each path: `s.balance(&s.contract_id)` == sum of the three anchors' `bond` + escrow of open orders

Done when: all pass with `cargo test`; PR `Closes #9`. After it merges, comment on issue #6 so Abhiraj knows `seed_order` shows the exact order shape his `open_order` must store.

#### Task C: indexer skeleton with sample data (issue #16, part 1)
Branch `avani/16-indexer`. Folder `indexer/` only. `indexer/src/index.ts` already starts an Express server on port 8790 with `/health`.

Add, serving hardcoded sample data in the frozen shapes (`OrderView`, `LeaderboardRow` from `@raterace/shared`, file `packages/shared/src/types.ts`):
- `GET /orders/:id` → `OrderView` (404 `{ error: "Order not found" }` if unknown)
- `GET /orders?sender=G...` → `OrderView[]`
- `GET /leaderboard` → `LeaderboardRow[]`

Put the sample data in `indexer/src/sample.ts`, clearly marked as sample; include one order in each status (`Open`, `Paid`, `Settled`, `Refunded`) so the tracker page can be built against all states. Amounts are **strings of integer units with 7 decimals** (`"2000000000"` = $200), times are unix **seconds**.

Check: `npm run dev:indexer`, then `curl localhost:8790/orders/1` and `curl localhost:8790/leaderboard`; `npm run typecheck` passes.

Part 2 (real events via RPC `getEvents`) waits for the testnet deploy; see section 5.

#### Task D: order tracker page (issue #19, part 1)
Branch `avani/19-tracker`. File `web/src/pages/Order.tsx` only. Route `/order/:id`.

**Build it only from the shared parts shown at http://localhost:5173/design** (`npm run dev:web`): `PageHeader`, `Steps`, `ProofLink`, `Countdown`, `Receipt`, `Card`, `Button`, `Badge`. Black and grey; green only for money that arrived, red only for problems. No crypto words: say "View proof on Stellar", dollars and pesos (`formatUsd`, `formatMxn` from `@/lib/format`).

- Fetch `GET {config.indexerUrl}/orders/:id` every 3 s (`config` from `@/lib/config`)
- Steps in plain words: "Offer locked, money held safely" → "<Provider> is paying your family" / "Family paid MX$…" → "You confirm it arrived" / "Done"
- Failure states: "<Provider> missed the deadline. You were refunded $210.00. That includes a $10.00 penalty paid by <Provider>."; "Problem reported"; "Provider penalised"
- Countdown to `payoutDeadline` while `Open`, to `challengeEnds` while `Paid`
- One `ProofLink` per entry in `order.txs`
- Buttons, visible but **not wired yet**: "Money arrived" (confirm), "Report a problem" (dispute, only inside the window), "Get my refund" (refund_expired, after the deadline). Leave an `onClick` TODO; wiring needs Abhiraj's wallet and `/submit` (issues #14, #17).

Check at phone width with each sample order id.

If you add a shadcn component (`npx shadcn@latest add <name>` inside `web/`): open the new file and change `from "cn"` to `from "@/lib/utils"`, then run `npm uninstall cn -w @raterace/web`. The CLI gets this wrong in our setup.

### Blocked for now (who you are waiting on)

| Task | Needs |
|---|---|
| #11 testnet smoke run (`scripts/smoke.ts`) — **the M1 gate** | Pranav's deploy (#10) + Abhiraj's `open_order` (#6) + your #8 |
| #15 anchor payout worker (`anchors/src/payout/worker.ts`) | Deploy (#10) + Pranav's anchor quote service (#12) |
| #16 part 2: real event polling | Deploy (#10) |
| #19 part 2: wire the buttons | Abhiraj's wallet + `/submit` (#14, #17) |
| #23 Gamma demo script, #26 demo video | Everything above |

Details for these are in `docs/BUILD_PLAN.md` section 8. Pranav will share a `.env` privately after the deploy; never commit it.

## 5. Order of work and time targets

1. **Now → ~7 PM:** Task A + B (the contract half is the part that must not slip)
2. **Then:** Task C, then Task D
3. **When Pranav posts "deployed":** #11 smoke run immediately, then #15, then #16 part 2

Milestones: M1 contract on testnet **Sat 11:59 PM** · M2 end-to-end in the browser **Sun 6 PM** · M3 demo-ready **Sun 11:59 PM** · M4 ship **Mon 12 PM**.

## 6. Git workflow

```bash
git checkout main && git pull
git checkout -b avani/<issue#>-<short-name>
# work, then:
cargo test                 # if you touched contracts
npm run typecheck          # if you touched TypeScript
git status                 # check nothing unexpected is staged
git add <only your files>
git commit -m "Short description (#<issue>)"
git push -u origin avani/<issue#>-<short-name>
gh pr create --base main --fill --body "Closes #<issue>"
```

- One issue per branch and PR. Ask Pranav or Abhiraj for a quick review; merge with **Squash and merge**. After any merge: `git checkout main && git pull`.
- Never commit `.env`, secret keys (`S...`), `target/`, `node_modules/`, `test_snapshots/`.
- Never push to `main` directly; never force-push.

## 7. Rules that keep the three parts fitting together

1. **Frozen (never change without both teammates agreeing):** everything in `types.rs`, `errors.rs`, `storage.rs`, `events.rs`, the function signatures in `lib.rs`, the JSON shapes in `packages/shared/src/types.ts`, ports (web 5173, router 8787, indexer 8790, anchors 8801–8803), and env variable names in `.env.example`. If something looks wrong, message the team first.
2. **Only edit files you own:** `contracts/raterace/src/settle.rs`, `contracts/raterace/src/test/settle_tests.rs`, `indexer/**`, `anchors/src/payout/**`, `web/src/pages/Order.tsx`, `scripts/smoke.ts`, `scripts/demo-gamma.ts`. You may **add** helpers at the bottom of `test/helpers.rs` and add exports to `packages/shared`; don't rename or change existing ones.
3. Differences from `BUILD_PLAN.md` to know about:
   - amount helpers are `toUnits` / `fromUnits` (not `toStroops` / `fromStroops`)
   - `get_sender_limit` returns `Result<SenderLimit, Error>`
   - the web uses Tailwind v4 + shadcn conventions; styles are in `web/src/index.css` (there is no `styles.css`)
   - unit tests use the `TestOracle` inside `test/helpers.rs`, not the `mock_oracle` crate
4. Checked math everywhere (`checked_add/sub/mul/div` → `Error::Overflow`). No personal data on-chain or in events.

## 8. Prompt to paste into your Claude

```
You are helping Avani Tiwari build her part of RateRace, a Stellar/Soroban hackathon project,
with two teammates working in parallel. I am attaching AVANI_TASKS.md and docs/BUILD_PLAN.md.
Read both fully first. Where they disagree, AVANI_TASKS.md wins.

We work on one task at a time, starting with Task A (settle.rs), then Task B (tests).

Rules:
1. The frozen interfaces (AVANI_TASKS.md section 7) are binding. Never change them; if something
   seems wrong, stop and tell me so I can raise it with the team.
2. Only edit the files I own (section 7, rule 2).
3. Use the pinned versions: soroban-sdk 29.0.1, Stellar CLI 30.0.1, @stellar/stellar-sdk 17.4.0.
   Do not guess SDK APIs: check docs.rs/soroban-sdk/29.0.1 and developers.stellar.org, or read the
   existing code in contracts/raterace/src (registry.rs and test/registry_tests.rs show the
   patterns we use), and say when something is unverified.
4. Write code that compiles. After each step give me the exact command to verify it
   (cargo test, stellar contract build, npm run typecheck, curl ...) and wait for my output.
5. Go one step at a time. Small commits. Follow the git workflow in section 6.
6. Every failure path gets a unit test. Checked math. No personal data on-chain.
7. Never invent facts, results or contract IDs.
8. Explain each function to me in plain language as we go: I need to be able to explain the
   settlement logic to judges.
Start by summarising Task A, the files you will touch and your step plan, then wait.
```

Give your Claude the repo too (clone it or attach the `contracts/raterace/src` folder) so it can read `registry.rs`, `storage.rs`, `events.rs` and `test/helpers.rs`.
