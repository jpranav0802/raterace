# RateRace: Full Project Handoff

Everything about the RateRace project for the Blockchain Innovation Challenge powered by Stellar, in one file. Written 14 Nov 2026. Read it top to bottom before doing any work.

---

## 0. Status right now

| Item | Status |
|---|---|
| Idea | Final: **RateRace** (previously called LandedFX in team notes) |
| Showcase form | **Submitted. RateRace was selected for the top 16** |
| Devpost project | Live and public: https://devpost.com/software/raterace (editable until **Mon 16 Nov, 4:00 PM**) |
| GitHub repo | Created, public, README only: https://github.com/jpranav0802/raterace |
| Demo video on Devpost | Currently a 10-second animated intro (problem → auction → paid on delivery → logo). **Must be replaced by a real 1-minute demo of the working prototype** before the Showcase |
| Code | **Nothing built yet** |
| User validation | **None done yet** (it is scored) |
| Trifold | Board bought (38 × 27 in). Layout planned (section 11). Nothing printed yet |
| Email to organizers | Drafted, asking whether printouts, 3D/lift-the-flap elements and a demo laptop are allowed on/at the trifold. Send to velocity.events@uwaterloo.ca if not sent yet |

**Team (3):** Avani Tiwari, Abhiraj Dutta, Pranav Jain. Pranav is a CS student at the University of Waterloo, originally from Delhi; has previously built Creditect Nexus (AI loan-management/restructuring platform for Indian small businesses). The team frames itself as international students who live the remittance problem.

**How Pranav likes to work:** ask clarifying questions before starting; push back rather than agreeing with his first framing; for technical builds go **one step at a time** and confirm each step; be blunt and concise; never invent facts, quotes or stories.

---

## 1. The hackathon

- **Name:** Blockchain Innovation Challenge powered by Stellar. Hosted by **Velocity** (University of Waterloo), presented by the **Stellar Development Foundation (SDF)**. Runs **Nov 2–18, 2026**.
- **Notion (source of truth):** https://uwvelocity.notion.site/Blockchain-Innovation-Challenge-powered-by-Stellar-03f63713ead683f0a5048160f9a1fd2c
- **Devpost:** https://blockchain-stellar-ic.devpost.com/
- **Help:** technical questions → Stellar Developer Discord https://discord.gg/stellardev ; challenge questions → velocity.events@uwaterloo.ca
- **Rule:** original work started during the challenge; no bringing existing IP (must disclose existing ideas or risk disqualification).
- **Theme:** everyday financial services (payments, savings, credit, insurance, assets) for underbanked people. Notion says the strongest solutions "make serving those users structurally cheaper, so unit economics work at market prices," not subsidised.

### Deadlines

| Date | What | Where |
|---|---|---|
| Fri 13 Nov, 8:30 AM | Showcase form (done) | Online |
| **Mon 16 Nov, 4:00 PM** | Devpost editing closes | Online |
| **Mon 16 Nov, 4:00–7:00 PM** | **Project Showcase**: trifold + 3-minute pitch by ONE team member | E7 Event Space, PSE 2nd floor |
| Tue 17 Nov, 11 AM–1 PM | Finalist pitch prep (top 8 only) | Innovation Arena, Kitchener |
| Wed 18 Nov, 10:00 AM | Final slide deck upload (PowerPoint, **no animations**) | Online |
| Wed 18 Nov, 6:00–8:30 PM | Finals: 3-min pitch + 3-min Q&A, ~$15k prizes | Innovation Arena, Kitchener |

### Deliverables required by the Showcase
1. Prototype live on **Stellar testnet**: contract ID(s) and/or a live app URL judges can use.
2. **Public GitHub repo** with full source and README (what it is, setup, run steps, contract IDs).
3. **One-minute demo video** of the working prototype (not slides), public link (YouTube unlisted is fine), on Devpost.
4. **Trifold board** (visual, keep text under ~25%) and a **3-minute pitch** by one member.

### Judges
- **Showcase:** Shaun Johnson (Ecosystem, SDF); De-Ann Abraham (Global Engagement Lead, Ecosystem Impact, Stellar); Alex Wu (Strategic Initiatives and Policy, SDF).
- **Finals:** Wlademyr Mendes (Senior Developer Advocate, SDF); Shubh Brar "Boxy" (Stellar Growth Ecosystem Contributor, founder of Stellarlight.xyz); Magdiela Rivas (Account Management, Payment Partners, SDF); Griffin Keglevich (Co-founder, Float).
- They know Mento, Circle StableFX and Stellar Community Fund projects. Expect sharp payments and policy questions.

---

## 2. Judging rubric (optimize for every line)

**1. Business Impact and Relevance (37.5%)**
- Problem and social impact: real, specific, significant; backed by evidence; explain how impact (financial inclusion, lower costs) is measured.
- Solution and differentiation: directly solves it; why better than alternatives; advantages from building on Stellar.
- Customer segment: specific, reachable first customer group; sense of market size.
- Monetization: clear revenue model, pricing the customer can afford, early thinking on costs.
- User validation: prototype/MVP tested with real users; concrete feedback; evidence of learning and iterating.

**2. Technology and Implementation (37.5%)** (judges also check whether teams got feedback from relevant partners and users)
- Meaningful, innovative use of Stellar: Stellar essential and used creatively (Soroban, Stellar assets, path payments, anchors and SEPs); explain why Stellar.
- Architecture and scalability: sensible on-chain/off-chain split; clean integration with Horizon or Stellar RPC; realistic path to production.
- Working, verifiable build: deployed testnet/mainnet prototype with an end-to-end core flow; public repo, clear docs, contract IDs.
- Security and trust: smart-contract safety, wallet and key management, authentication, KYC/compliance awareness.
- UX and accessibility: hides blockchain complexity; smooth wallet onboarding, fee sponsorship, mobile-friendly, design for underbanked and low-connectivity users.

