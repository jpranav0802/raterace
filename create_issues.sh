#!/usr/bin/env bash
# RateRace: create labels, milestones, issues and a Project board.
# Run from your Mac: bash create_issues.sh
# Safe to re-run: existing labels/milestones/issues (same title) are reused, not duplicated.
set -euo pipefail

REPO="jpranav0802/raterace"
OWNER="jpranav0802"
PRANAV="jpranav0802"
ABHIRAJ="Erenius-Valoraen"
AVANI="avani131313"
MAP="$(mktemp)"
trap 'rm -f "$MAP"' EXIT

# ---------- 0. Collaborators must have accepted the invite to be assignable ----------
for u in "$ABHIRAJ" "$AVANI"; do
  if ! gh api "repos/$REPO/collaborators/$u" --silent 2>/dev/null; then
    echo "STOP: $u has not accepted the repo invite yet (pending invites can't be assigned)."
    echo "Ask them to accept at https://github.com/$REPO/invitations, then re-run."
    exit 1
  fi
done
echo "Both collaborators accepted. Continuing."

# ---------- 1. Labels ----------
lbl() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
lbl "area:contract"  "5319e7" "Soroban contract (Rust)"
lbl "area:backend"   "1d76db" "Router, mock anchors, indexer, sponsor"
lbl "area:web"       "0e8a16" "React web app"
lbl "area:scripts"   "fbca04" "Deploy, seed, demo scripts"
lbl "area:docs"      "c5def5" "README, video, demo deliverables"
lbl "never-cut"      "b60205" "Never cut: sig verify, escrow, bond reserve, oracle markup check, testnet deploy"
lbl "cuttable"       "d4c5f9" "Cut in this order if behind: leaderboard > admin UI > dispute/resolve > indexer"
lbl "flow:supply"    "006b75" "Pranav: foundation + anchor side"
lbl "flow:sender"    "0052cc" "Abhiraj: sender side (request -> award)"
lbl "flow:settle"    "e99695" "Avani: settlement side (payout -> settle/refund)"
lbl "shared"         "bfdadc" "Whole team"
echo "Labels done."

# ---------- 2. Milestones (times are Toronto, EST) ----------
ms() {
  local title="$1" due="$2" desc="$3"
  if ! gh api "repos/$REPO/milestones?state=all&per_page=100" --jq '.[].title' | grep -Fxq "$title"; then
    gh api "repos/$REPO/milestones" -f title="$title" -f due_on="$due" -f description="$desc" --silent
  fi
}
ms "M0 Foundation"        "2026-11-14T22:30:00Z" "Sat 14 Nov 5:30 PM. Scaffold + frozen contract interface merged; everyone can build."
ms "M1 Contract on testnet" "2026-11-15T04:59:00Z" "Sat 14 Nov 11:59 PM. All contract functions + tests; scripted testnet run: register 3 anchors -> quote -> open_order -> mark_paid -> release, plus expired -> refund."
ms "M2 End-to-end in browser" "2026-11-15T23:00:00Z" "Sun 15 Nov 6:00 PM. A judge can send from the browser and watch the best anchor win and get paid."
ms "M3 Demo-ready"         "2026-11-16T04:59:00Z" "Sun 15 Nov 11:59 PM. Admin, leaderboard, demo scenarios, README with contract IDs, live URL."
ms "M4 Ship"               "2026-11-16T17:00:00Z" "Mon 16 Nov 12:00 PM. Video recorded, final redeploy, main frozen. Devpost closes 4:00 PM."
echo "Milestones done."

# ---------- 3. Issues ----------
EXISTING="$(gh issue list --repo "$REPO" --state all --limit 300 --json number,title --jq '.[] | "\(.number)\t\(.title)"')"