**3. Presentation and Deliverables (25%)**
- Clear, concise pitch conveying value proposition and impact.
- At the Showcase: **15% presentation and delivery + 10% trifold effort and display quality** (design, layout, content organization; visually engaging, complements the pitch).

---

## 3. Problem space (our track, full brief)

**Track:** Payments: Cross-Border Remittances, Transnational Households, and the Last Mile.
Notion page: https://uwvelocity.notion.site/Payments-Cross-Border-Remittances-Transnational-Households-and-the-Last-Mile-2f263713ead682a191f701208588067e

**Short description (verbatim summary):** Hundreds of millions earn in one country and support a household in another, underserved at both ends. Sending costs ~6% on average, double the 3% SDG 10.c target, and more cost hides in the exchange rate. The worst failure comes after the transfer succeeds: the recipient can't spend it because the cash agent is far, out of float, or offline. The receiving household gets a transfer and nothing else (no savings, insurance, credit, or direct school-fee payment). The transfer is a commodity heading toward zero margin; the durable opportunity is everything attached to it. Institutions (governments, NGOs, insurers, employers) pay the same households over the same rails, and weeks pass between approval and money in hand. Stellar already carries production remittances with major money-transfer operators and Stellar-powered cash assistance reached displaced people in Ukraine and Latin America. Seeks solutions that shorten the distance between a decision and money in hand, and treat arrival as a beginning. Lived experience is a rewarded founder advantage.

**Looking at:**
1. Full financial life of transnational households
2. Cash-in/cash-out access and agent liquidity in thin, rural, poorly served corridors
3. Products for the receiving household: savings, insurance, credit, bill payment built on cross-border income history
4. Transparent all-in pricing incl. cost hidden in the exchange rate; obligations across two currencies
5. Institutional and humanitarian disbursement over the same rails (incl. cash and voucher assistance in crises)
6. Eligibility, enrolment, beneficiary registries; delivery across bank, mobile money, agent, card, wallet
7. Reconciliation, treasury, FX; fraud, duplication, leakage detection; audit, donor reporting, impact measurement

**Challenges and focus:**
1. Reduce total cost from ~6% toward 3% when much margin hides in the exchange rate
2. Last mile fails after arrival: agents run dry, are far away, or go offline at peak demand
3. Delivery must work on smartphone, basic phone, or cash agent, with or without connectivity
4. Institutional side: weeks from approval to money; losses to fraud, error, intermediary fees
5. Verification rigorous without surveillance; recipient dignity, privacy, choice preserved
6. Institutional buyers bring procurement, security reviews, long sales cycles

**Key challenges for the category:**
1. Licensing/compliance in both markets; entrenched incumbents and habits
2. Receiving side is harder to serve and monetize, and is where impact sits
3. Currency volatility and restrictions on holding foreign currency
4. Local infrastructure, agent liquidity, regulation differ by market
5. Long institutional procurement/pilot cycles; strict legal mandates
6. Conditional payments can undermine recipient autonomy; donor transparency must not endanger recipients
7. Institutional risk tolerance is low; failure is highly visible

---

## 4. The idea: RateRace

**One-liner (submitted):** Every remittance becomes a live auction: providers bid to deliver the most money to your family, and only get paid once it lands.

**Plain version:** When someone sends money home, every licensed Stellar payout provider ("anchor") serving that country sends a signed quote for the exact amount the family will receive after **all** fees (exchange spread + cash-out fee). The best offer wins. A Soroban smart contract verifies the quote, checks its markup against the Reflector oracle market rate, holds the sender's USDC in escrow, and pays the anchor only after it reports the payout. Every anchor posts a USDC bond that is slashed if it fails to deliver.

**Pitch line:** "Stellar moves money in seconds, but one anchor still decides the rate and fees in private. RateRace makes every Stellar anchor compete, in public, on the one number a family cares about: how much actually lands."

**Key design insights (defend these):**
- Anchors bid on the **landed amount**, so nobody can win on rate and claw it back in fees.
- The oracle is a **referee, not the price setter**: it shows markup vs market and caps a lone bidder.
- **No liquidity pool** on the main path: nothing for stale-oracle arbitrage to drain, no LP currency risk.
- Only **licensed, registry-approved anchors** handle money; RateRace is software, not the money transmitter.
- Personal data never goes on-chain (hashes only).

---

## 5. Evidence (with honesty notes)

| Fact | Figure | Source | Note |
|---|---|---|---|
| Global average cost to send $200 | 6.49% (Q1 2025) | World Bank RPW: https://remittanceprices.worldbank.org | Verified |
| Average $200 transfer loses | ~$13 | Derived from 6.49% | |
| Remittances to low/middle-income countries | ~$685B (2024); IFAD reports $728.6B (2025) | World Bank/KNOMAD; IFAD | |
| Stablecoin remittance cost | 0.3% to ~9% across 10 corridors, driven by on/off-ramp conversion, not the chain | Banca d'Italia 2026 mystery-shopping study: https://www.bancaditalia.it/media/notizia/are-stablecoins-efficient-for-remittances-evidence-from-a-mystery-shopping-exercise-by-banca-d-italia/ | |
| Competition lowers price | Markets with several ramp providers ~1.5–4%; single-provider markets often >13% | Borderless.xyz vendor data via Cointelegraph: https://cointelegraph.com/news/africa-stablecoin-fx-spreads-january-data | Vendor data about **African stablecoin spreads**; label as such, don't apply directly to Mexico |
| Live anchor quote | Zeam USDC→BRL public SEP-38 quote ~1.1% worse than oracle rate, before a 0.5% + $1 SEP-24 fee (checked 13 Nov 2026) | Zeam stellar.toml: https://zeam.money/.well-known/stellar.toml | **This was Brazil, not Mexico.** If asked, say Brazilian real |
| Market sizes | Mexico ~$67.6B (2024); Philippines ~$40.3B (2024); Nigeria ~$22.8B (2025, secondary) | Various | |
| IMF on stablecoins in emerging markets | Wants controls on "on-chain exchange points" | https://www.imf.org/en/news/articles/2026/08/07/sp080726-stablecoins-emerging-markets-dan-katz | Supports licensed-anchor-only design |
| BIS on competing rails | | https://www.bis.org/publications/working-paper-1385-competing-rails-crossborder-payments-banks-fintechs-and-stablecoins | Background |

**Stellar Anchor Directory** (https://anchors.stellar.org, parsed 13 Nov 2026; anchors listing SEP-6/24/31 per country; self-reported, real coverage varies; no anchor lists SEP-38 in the directory though Zeam supports it):

| Country | # | Anchors |
|---|---|---|
| Argentina | 7 | Anclap, Bitso, Chronos Pay, Latamex, Mercuryo, MoneyGram, OwlPay |
| Brazil | 6 | APS, Bitso, Latamex, Mercuryo, MoneyGram, OwlPay |
| Mexico | 6 | Anclap, Bitso, Mercuryo, MoneyGram, OwlPay, Puntored |
| Nigeria | 6 | Chipper Cash, Finclusive, Link, Mercuryo, MoneyGram, OwlPay |
| Philippines | 6 | Cebuana, Lightnet, Mercuryo, MoneyGram, OwlPay, PeraHub |
| Colombia | 6 | Anclap, Bitso, Mercuryo, MoneyGram, OwlPay, Puntored |
| Kenya | 5 | ClickPesa, ImpalaPay, Mercuryo, MoneyGram, OwlPay |
| Ghana | 5 | Chipper Cash, Finclusive, Mercuryo, MoneyGram, OwlPay |
| India | 3 | Lightnet, Mercuryo, OwlPay |
| South Africa | 2 | OwlPay, Zeam |

---

## 6. Rejected ideas (know why, judges may ask)

| Idea | Why rejected |
|---|---|
| Offline cash vouchers / payment channels at village shops | Contract flaws (sender could reclaim unsettled funds; `close()` vs partial settle contradiction), shops front cash and wait, needs smartphone, prior art (VIA, Xcapit, Payala, Kura) |
| Earmarked bill payments | Conditional payments undermine recipient autonomy (brief warns against it) |
| Disbursement co-pilot on the Stellar Disbursement Platform | NGO validation impossible in days; Stellar looks incidental |
| Remittance-linked disaster insurance; remittance income passport | Considered strong; team chose a different direction |
| Homebase (one household account for remittances + aid) | Scope too large for the build window |
| Cross-border savings circles; payday splitter | Off-centre of the brief or hard to validate |
| Multilateral netting pool ("transparent hawala") | Needs local-currency tokens that barely exist on Stellar; overlaps with Stellar DEX; heavy FX regulation; B2B only |
| Oracle-priced FX pool | Not novel (Mento; "FX Swap by Hedgehog" funded by SCF #21, $42.5k); stale oracle → arbitrage losses; LP currency risk; one-way flow drains inventory; local tokens have ~zero volume |
| Crypto to cut travel/convenience fees | Tourists aren't the brief's users; Wise/Revolut already do it |

---

## 7. How it works (user flow)

1. **Anchor onboarding (once):** anchor registers signing key + corridors, posts a USDC bond; admin approves (stand-in for licence due diligence).
2. **Request:** sender enters "$200 to recipient, Mexico, SPEI" (or Brazil, PIX).
3. **Bidding:** quote router fans out the request; each anchor returns a signed firm quote: landed local amount, expiry (~120 s), fee breakdown.
4. **Compare:** UI shows landed amount, markup vs Reflector mid-rate, reputation; best highlighted.
5. **Lock:** sender signs `open_order`. Contract verifies signature, expiry, markup, limits; pulls USDC into escrow; reserves part of the winner's bond.
6. **Payout (off-chain):** winning anchor pays the recipient by SPEI/PIX, then calls `mark_paid` with a hash of the payout receipt and receives the USDC; its bond stays reserved for a challenge window.
7. **Settle:** sender/recipient confirms, or the window passes with no dispute → bond released. Dispute freezes bond → admin resolves (MVP) → slash to sender if anchor at fault.
8. **Missed deadline:** if no `mark_paid` before deadline, anyone calls `refund_expired` → sender gets USDC back plus penalty from bond.

Family never touches crypto.

---

## 8. Architecture and technical spec

### Components

| Component | Tech | Responsibility |
|---|---|---|
| Contract (registry + escrow merged, recommended) | Soroban, Rust | Anchors (key, corridors, bond, reserved, reputation, active); orders (verify quote, markup check, escrow, bond reserve, mark_paid/confirm/dispute/resolve/refund/release); events |
| Oracle | Reflector (SEP-40) or a mock with identical interface | Fiat rates (USD per 1 unit of local currency) |
| Test USDC | Stellar Asset Contract (SAC) | Settlement asset; simplest to issue our own test USDC and deploy its SAC |
| Quote router | Node.js / TypeScript (Express or Fastify) | RFQ fan-out, validation, ranking; never holds funds, can't forge quotes |
| Mock anchors (×3) | Node.js | Signed quotes with different spreads; watch events; simulate payout; call mark_paid. One "bad" anchor misses deadlines for the demo |
| Indexer | Node.js using Stellar RPC `getEvents` | Order status + leaderboard |
| Web app | React (Vite or Next.js) + @stellar/stellar-sdk | Send page, quote board, order tracker, anchor leaderboard, admin panel |
| Wallet | Embedded demo keypair or passkey preferred (Freighter loses UX points); fee sponsorship via fee-bump | Sender signing |

**On-chain:** escrowed USDC, bonds, quote verification, markup check, order state, reputation counters, hashes. **Off-chain:** personal data (SEP-12 KYC), payout execution, quote collection, UI.

### Contract types (Soroban; amounts i128, 7 decimals)

```rust
#[contracttype] pub struct Anchor {
    pub signing_key: BytesN<32>,   // ed25519 pubkey for quotes
    pub corridors: Vec<Symbol>,    // e.g. MX_SPEI, BR_PIX, KE_MPESA (use '_' not ':')
    pub bond: i128, pub reserved: i128,
    pub filled: u32, pub disputed: u32, pub slashed: u32,
    pub active: bool,
}
#[contracttype] pub struct Quote {
    pub anchor: Address,
    pub request_id: BytesN<32>,    // single-use, replay protection
    pub corridor: Symbol,
    pub asset_code: Symbol,        // e.g. MXN, BRL (Reflector lookup)
    pub send_usdc: i128,
    pub landed_local: i128,        // what recipient receives AFTER all fees
    pub expires_at: u64,
}
#[contracttype] pub enum Status { Open, Paid, Disputed, Settled, Refunded, Slashed }
#[contracttype] pub struct Order {
    pub sender: Address, pub quote: Quote,
    pub recipient_hash: BytesN<32>,   // hash only, never raw PII
    pub status: Status, pub reserved_bond: i128,
    pub payout_deadline: u64, pub challenge_ends: u64,
    pub payout_ref: Option<BytesN<32>>,
}
#[contracttype] pub struct Config {
    pub admin: Address, pub usdc: Address, pub oracle: Address,
    pub max_oracle_age_s: u64,        // e.g. 600
    pub payout_window_s: u64,         // e.g. 900 demo / 3600
    pub challenge_window_s: u64,      // e.g. 120 demo / 86400
    pub bond_ratio_bps: u32,          // e.g. 10500
    pub penalty_bps: u32,             // e.g. 500
    pub default_max_markup_bps: u32,  // e.g. 300
}
```

### Functions

| Function | Auth | Logic |
|---|---|---|
| `init(config)` | admin | store config |
| `register_anchor(anchor, signing_key, corridors)` | anchor | create, active=false |
| `set_active(anchor, bool)` | admin | approve/suspend |
| `add_bond(anchor, amount)` | anchor | transfer USDC in; bond += amount |
| `withdraw_bond(anchor, amount)` | anchor | amount ≤ bond − reserved |
| `set_sender_limit(sender, tier, daily_cap)` | admin | mock KYC tiers |
| `quote_digest(quote) -> BytesN<32>` | none | sha256(quote.to_xdr()); off-chain signers simulate this and sign the result (avoids Rust/JS encoding mismatch; same trick as Stellar one-way-channel `prepare_commitment`) |
| `open_order(sender, quote, sig, recipient_hash, max_markup_bps) -> u64` | sender | see checks below |
| `mark_paid(anchor, order_id, payout_ref)` | anchor | require Open, before deadline; USDC → anchor; status Paid; start challenge window; filled += 1 |
| `confirm(order_id)` | sender | require Paid; release bond; Settled |
| `release(order_id)` | anyone | Paid and window over; release bond; Settled |
| `dispute(order_id)` | sender | Paid, within window; Disputed |
| `resolve(order_id, anchor_at_fault)` | admin | at fault → pay sender send_usdc + penalty from bond, slashed += 1; else release |
| `refund_expired(order_id)` | anyone | Open and past deadline; refund + penalty from bond; Refunded |
| getters | | get_order, get_anchor, get_config, list_anchor_ids |

**`open_order` checks, in order:** sender.require_auth → anchor active and corridor allowed → not expired → request_id unused (mark used) → ed25519 signature over digest (`env.crypto().ed25519_verify`) → Reflector `lastprice(Asset::Other(asset_code))`, require age ≤ max_oracle_age_s; `landed_usd = landed_local * price / 10^14`; `markup_bps = (send_usdc - landed_usd) * 10000 / send_usdc ≤ max_markup_bps` → sender daily cap → reserve = send_usdc × bond_ratio_bps / 10000, require free bond → transfer USDC sender → contract → store Order, emit `awarded`.

**Events:** registered, bond_added, awarded, paid, confirmed, disputed, resolved, refunded, released. No PII.
**Storage:** config in instance storage; anchors/orders persistent with extend_ttl; used request_ids temporary storage.
**Security checklist:** single-use request_id + expiry; signature binds anchor/corridor/amounts/expiry; bond ≥ exposure; oracle staleness + markup cap (reject if oracle unavailable); checked i128 math; admin-only activation/resolution (disclose centralization); no PII on-chain; unit tests for every failure path (bad sig, expired quote, stale oracle, over-markup, insufficient bond, double mark_paid, dispute after window, refund before deadline).

### Reflector oracle
- Mainnet fiat feed contract: `CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC` (verified live 13 Nov 2026): decimals 14, resolution 300 s, 24 assets incl. EUR, GBP, CAD, BRL, MXN, ARS, COP, NGN, PHP, INR, KES, ZAR. Sample: BRL = 0.178034 USD.
- Fiat asset key: `Asset::Other(Symbol("MXN"))`. Interface: `lastprice(asset) -> Option<PriceData{price: i128, timestamp: u64}>`, `price`, `prices`, `decimals`, `resolution`, `assets`.
- **Testnet fiat feed not verified.** Day-1 task: check Reflector docs; if absent, deploy a `mock_oracle` with the same interface (admin sets prices; also lets the demo show a stale-price rejection).
- Repo: https://github.com/reflector-network/reflector-contract

### Off-chain services
- **Router:** `POST /rfq {corridor, asset_code, send_usdc, sender, recipient_country, method}` → request_id (32 random bytes), expires_at = now + 120 → fan out to each anchor's quote URL (3–5 s timeout) → validate signature, expiry, bond headroom, markup → return quotes sorted by landed amount.
- **Mock anchors:** Alpha (spread 120 bps, low payout fee, usually best), Beta (80 bps, higher fee), Gamma ("bad": good quotes, never calls mark_paid → demo of refund + slash). Pricing: `landed = send_usdc × (1/price) × (1 − spread) − payout_fee`. SEP-38-shaped `POST /quote` endpoint with a landed-amount extension.
- **Web:** send page (recipient name + payout key hashed client-side), quote board with countdown, order tracker (Open → Paid → Settled, Stellar Expert links), leaderboard, admin panel (approve anchors, resolve disputes, set mock price, toggle stale). Local currency amounts, no crypto jargon, mobile-friendly.

### Environment

```bash
rustup target add wasm32v1-none
# Stellar CLI: macOS `brew install stellar-cli`, Windows `winget install --id Stellar.StellarCLI`
stellar keys generate admin --network testnet --fund
stellar contract init raterace && cd raterace
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/raterace.wasm --source admin --network testnet --alias raterace
stellar contract asset deploy --asset USDC:<issuer> --source admin --network testnet
```
- RPC: https://soroban-testnet.stellar.org · Horizon: https://horizon-testnet.stellar.org · Explorer: https://stellar.expert/explorer/testnet
- Use a current soroban-sdk version (check latest). Testnet can reset: keep deploy scripts idempotent (`scripts/deploy.ts` creates accounts, asset, contract, registers + bonds anchors, writes `.env`).

### Repo layout

```
/contracts/raterace      Soroban contract
/contracts/mock_oracle   SEP-40 mock
/router                  quote router
/anchors                 mock anchors (alpha, beta, gamma)
/indexer                 event indexer
/web                     React app
/scripts                 deploy, seed, demo scenarios
README.md                what/why/how, setup, contract IDs, demo steps, limits
```

---

## 9. Improvements agreed after critique (apply these)

1. **Lead the demo with US → Mexico (SPEI)**, not Brazil: matches the market-size numbers; Reflector has MXN; 6 anchors list Mexico. Keep the corridor configurable.
2. **Recipient confirms delivery by SMS/WhatsApp** ("Did MX$3,400 arrive? Reply 1 yes / 2 no"): yes → `confirm`, no → `dispute` with the recipient's evidence, silence → timeout. Adds the receiving side, basic-phone access, and real dispute evidence. Stretch if time is short; at minimum on the roadmap slide.
3. **Reputation-tiered bonds:** new anchors high bond ratio and paid after the challenge window; clean-record anchors lower ratio and instant pay. Answers the bond capital-cost question.
4. **Customer = licensed sending apps/wallets via API**; the web app is a reference wallet. Avoids looking like a money transmitter. First segment: Stellar-connected wallets and small remittance apps sending to Mexico.
5. **Be explicit that RateRace optimizes the payout half**; show the sending app's on-ramp fee separately on the quote board.
6. **Hide crypto in the demo:** embedded key or passkey, fee sponsorship, amounts only in USD and MXN.
7. **One roadmap slide connecting the rest of the brief:** batch auctions for NGOs/employers paying many households; settled orders as verified income history for credit later.

### Projected scores (if built and validated)

| Criterion | As written | With fixes |
|---|---|---|
| Problem and impact | 7 | 8 |
| Differentiation | 9 | 9 |
| Customer segment | 6 | 8 |
| Monetization | 7 | 8 |
| User validation | 3 | 7 |
| Use of Stellar | 9–10 | 10 |
| Architecture | 9 | 9 |
| Working build | 8 | 8 |
| Security and trust | 8 | 9 |
| UX and accessibility | 6 | 8 |
| Pitch | 8 | 9 |
| Trifold | 8 | 8 |
| **Weighted total** | **~74** | **~83** |

---

## 10. Build plan (Showcase is Mon 16 Nov, 4 PM)

| Day | Build | Done when |
|---|---|---|
| Sat 14 Nov | Contract (merged registry + escrow): register/bond/activate, quote_digest, open_order with signature + oracle + bond checks, mark_paid, refund_expired, release. Mock oracle. Unit tests. Deploy script. Check Reflector testnet feed | Scripted testnet run: register 3 anchors → quote → open_order → mark_paid → release, plus an expired → refund path |
| Sun 15 Nov | Router + 3 mock anchors + indexer. Web: send page, quote board, order tracker, confirm/dispute/resolve | A judge can send from the browser and watch the best anchor win and get paid |
| Mon 16 Nov (morning) | Leaderboard, admin panel, demo scenarios, README with contract IDs, 1-minute video, Devpost update, trifold | Video recorded, repo public, Devpost complete before 4 PM |

**Cut order if behind:** leaderboard → admin UI (use scripts) → dispute/resolve (keep refund_expired + slash) → indexer (poll getters). **Never cut:** signature verification, escrow, bond reservation, oracle markup check, testnet deployment.

### Demo video script (~60 s)
1. "A family in Mexico: today one provider decides the rate." Quote board: Alpha, Beta, Gamma with landed amounts and markup.
2. Pick Gamma (best) → `open_order` on Stellar Expert. Gamma never pays → after deadline `refund_expired`: sender refunded + penalty, Gamma's bond slashed, leaderboard updates.
3. Re-send → Alpha wins → simulated payout → `mark_paid` → USDC to Alpha → sender confirms → Settled.
4. Flash: stale oracle → rejected; quote 6% over market → rejected by contract.
5. Close: "Every provider competes on what actually lands. Money only moves when they deliver."

### User validation (scored; start immediately)
- 8 senders who send money home: how they choose a provider, whether they know the all-in cost, would they want competing quotes.
- Anchors via the Stellar Developer Discord: would they bid; acceptable bond and fee terms.
- 2 founders of small remittance apps or wallets.
- Keep a log: date · who · what they said · what we changed. Put the best real quote and biggest change on the trifold. **Never invent quotes.**

### Business model
- Small routing fee per order (e.g. 0.1–0.25% of send amount), paid by the sending app or embedded in the quote; optional premium listing/analytics for anchors. Keep it below the savings from competition.
- Don't promise a fixed % saving; evidence is corridor-dependent. Pitch competition + transparency.

### 3-minute pitch outline
Hook (20 s): family losing money on a $200 transfer; 6.49% average → Insight (30 s): chain is cheap, edges cost, one anchor decides in private → Solution (40 s): RateRace in one sentence + quote board → Demo video (60 s) → Why Stellar (15 s) → Business + validation (15 s) → Close (10 s).

---

## 11. Honest limits (say these on stage)

| Limit | Mitigation |
|---|---|
| Bank payout is off-chain; contract can't see it | Bond + optimistic settlement + disputes + reputation; recipient SMS confirmation; token-delivery mode as trustless variant |
| Few anchors in some countries (South Africa 2, India 3) | Oracle markup cap disciplines a lone bidder; start in Latin America |
| Real anchors not on testnet; SEP-38 rarely deployed | Mock anchors, disclosed; SEP-38-shaped API so real anchors plug in |
| Admin resolves disputes (centralized) | Disclose; roadmap arbitration |
| Aggregator may need licensing | Software for licensed anchors; only anchors are FX counterparties; legal review before pilot |
| Official vs parallel rates (Nigeria, Argentina) skew oracle checks | Per-corridor caps; roadmap premium monitoring |
| Anchors may resist price transparency | Value prop is order flow; SDF's regional starter pack lists "fee discoverability" as a readiness criterion |
| Amounts and addresses public on-chain | Hashes only for PII; roadmap ZK privacy (Protocol 25 "X-Ray") |
| Bond capital cost | Reputation-tiered bonds |

## 12. Competitors

| Who | What | How we differ |
|---|---|---|
| Mento (Celo/Monad/Polygon) | Oracle-priced pools for local stablecoins | No pool; anchors compete; landed-amount pricing incl. cash-out |
| Circle StableFX (Arc) https://developers.circle.com/stablefx/concepts/technical-guide | Institutional RFQ FX + escrow | Retail-facing, open to Stellar anchors, markup public |
| FX Swap by Hedgehog (SCF #21) https://communityfund.stellar.org/project/fx-swap-by-hedgehog | Soroban FX swap | Pool vs our multi-anchor payout auction |
| SEP-31 today | Bilateral sender–anchor agreements | Per-transfer competition, one integration, escrow + bonds |
| Stellar Intel (community) | Reads anchor quotes/readiness | We execute and settle against quotes |
| Wise | Internal flow matching, cheap in major corridors | Open network across Stellar anchors |

---

## 13. Trifold plan (board: 38 × 27 in; side panels 9.375 in wide, centre 19.25 in)

Read left to right: problem → solution → proof. Under 25% text; readable from 6 ft (headings ≥ 1.5 in). Colours: dark navy background, green for "Race"/wins, red for losses (same as the intro video).

- **Header (centre top, ~4 in):** RateRace logo + "Every remittance becomes a live auction."
- **Left, problem:** "$200 sent. $187 arrives." huge; **lift-the-flap receipt** (visible "Fee: $3", flap "What they don't show you" reveals "Hidden exchange-rate markup: $10"); bar chart 6.49% vs 3% target; one provider + padlock → family, "One provider sets the price, in private."
- **Centre, how it works:** a **race track**: three lanes (Providers A, B, C as runners raised on foam tape), finish line = family's account, **flip-card bid tags** ("Tap to see the bid": $187, $191, $196, winner in green); 4-step strip Send → Providers bid → Contract holds the money → Family paid, then provider paid; safety banner "No delivery? Automatic refund + provider penalty"; QR to the live app; laptop in front running the demo.
- **Right, why it works:** Why Stellar tiles (5-second settlement, fees under a cent, licensed anchors, smart-contract escrow); map with anchor counts per country ("Competition already exists. It just never meets."); "What we heard → What we changed" sticky notes (**real quotes only**); business model one line; QR codes (demo video, GitHub, Stellar Expert contract); team photo + "we are the people this happens to."
- Print: header on tabloid or two joined letter sheets; race track on tabloid (11 × 17) landscape; flip cards on card stock; tiles/map/QRs on letter; QR codes ≥ 2 × 2 in. Materials: glue stick or spray adhesive, double-sided foam tape, card stock, ruler, thick black marker. Lay out loose and photograph before gluing.
- Bid numbers are illustrative; say so if asked.

---

## 14. Submitted text (keep consistent everywhere)

**One-line summary:** Every remittance becomes a live auction: providers bid to deliver the most money to your family, and only get paid once it lands.

**Problem answer:**
> A mother in Mexico City waits for $200 from her son in Toronto. His app shows a tiny fee, but the real cost hides in an exchange rate he never sees. The average $200 transfer loses about $13; across the $685 billion sent to developing countries each year, that's tens of billions taken from families who can least afford it.
>
> Blockchain fixed the pipe: on Stellar, moving money costs a fraction of a cent. No one fixed the price. Six licensed Stellar providers serve Mexico, yet each transfer goes to one through a private deal, and the family never sees a competing offer. A live Stellar quote we tested was 1.1% below market, before fees.
>
> RateRace turns every transfer into an open auction. Providers bid on exactly what the family receives after all fees, and the best offer wins. A smart contract checks the bid against the market rate, holds the funds until the family is paid, and penalizes providers that fail to deliver.
>
> Our goal: no family ever receives less than the best price, and every transfer proves it in public.

**Why our team:**
> We are the people this problem happens to. As international students, we watch our parents send money across the world every semester for tuition and rent. They check the rate again and again, waiting for a better day, and still lose money to a price nobody explains. Our friends send part of every paycheque home and accept whatever arrives. For us, this isn't a statistic; it's the call home every month.
>
> So we treated it as more than a hackathon prompt. Before writing code, we mapped every Stellar payout provider by country, pulled live exchange-rate data, and tested real quotes to find where the money disappears. One of us has built lending software for small businesses in India, and together we bring smart-contract, backend and product skills, with a record of shipping under pressure.
>
> Our families feel this, and so do we. That's why we'll keep building long after the Showcase.

**Devpost "Built with" tags:** stellar, soroban, rust, typescript, react, node.js, usdc, reflector, stellar-sdk, sep-38, sep-31, sep-12, smart-contracts, blockchain, stellar-testnet, express.js, vite.

**Devpost story** has sections Inspiration, What it does, How we built it (marked "build in progress for the Project Showcase"), Challenges, Accomplishments (mapped anchors, verified Reflector, tested a real quote), What we learned, What's next (real anchors Mexico → Brazil → Kenya, SMS confirmation, batch auctions for NGOs/employers, reputation-based bonds, privacy). **Update "How we built it" and "Accomplishments" once the build works, before Mon 4 PM.**

---

## 15. Stellar resources

From the challenge's Stellar Resources page (https://uwvelocity.notion.site/Stellar-Resources-40063713ead680148f23d4563588bb17). Workshop recordings (Intro to Stellar, Nov 3; Technical Workshop, Nov 10) are posted on the Notion.

- Stellar Developer Docs: https://developers.stellar.org
- Stellar Lab (test accounts and transactions in browser): https://lab.stellar.org
- Stellar Quest (interactive basics): https://quest.stellar.org
- Guestbook tutorial (full app end to end): in the developer docs
- Payments & Remittances resources: anchors, SEPs and the Disbursement Platform, under "Infrastructure" in Stellar Ecosystem Resources
- Wallet integration: passkey-based smart wallets
- Soroban development (Rust contracts, testing, pitfalls): https://developers.stellar.org/docs/build/smart-contracts
- OpenZeppelin tools for Stellar (audited templates, Contract Wizard)
- Building with AI: AI coding tools, Raven MCP server, Stellar Skills Marketplace
- Scaffold Stellar (quick full-stack dApp starter, recommended by the challenge FAQ)
- Stellar Developer Discord: https://discord.gg/stellardev

**Standards and repos used by RateRace**
- SEP-38 (anchor quotes): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0038.md
- SEP-31 (cross-border payouts): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md
- SEP-12 (KYC), SEP-24/SEP-6 (deposit/withdraw), SEP-10 (web auth), SEP-40 (oracle interface)
- Stellar Asset Contract: https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Reflector contract: https://github.com/reflector-network/reflector-contract
- One-way channel (prepare_commitment signing pattern): https://github.com/stellar-experimental/one-way-channel
- Regional Starter Pack: https://github.com/ElliotFriend/regional-starter-pack
- Stellar Anchor Directory: https://anchors.stellar.org
- Testnet RPC https://soroban-testnet.stellar.org · Horizon https://horizon-testnet.stellar.org · Explorer https://stellar.expert/explorer/testnet

---

## 15b. Using Stellar to the maximum (where the Technology marks come from)

This is a Stellar-sponsored challenge and "meaningful, innovative use of Stellar" is scored directly. The goal is that **every Stellar feature we use does a real job in the product**, and that judges can **see it working** on testnet. Don't add features as decoration; each one below earns a specific rubric line.

### The two main tools

**1. Stellar Lab, on testnet**
Link (opens Lab already set to testnet): https://lab.stellar.org/?$=network$id=testnet&label=Testnet&horizonUrl=https:////horizon-testnet.stellar.org&rpcUrl=https:////soroban-testnet.stellar.org&passphrase=Test%20SDF%20Network%20/;%20September%202015;;
- Network: testnet · Horizon `https://horizon-testnet.stellar.org` · RPC `https://soroban-testnet.stellar.org` · passphrase `Test SDF Network ; September 2015`

How we use it:
| Use | Why it matters |
|---|---|
| Create and fund test accounts with Friendbot (admin, sender, Alpha, Beta, Gamma anchors, USDC issuer) | Fast setup without writing code |
| Build, sign and submit test transactions by hand (e.g. issue test USDC, set trustlines) | Debug before the scripts work |
| Call contract functions directly (`register_anchor`, `add_bond`, `get_order`) and inspect results | Test each function before the web app exists |
| Decode XDR from failed transactions and contract events | Fastest way to see why a call failed |
| Look up accounts, balances and transactions through Horizon/RPC endpoints | Verify every step of the demo |
| **Show judges live contract state in Lab during Q&A** | Proves the build is real and verifiable |

**2. Stellar Developer Docs** (https://developers.stellar.org)
The reference for everything we build. Sections to use:
- **Smart contracts (Soroban):** Rust contract setup, storage types and TTL, auth (`require_auth`), events, token interface, testing, and the crypto functions (`ed25519_verify`, `sha256`).
- **Tokens:** Stellar Asset Contract (SAC) for our test USDC.
- **Data:** Stellar RPC (`simulateTransaction`, `sendTransaction`, `getEvents`, `getLedgerEntries`) and Horizon.
- **Tools:** Stellar CLI, JavaScript SDK, Scaffold Stellar, TypeScript bindings, wallets and passkeys.
- **Anchors and SEPs:** SEP-38 quotes, SEP-31 cross-border payments, SEP-12 KYC, SEP-10 auth, SEP-24 deposit/withdraw.
- **Fees and sponsorship:** fee-bump transactions and sponsored reserves.

### Every Stellar feature, its job in RateRace, and the rubric line it earns

| Stellar feature | Its job in RateRace | Rubric line | Must / stretch |
|---|---|---|---|
| **Soroban smart contract (Rust)** | Registry, bonds, escrow, quote verification, refunds, slashing | Use of Stellar · Architecture · Security | **Must** |
| **On-chain signature check** (`env.crypto().ed25519_verify` + `sha256`) | Contract proves the winning quote really came from that anchor and wasn't altered | Security · Innovative use | **Must** |
| **Contract auth** (`require_auth`) | Only the sender can open/confirm/dispute; only the anchor can mark paid; only admin approves | Security | **Must** |
| **Stellar Asset Contract (SAC) for test USDC** | Real token transfers into escrow, to anchors, refunds | Use of Stellar · Working build | **Must** |
| **Reflector oracle (SEP-40)** | Live market rate to cap markup; rejects stale prices | Innovative use · Security | **Must** (mock on testnet if no feed) |
| **Contract events + RPC `getEvents`** | Quote board, order tracker and leaderboard update from on-chain events | Architecture (clean RPC integration) | **Must** |
| **Stellar RPC `simulateTransaction`** | Get `quote_digest` from the contract so JS and Rust sign identical bytes | Architecture · Security | **Must** |
| **Stellar CLI** | Build, deploy, alias contracts; generate keys; deploy the USDC SAC | Working build | **Must** |
| **TypeScript bindings** (`stellar contract bindings typescript`) | Typed client for the web app and anchors instead of hand-built calls | Architecture · speed | Strongly recommended |
| **Stellar Expert (testnet explorer)** | Every demo step links to a real transaction; judges can click through | Working, verifiable build | **Must** |
| **Fee-bump transactions (fee sponsorship)** | RateRace pays network fees; senders never hold or see XLM | UX (named in rubric) | **Must** |
| **Sponsored reserves** | We cover the minimum balance for new sender accounts | UX · onboarding | Stretch |
| **Passkey smart wallets (secp256r1)** | Sender signs with fingerprint/Face ID, no seed phrase | UX (named in rubric: "smooth wallet onboarding") | Stretch, high value |
| **SEP-38 quote format** | Mock anchors expose a SEP-38-shaped `POST /quote` with a landed-amount extension, so real anchors can plug in | Use of anchors and SEPs · path to production | **Must** |
| **SEP-31** | Describes the payout model (sender app → receiving anchor); roadmap for real payouts | Path to production | Explain in README/pitch |
| **SEP-12 KYC** | Recipient details go to the anchor off-chain; only a hash on-chain | Security · KYC awareness | Explain + hash on-chain (Must) |
| **SEP-10 auth** | How sending apps would authenticate with anchors in production | Security | Explain in README |
| **SEP-24 + Stellar test anchor** | Optional: show a real deposit/withdraw flow for the sender's on-ramp | Use of anchors | Stretch |
| **Stellar Anchor Directory** | Our evidence (anchors per country) and the list of real anchors to onboard | Problem evidence · customer segment | **Must** (on trifold + pitch) |
| **Scaffold Stellar** | Optional starter for the web app + contract wiring | Speed | Optional |
| **OpenZeppelin Stellar tools** | Audited patterns (e.g. access control, pausable) for admin roles | Security | Stretch |
| **Raven MCP / Stellar Skills / AI tools** | Faster contract and SDK code with AI assistants | Speed | Optional |

### How judges will see it (make it visible)

1. **README section "Stellar features used"**: the table above, trimmed to what's actually built, with each contract ID and a Stellar Expert link.
2. **Demo video**: show at least one Stellar Expert transaction page and one contract event.
3. **Quote board**: small "View on Stellar" link next to each order.
4. **Trifold "Why Stellar" tiles**: 5-second settlement · fees under a cent · licensed anchors + SEPs · smart-contract escrow with on-chain signature checks.
5. **Pitch line**: "The contract verifies every anchor's signature on-chain, checks its price against Stellar's own oracle, and holds the money until delivery. Remove Stellar and none of that works."
6. **Q&A**: be ready to open Stellar Lab or Stellar Expert live and show an order's state.

### Answer ready for "Why Stellar and not another chain?"
- Licensed anchors already exist on Stellar in the corridors we target (anchor directory), with standard interfaces (SEPs) for quotes, KYC and payouts. Other chains don't have this payout network.
- Fees under a cent and ~5-second settlement make per-transfer auctions on $200 remittances economical.
- Soroban gives us signature verification, oracle checks and escrow in one contract; Reflector gives native fiat rates.
- SDF itself lists fee discoverability as an anchor readiness criterion; RateRace makes it real.

---

## 16. Immediate next steps

- [ ] Send the trifold question email to velocity.events@uwaterloo.ca (if not sent)
- [ ] Assign owners: contract · router/anchors/indexer · web app
- [ ] Open Stellar Lab on testnet; create and fund admin, sender, three anchor and USDC-issuer accounts
- [ ] Check for a Reflector testnet fiat feed; else build mock oracle
- [ ] Generate TypeScript bindings once the contract deploys
- [ ] Add fee sponsorship (fee-bump) so senders never see XLM; passkeys if time allows
- [ ] Write the README "Stellar features used" section with contract IDs and Stellar Expert links
- [ ] Build and deploy the contract to testnet; scripted happy path + refund path
- [ ] Start user validation today (senders, Discord anchors, app founders); keep the log
- [ ] Build router, mock anchors, web app; demo flow works in the browser
- [ ] Record the real 1-minute demo video; replace the 10-second intro on Devpost
- [ ] Fill the GitHub repo: code, README, setup, contract IDs
- [ ] Update Devpost story before Mon 4 PM
- [ ] Print and assemble the trifold
- [ ] Rehearse the 3-minute pitch (one presenter)
- [ ] If top 8: final PowerPoint deck (no animations) by Wed 18 Nov, 10 AM