# mk KEY "Title" "labels" "assignees" "Milestone"   (body on stdin; @@KEY@@ -> #number)
mk() {
  local key="$1" title="$2" labels="$3" who="$4" milestone="$5" body num
  body="$(cat)"
  while IFS=$'\t' read -r k n; do body="${body//@@$k@@/#$n}"; done < "$MAP"
  num="$(printf '%s\n' "$EXISTING" | awk -F'\t' -v t="$title" '$2==t {print $1; exit}')"
  if [ -z "$num" ]; then
    url="$(printf '%s' "$body" | gh issue create --repo "$REPO" --title "$title" --label "$labels" \
            --assignee "$who" --milestone "$milestone" --body-file -)"
    num="${url##*/}"
    echo "Created #$num  $title"
  else
    echo "Exists  #$num  $title"
  fi
  printf '%s\t%s\n' "$key" "$num" >> "$MAP"
}

COMMON='

---
**Workflow:** branch `<yourname>/<issue#>-short-name` -> PR to `main` with `Closes #<issue#>` -> one teammate reviews -> squash merge. Pull `main` often. Never commit `.env` or secret keys.'

# ===== M0 Foundation =====
mk S0 "Everyone: install toolchain and clone repo" "shared" "$PRANAV,$ABHIRAJ,$AVANI" "M0 Foundation" <<EOF
Each person, on your own machine:

- [ ] Accept the repo invite; \`git clone https://github.com/$REPO.git\`
- [ ] Rust + \`rustup target add wasm32v1-none\`
- [ ] Stellar CLI (\`brew install stellar-cli\`); check \`stellar --version\`
- [ ] Node.js LTS + npm
- [ ] Join Stellar Developer Discord (https://discord.gg/stellardev)
- [ ] Open Stellar Lab on testnet once (https://lab.stellar.org) and fund a throwaway account with Friendbot

**Done when:** all three tick every box and comment the output of \`stellar --version\` and \`node -v\`.$COMMON
EOF

mk P1 "Monorepo scaffold (contracts, services, web shell)" "area:contract,area:backend,area:web,flow:supply,never-cut" "$PRANAV" "M0 Foundation" <<'EOF'
Create the repo layout from the handoff:

```
/contracts/raterace      Soroban contract (Cargo workspace member)
/contracts/mock_oracle   SEP-40 mock (workspace member)
/packages/shared         shared TS config/types (network, contract IDs from env)
/router  /anchors  /indexer   Node + TypeScript services (npm workspaces)
/web                     Vite + React + TS app shell with empty routes: /send /order/:id /leaderboard /admin
/scripts                 deploy, seed, demo scripts (TypeScript, run with tsx)
.env.example             every variable the services need (no secrets)
```

- [ ] Check and pin current versions: `soroban-sdk`, Stellar CLI, `@stellar/stellar-sdk` (from docs/crates.io/npm; don't guess)
- [ ] Root `package.json` with npm workspaces + scripts: `build:contracts`, `test:contracts`, `dev:web`, `dev:services`
- [ ] Mobile-friendly base layout in web (no crypto jargon anywhere)

**Done when:** on a clean clone, `stellar contract build` and `npm install && npm run dev:web` both work.
EOF

mk P2 "Freeze contract interface: types, errors, storage keys, stubbed functions" "area:contract,flow:supply,never-cut" "$PRANAV" "M0 Foundation" <<'EOF'
**This blocks everyone. Target: merged within ~90 minutes of starting.** Depends on @@P1@@.

In `contracts/raterace/src/`:
- `types.rs`: `Anchor`, `Quote`, `Order`, `Status`, `Config` exactly as in handoff §8 (i128 amounts, 7 decimals; corridors like `MX_SPEI`)
- `errors.rs`: `#[contracterror]` enum covering every failure path (NotAdmin, AnchorInactive, CorridorNotAllowed, QuoteExpired, RequestIdUsed, BadSignature, OracleUnavailable, OracleStale, MarkupTooHigh, DailyCapExceeded, InsufficientBond, WrongStatus, DeadlinePassed, DeadlineNotPassed, WindowOpen, WindowClosed, ...)
- `storage.rs`: `DataKey` enum (Config instance; Anchor/Order persistent with extend_ttl; RequestId + SenderDaily temporary)
- `lib.rs`: every function from §8 with the final signature, body `panic!("todo")` (or `unimplemented!()`)
- `events.rs`: event topic names (registered, bond_added, awarded, paid, confirmed, disputed, resolved, refunded, released). No PII.
- Split implementation into modules so we don't collide: `registry.rs` (Pranav), `orders.rs` (Abhiraj), `settle.rs` (Avani)

**Done when:** it compiles, is merged to `main`, and Abhiraj + Avani confirm they can code against it.
EOF

mk A0 "Mock oracle contract + check Reflector testnet fiat feed" "area:contract,flow:sender,never-cut" "$ABHIRAJ" "M0 Foundation" <<'EOF'
Depends on @@P1@@ (can start in parallel once the folder exists).

- [ ] Check Reflector docs/repo for a **testnet** fiat feed with MXN. Record the answer (contract ID or "none") in a comment here. Mainnet fiat feed for reference: `CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC` (decimals 14, resolution 300 s)
- [ ] `contracts/mock_oracle`: same interface subset as Reflector: `lastprice(asset) -> Option<PriceData{price, timestamp}>`, `decimals`, `resolution`, `assets`; asset key `Asset::Other(Symbol)`
- [ ] Admin-only `set_price(asset, price)` and `set_timestamp(asset, ts)` (to fake a stale price in the demo)
- [ ] Unit tests

**Done when:** builds and tests pass; the RateRace contract can call it with a generated client via `contractimport!` or a shared trait.
EOF

# ===== M1 Contract on testnet =====
mk P4 "Contract: registry, bonds, quote_digest, getters (+ tests)" "area:contract,flow:supply,never-cut" "$PRANAV" "M1 Contract on testnet" <<'EOF'
Depends on @@P2@@. File: `registry.rs`.

- [ ] `init(config)` (admin auth, once only)
- [ ] `register_anchor(anchor, signing_key, corridors)` -> active=false, emit `registered`
- [ ] `set_active(anchor, bool)` admin only
- [ ] `add_bond(anchor, amount)` SAC transfer anchor -> contract; emit `bond_added`
- [ ] `withdraw_bond(anchor, amount)` require amount <= bond - reserved
- [ ] `quote_digest(quote) -> BytesN<32>` = `sha256(quote.to_xdr(&env))`
- [ ] getters: `get_anchor`, `get_config`, `list_anchor_ids`
- [ ] Checked i128 math everywhere

**Tests:** non-admin activate fails; double init fails; withdraw above free bond fails; bond balances correct; digest is deterministic.

**Done when:** `cargo test` green, PR merged.
EOF

mk A1 "Contract: open_order with all checks + sender limits" "area:contract,flow:sender,never-cut" "$ABHIRAJ" "M1 Contract on testnet" <<'EOF'
Depends on @@P2@@, @@A0@@. File: `orders.rs`. Checks **in this order** (handoff §8):

1. `sender.require_auth()`
2. anchor exists, active, corridor allowed
3. `quote.expires_at > now`
4. `request_id` unused -> mark used (temporary storage)
5. `env.crypto().ed25519_verify(signing_key, digest, sig)` over `quote_digest(quote)`
6. oracle `lastprice(Asset::Other(asset_code))`; reject if None or `now - timestamp > max_oracle_age_s`
7. `landed_usd = landed_local * price / 10^14` (use oracle `decimals`, don't hardcode if avoidable); `markup_bps = (send_usdc - landed_usd) * 10000 / send_usdc`; require `<= min(max_markup_bps, default_max_markup_bps)`
8. sender daily cap (`set_sender_limit(sender, tier, daily_cap)` admin; track spent per sender per day in temporary storage)
9. reserve = `send_usdc * bond_ratio_bps / 10000`; require bond - reserved >= reserve; reserved += reserve
10. SAC transfer sender -> contract; store Order (payout_deadline = now + payout_window_s); emit `awarded`; return order id

**Done when:** implemented, merged, used by @@A2@@ tests.
EOF

mk A2 "Contract tests: every open_order failure path" "area:contract,flow:sender,never-cut" "$ABHIRAJ" "M1 Contract on testnet" <<'EOF'
Depends on @@A1@@. Use `ed25519-dalek` (dev-dependency) to sign digests in tests.

- [ ] happy path: USDC moved to escrow, reserved bond increased, event emitted
- [ ] bad signature / signed by a different key
- [ ] expired quote
- [ ] reused request_id
- [ ] oracle missing price; oracle stale
- [ ] markup over cap (e.g. quote 6% under market)
- [ ] inactive anchor; corridor not allowed
- [ ] insufficient free bond
- [ ] over sender daily cap
- [ ] unauthorized sender

**Done when:** all green in CI/local `cargo test`.
EOF

mk V1 "Contract: settlement (mark_paid, confirm, release, dispute, resolve, refund_expired)" "area:contract,flow:settle,never-cut" "$AVANI" "M1 Contract on testnet" <<'EOF'
Depends on @@P2@@. File: `settle.rs`. Until P2 merges, start @@V5@@/@@V6@@ against fake data.

- [ ] `mark_paid(anchor, order_id, payout_ref)` anchor auth; Open and now <= deadline; USDC escrow -> anchor; status Paid; challenge_ends = now + challenge_window_s; filled += 1; emit `paid`
- [ ] `confirm(order_id)` sender auth; Paid; release reserved bond; Settled
- [ ] `release(order_id)` anyone; Paid and window over; release bond; Settled
- [ ] `dispute(order_id)` sender auth; Paid and within window; Disputed; disputed += 1
- [ ] `resolve(order_id, anchor_at_fault)` admin; at fault -> sender gets send_usdc + penalty (penalty_bps) from bond, slashed += 1, Slashed; else release bond, Settled
- [ ] `refund_expired(order_id)` anyone; Open and now > deadline; refund send_usdc from escrow + penalty from bond; slashed += 1; Refunded
- [ ] `get_order` getter; all events; checked math; bond/reserved never negative

**Done when:** implemented and merged, tested by @@V2@@.
EOF

mk V2 "Contract tests: every settlement failure path" "area:contract,flow:settle,never-cut" "$AVANI" "M1 Contract on testnet" <<'EOF'
Depends on @@V1@@.

- [ ] happy path: open -> mark_paid -> confirm; and open -> mark_paid -> release after window
- [ ] double mark_paid; mark_paid by wrong anchor; mark_paid after deadline
- [ ] confirm by non-sender; release before window ends
- [ ] dispute after window; resolve both branches (penalty math exact)
- [ ] refund before deadline fails; refund after deadline pays send_usdc + penalty, bond reduced
- [ ] bond reserved/released correctly across all paths

**Done when:** all green.
EOF

mk P5 "Deploy script (idempotent) + TypeScript bindings" "area:scripts,flow:supply,never-cut" "$PRANAV" "M1 Contract on testnet" <<'EOF'
Depends on @@P4@@, @@A0@@. `scripts/deploy.ts`. Testnet can reset, so this must rebuild everything from zero.

- [ ] Create + Friendbot-fund: admin, sender, alpha, beta, gamma, usdc-issuer, sponsor
- [ ] Issue test USDC, deploy its SAC, trustlines, mint to sender + anchors
- [ ] Deploy mock_oracle (or use Reflector testnet if @@A0@@ found one), set MXN price
- [ ] Deploy raterace, `init` with demo config (payout_window_s 900, challenge_window_s 120, bond_ratio_bps 10500, penalty_bps 500, default_max_markup_bps 300, max_oracle_age_s 600)
- [ ] Register + bond + activate alpha, beta, gamma (each with its own ed25519 quote-signing key)
- [ ] Write `.env` (gitignored) and `deployments/testnet.json` (public: contract IDs + Stellar Expert links, **no secrets**)
- [ ] `stellar contract bindings typescript` -> `packages/bindings`; script to regenerate

**Done when:** `npm run deploy` from scratch prints all contract IDs and links.
EOF

mk V3 "Scripted testnet run: happy path + expired refund path" "area:scripts,flow:settle,never-cut" "$AVANI" "M1 Contract on testnet" <<'EOF'
Depends on @@P5@@, @@A1@@, @@V1@@. `scripts/smoke.ts` using the bindings.

- [ ] Path 1: anchor signs quote -> `open_order` -> `mark_paid` -> wait window -> `release` -> Settled
- [ ] Path 2: `open_order` with gamma -> no payout -> after deadline `refund_expired` -> sender refunded + penalty; gamma slashed
- [ ] Print a Stellar Expert testnet link for every transaction
- [ ] Use short demo windows (env override) so it runs in a few minutes

**Done when:** both paths pass on testnet; paste the links here. **This is the M1 gate.**
EOF

# ===== M2 End-to-end in browser =====
mk P6 "Mock anchors: SEP-38-shaped quote service (alpha, beta, gamma)" "area:backend,flow:supply,never-cut" "$PRANAV" "M2 End-to-end in browser" <<'EOF'
Depends on @@P5@@. `/anchors` (quoting half; payout worker is @@V4@@).

- [ ] One service, three anchor configs: Alpha (120 bps spread, low payout fee), Beta (80 bps, higher fee), Gamma ("bad": attractive quotes, never pays)
- [ ] `POST /quote` SEP-38 shape + landed-amount extension: returns quote fields, fee breakdown, `landed_local`, `expires_at`, `signature`
- [ ] Pricing: `landed = send_usdc * (1/price) * (1 - spread) - payout_fee`, price from the same oracle the contract uses
- [ ] Get digest by **simulating** `quote_digest` via RPC (never re-encode XDR in JS), sign with the anchor's ed25519 key
- [ ] Refuse to quote if free bond < required reserve

**Done when:** a quote from each anchor is accepted by `open_order` on testnet.
EOF

mk A3 "Quote router: POST /rfq fan-out, validate, rank" "area:backend,flow:sender,never-cut" "$ABHIRAJ" "M2 End-to-end in browser" <<'EOF'
Depends on @@P6@@ (start with stubbed anchors right away). `/router`, Express or Fastify.

- [ ] `POST /rfq {corridor, asset_code, send_usdc, sender, recipient_country, method}` -> request_id (32 random bytes), expires_at = now + 120
- [ ] Fan out to every active anchor's quote URL, 3-5 s timeout, ignore failures
- [ ] Validate each: signature against on-chain `signing_key` (via `get_anchor`), expiry, bond headroom, markup vs oracle
- [ ] Return quotes sorted by `landed_local` desc, with markup bps, fee breakdown, anchor reputation
- [ ] `GET /anchors`; CORS for the web app
- [ ] Router never holds funds or keys that can move funds

**Done when:** `curl` to `/rfq` returns 3 ranked, valid quotes.
EOF

mk A4 "Fee sponsorship: fee-bump submit endpoint" "area:backend,flow:sender,never-cut" "$ABHIRAJ" "M2 End-to-end in browser" <<'EOF'
`POST /submit` on the router (or a small `/sponsor` service).

- [ ] Accept a sender-signed inner transaction XDR
- [ ] Allow-list: only calls to the RateRace contract (no arbitrary txs)
- [ ] Wrap in a fee-bump signed by the sponsor account; submit via RPC `sendTransaction`; poll result
- [ ] Return tx hash + Stellar Expert link
- [ ] Note in README: senders never hold or see XLM; sponsored reserves = stretch

**Done when:** an `open_order` from a sender with 0 spare XLM for fees succeeds.
EOF

mk V4 "Mock anchors: payout worker (watch awarded, simulate SPEI, mark_paid)" "area:backend,flow:settle,never-cut" "$AVANI" "M2 End-to-end in browser" <<'EOF'
Depends on @@P6@@, @@V1@@. `/anchors/payout-worker`.

- [ ] Poll RPC `getEvents` for `awarded` events where anchor = me
- [ ] Simulate SPEI payout (short delay, fake receipt JSON), `payout_ref = sha256(receipt)`
- [ ] Call `mark_paid`; log Stellar Expert link
- [ ] Gamma is configured to never pay (for the refund + slash demo)
- [ ] Survives restarts (persist last processed ledger cursor)

**Done when:** Alpha/Beta orders reach Paid automatically on testnet; Gamma orders stay Open.
EOF

mk V5 "Indexer: getEvents -> orders + leaderboard API" "area:backend,flow:settle,cuttable" "$AVANI" "M2 End-to-end in browser" <<'EOF'
`/indexer`. (Cut fallback: web polls contract getters directly.)

- [ ] Poll RPC `getEvents` from the deploy ledger for the RateRace contract
- [ ] Build order state + per-anchor stats (filled, disputed, slashed, bond, reserved) in memory/JSON
- [ ] `GET /orders/:id`, `GET /orders?sender=`, `GET /leaderboard`
- [ ] Include tx hash per state change for Stellar Expert links

**Done when:** state matches `get_order` / `get_anchor` for the smoke-test orders.
EOF

mk A5 "Web: send page + embedded demo wallet" "area:web,flow:sender,never-cut" "$ABHIRAJ" "M2 End-to-end in browser" <<'EOF'
Depends on @@P1@@. Route `/send`.

- [ ] Inputs: amount in USD, recipient name, CLABE (SPEI) / phone; corridor fixed to MX_SPEI but configurable
- [ ] Recipient details **hashed client-side** (sha256) -> only `recipient_hash` leaves the browser toward the chain
- [ ] Embedded demo keypair (no seed phrase shown, no Freighter); clearly a demo wallet in code comments/README
- [ ] Amounts only in USD and MXN; zero crypto jargon; mobile-first

**Done when:** form submits an RFQ to the router and shows a loading state.
EOF

mk A6 "Web: quote board + lock offer (open_order via sponsor)" "area:web,flow:sender,never-cut" "$ABHIRAJ" "M2 End-to-end in browser" <<'EOF'
Depends on @@A3@@, @@A4@@, @@A5@@.

- [ ] Card per anchor: **landed MXN** (big), markup vs market mid-rate, fee breakdown, reputation, 120 s countdown
- [ ] Best offer highlighted green; sending app's on-ramp fee shown **separately** (we optimize the payout half)
- [ ] "Send with this offer" -> build `open_order` via bindings -> sender signs -> `/submit` fee-bump -> redirect to `/order/:id`
- [ ] Friendly errors for contract rejections (expired, over-markup, stale price)

**Done when:** from the browser, an offer locks and the tx shows on Stellar Expert.
EOF

mk V6 "Web: order tracker with Stellar Expert links + confirm/dispute" "area:web,flow:settle,never-cut" "$AVANI" "M2 End-to-end in browser" <<'EOF'
Depends on @@V5@@ (or getters). Route `/order/:id`.

- [ ] Timeline: Offer locked -> Family paid -> Done (or Refunded / Disputed / Slashed), plain words
- [ ] Payout deadline + challenge window countdowns
- [ ] "View on Stellar" link for every transaction
- [ ] Sender buttons: "Money arrived" (`confirm`), "Report a problem" (`dispute`); `refund_expired` button appears after deadline
- [ ] Auto-refresh

**Done when:** the full happy path is visible live in the browser.
EOF

# ===== M3 Demo-ready =====
mk P7 "Web: admin panel" "area:web,flow:supply,cuttable" "$PRANAV" "M3 Demo-ready" <<'EOF'
Route `/admin` (cut fallback: scripts).

- [ ] Approve/suspend anchors (`set_active`)
- [ ] Resolve disputes (`resolve`, at fault / not at fault)
- [ ] Set mock oracle MXN price; "make price stale" toggle (`set_timestamp`)
- [ ] Set sender limit tier (`set_sender_limit`)
- [ ] Admin key only from local env; never shipped in the public build

**Done when:** each control works on testnet with a Stellar Expert link.
EOF

mk P8 "Web: anchor leaderboard" "area:web,flow:supply,cuttable" "$PRANAV" "M3 Demo-ready" <<'EOF'
Depends on @@V5@@. Route `/leaderboard`. **First thing to cut if behind.**

- [ ] Per anchor: orders filled, disputed, slashed, bond, reserved, active
- [ ] Updates after the Gamma slash scenario

**Done when:** Gamma visibly drops after @@V7@@ runs.
EOF

mk A7 "Demo script: rejection scenarios (stale oracle, over-markup)" "area:scripts,flow:sender" "$ABHIRAJ" "M3 Demo-ready" <<'EOF'
`scripts/demo-rejections.ts`.

- [ ] Stale oracle -> `open_order` rejected with OracleStale
- [ ] Quote ~6% under market -> rejected with MarkupTooHigh
- [ ] Print the contract error clearly (for the video's "flash" shot)

**Done when:** both rejections reproduce on testnet on demand.
EOF

mk V7 "Demo script: Gamma fails -> refund + slash" "area:scripts,flow:settle" "$AVANI" "M3 Demo-ready" <<'EOF'
`scripts/demo-gamma.ts`. Matches video script step 2 (handoff §10).

- [ ] Open order with Gamma (best quote) -> Gamma never pays -> after short deadline `refund_expired`
- [ ] Print: sender refunded + penalty, Gamma bond reduced, slashed count +1, Stellar Expert links

**Done when:** runs end to end in < 3 minutes with demo windows.
EOF

mk P9 "README: what, setup, run, contract IDs, Stellar features used" "area:docs,flow:supply,never-cut" "$PRANAV" "M3 Demo-ready" <<'EOF'
Each owner writes their section; Pranav integrates.

- [ ] What it is + one-line pitch (match the submitted Devpost text)
- [ ] Architecture diagram (on-chain vs off-chain)
- [ ] Setup + run steps that work on a clean clone
- [ ] **Contract IDs + Stellar Expert links** (from `deployments/testnet.json`)
- [ ] "Stellar features used" table: only what is actually built (handoff §15b)
- [ ] Honest limits: mock anchors, admin dispute resolution, demo wallet, payout off-chain
- [ ] Demo steps for judges

**Done when:** a teammate follows it from scratch without asking questions.
EOF

mk A8 "Hosted live demo URL" "area:backend,area:web,flow:sender" "$ABHIRAJ" "M3 Demo-ready" <<'EOF'
Judges should be able to try it without cloning.

- [ ] Pick hosts (team decision: free tier for web + one Node host for router/anchors/indexer)
- [ ] Deploy with testnet env; secrets only in host env vars
- [ ] Add URL + QR to README

**Done when:** a phone on mobile data completes a send on the live URL.
EOF

# ===== M4 Ship =====
mk V8 "Record the real 1-minute demo video" "area:docs,flow:settle,never-cut" "$AVANI" "M4 Ship" <<'EOF'
Follow the handoff §10 video script. Working prototype only, no slides.

- [ ] Quote board with Alpha/Beta/Gamma -> Gamma wins -> fails -> refund + slash
- [ ] Re-send -> Alpha wins -> paid -> confirm -> Settled
- [ ] Flash: stale oracle rejected; over-markup rejected
- [ ] Show at least one Stellar Expert transaction page and one contract event
- [ ] Upload (YouTube unlisted), link in README

**Done when:** link works in a logged-out browser.
EOF

mk S1 "Everyone: final testnet redeploy + two full dry runs, freeze main" "shared,never-cut" "$PRANAV,$ABHIRAJ,$AVANI" "M4 Ship" <<'EOF'
- [ ] Fresh `npm run deploy`; update README contract IDs
- [ ] Dry run 1 and 2 of the full demo on the showcase laptop
- [ ] Repo public, no secrets in history (`git log -p | grep -i secret` sanity check)
- [ ] Freeze `main` at Mon 12:00 PM; only critical fixes after

**Done when:** two clean runs in a row.
EOF

echo
echo "Issues done."

# ---------- 4. Project board (needs 'project' scope) ----------
if gh project list --owner "$OWNER" --limit 1 >/dev/null 2>&1; then
  PNUM="$(gh project list --owner "$OWNER" --format json --jq '.projects[] | select(.title=="RateRace build") | .number' | head -1)"
  if [ -z "$PNUM" ]; then
    PNUM="$(gh project create --owner "$OWNER" --title "RateRace build" --format json --jq '.number')"
    gh project link "$PNUM" --owner "$OWNER" --repo "$REPO" >/dev/null || true
  fi
  while IFS=$'\t' read -r k n; do
    gh project item-add "$PNUM" --owner "$OWNER" --url "https://github.com/$REPO/issues/$n" >/dev/null || true
  done < "$MAP"
  echo "Project board: https://github.com/users/$OWNER/projects/$PNUM"
else
  echo "Skipped project board: run  gh auth refresh -s project  then re-run this script."
fi

echo "All done: https://github.com/$REPO/issues"
