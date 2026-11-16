# RateRace

**Every remittance becomes a live auction.** Providers bid on the exact amount your family receives after all fees. The best offer wins, a Stellar smart contract holds the money, and a provider that fails to deliver pays a penalty.

Built for the Blockchain Innovation Challenge powered by Stellar (Velocity, University of Waterloo, with the Stellar Development Foundation) by Avani Tiwari, Abhiraj Dutta and Pranav Jain.

| | |
|---|---|
| Live app | https://raterace-jpranav0802s-projects.vercel.app |
| Demo video (1 minute) | https://youtu.be/gljvHKSHINE |
| Devpost | https://devpost.com/software/raterace |
| Network | Stellar **testnet**. No real money moves. |

## Try it in two minutes

Use two phones, or two browser windows.

1. **Phone 2 (the family):** open the app, tap **Receive money**, pick *Rosa Hernández*. Leave it open.
2. **Phone 1 (the sender):** open the app, tap **Send money**, keep Rosa selected, tap **Compare live offers**, lock one, then **Track the transfer**.
3. Phone 2 shows the money on its way, then a (simulated) bank alert. Tap **Yes, it arrived**. Phone 1 moves to **Done** by itself.

To see a provider fail: open `/send?providers=test`, pick **Gamma** (it never pays), wait two minutes, tap **Get my refund**. You get $210 back for a $200 transfer: the full amount plus a 5% penalty from Gamma's deposit.

The backend runs on a free host that sleeps when idle. The first request after a quiet spell can take about a minute.

## Contracts on testnet

| Contract | ID |
|---|---|
| RateRace | [`CDEOH24CTPC756FNNIP4MQJM6QIMAEC4VWK25JX6BETU7YATONGMHSSQ`](https://stellar.expert/explorer/testnet/contract/CDEOH24CTPC756FNNIP4MQJM6QIMAEC4VWK25JX6BETU7YATONGMHSSQ) |
| Price oracle (ours, Reflector interface) | [`CB76XHGT5QTR7DRT4VFGCD2CCEPMMCJCVK2YJZ67IHXXUQ6N7NYAZ4AK`](https://stellar.expert/explorer/testnet/contract/CB76XHGT5QTR7DRT4VFGCD2CCEPMMCJCVK2YJZ67IHXXUQ6N7NYAZ4AK) |
| Test USDC (Stellar Asset Contract) | [`CAVI5P5IMIZZC54O3GVBJUUQAGLIJXRG5VY3E56IMYQDQ6XVCIUMFCDX`](https://stellar.expert/explorer/testnet/contract/CAVI5P5IMIZZC54O3GVBJUUQAGLIJXRG5VY3E56IMYQDQ6XVCIUMFCDX) |

Accounts and anchor keys are in [`deployments/testnet.json`](deployments/testnet.json). Every step of every transfer links to its transaction on Stellar Expert from inside the app.

## How a transfer works

1. **Ask.** The sender enters an amount and a recipient. The recipient's name and account never leave the phone; only a SHA-256 fingerprint goes on-chain.
2. **Bid.** The router asks every provider for a quote. Each provider signs the exact amount the family will receive, after its exchange rate and fees.
3. **Check and lock.** The sender picks an offer and signs one transaction. The contract then:
   - verifies the provider's ed25519 signature against the key registered on-chain,
   - refuses a quote that is expired, replayed, or for a corridor the provider isn't registered for,
   - reads the market rate from the oracle and refuses a stale price or an offer more than 3% below market (the sender can tighten this to 2% or 1%),
   - reserves 105% of the transfer from the provider's deposit,
   - takes the sender's USDC into escrow.
4. **Pay.** The provider pays the family and reports it. The contract releases the escrow to the provider and starts a short dispute window.
5. **Confirm, or get it back.** The family says whether the money arrived. If the provider misses its deadline, anyone can trigger the refund: the sender gets everything back plus a 5% penalty from the provider's deposit, and the provider is suspended.

Demo settings: 2 minutes to pay, 1 minute to dispute, 3% maximum markup, 105% deposit reserved, 5% penalty, $1,000 per sender per day.

## What runs on Stellar

| Stellar feature | What it does here |
|---|---|
| Soroban smart contract (Rust, `soroban-sdk` 28) | The whole settlement: signature check, market-rate check, escrow, deposits, penalties, disputes, pause |
| `ed25519_verify` and `sha256` host functions | Every quote is verified on-chain against the provider's registered key |
| USDC through its Stellar Asset Contract | Escrow, deposits, payouts and penalties are token transfers by the contract |
| Price oracle with the Reflector / SEP-40 interface | The referee for every offer. Testnet has no live fiat feed, so we run our own oracle with the same interface and keep it at the live mid-market rate. See [`REFLECTOR_CHECK.md`](contracts/mock_oracle/REFLECTOR_CHECK.md) |
| Fee-bump transactions | The sender signs on their own device; the router wraps the transaction and pays the network fee. Senders pay no network fees |
| Contract events over Stellar RPC (`getEvents`) | The order tracker, the provider leaderboard and the providers' payout workers all follow the contract's events |
| SEP-38-shaped quotes | Providers answer `POST /quote` in the anchor quote format, so a licensed anchor could plug in by serving the same endpoint |
| SEP-1 `stellar.toml` | Each test provider publishes `/.well-known/stellar.toml` with its account, signing key and quote server |
| OpenZeppelin Stellar contracts (`stellar-contract-utils`, Pausable) | The admin can pause new orders in an emergency; paying, confirming and refunding keep working |
| Generated TypeScript bindings (`stellar contract bindings`) | The web app and services call the contract through typed clients |
| Stellar Expert | A proof link on every step of every transfer |

Nine corridors are registered on-chain for the test providers, each priced against its own oracle feed: Mexico, India, Philippines, Brazil, Colombia, Guatemala, Dominican Republic, Nigeria and Vietnam.

## What is real and what is simulated

Real, on testnet:

- The contract and everything it enforces: signatures, the market-rate limit, escrow, deposits, deadlines, refunds, penalties, suspension.
- The market rates. A keeper writes the live mid-market rate for all nine currencies to the oracle every four minutes (Wise's public rate, then open.er-api.com, then the ECB).
- Sponsored fees, the event-driven tracker, and the Stellar Expert proofs.

Simulated, and labelled as such in the app:

- **The providers are test accounts.** Alpha, Beta and Gamma are ours. No licensed anchor is connected.
- **For Mexico the quote board shows the names of real Stellar anchors with simulated prices.** Those companies are not partners and did not quote those prices; each price is signed and backed by one of our test providers. Other countries show "Test provider 1 to 5".
- **No bank payout happens.** The payment rails (SPEI, UPI, PIX and so on) are named but nothing is sent. The "bank alert" on the family's phone is a demo.
- **The contract cannot see a bank transfer.** It pays the provider when the provider reports the payout. The deposit, the dispute window and the family's answer are the safeguards.

## Honest limits

- **Recipient check.** The Receive page finds a transfer by the recipient's name and account fingerprint. Knowing those is the only check; a real service would verify the recipient first.
- **The family's answer is relayed.** The contract only accepts a confirm or dispute from the sender, so the sender's app signs it when the family's answer arrives.
- **One admin key** approves providers, resolves disputes and can pause. A real deployment needs multisig and an arbitration process.
- **Security.** [`docs/SECURITY.md`](docs/SECURITY.md) is a self-review against Stellar's developer security guide, not a professional audit. The Scout static analyser could not be run (its lint driver failed to build), so we claim no static-analysis result. The deployed WASM has no SEP-55 build attestation yet.
- **Prior art.** [`docs/ECOSYSTEM_RESEARCH.md`](docs/ECOSYSTEM_RESEARCH.md) lists the closest existing Stellar projects we found. The nearest mechanism is a request-for-quote system for redeeming asset tokens (Octarine); none of the projects we found runs an auction between anchors on the landed amount.
- **Privacy.** Amounts and addresses are public on-chain. Personal details are never written on-chain.

## Repository map

| Path | What it is |
|---|---|
| `contracts/raterace` | The Soroban contract and its tests |
| `contracts/mock_oracle`, `contracts/oracle_interface` | Our testnet oracle with the Reflector interface |
| `router` | Quote auction, signature pre-check, fee-bump sponsorship, new-user funding |
| `anchors` | Three test providers: SEP-38-shaped quote servers, `stellar.toml`, payout workers |
| `indexer` | Follows contract events; serves the tracker, leaderboard and Receive page |
| `web` | The app (Vite, React, Tailwind, shadcn/ui) |
| `scripts` | Deploy, oracle keeper, checks and demo scripts |
| `packages` | Shared code and the generated contract clients |
| `docs` | Security review, ecosystem research, hosting notes, build plan |

## Run it yourself

You need Node 22.12 or newer, Rust, and the [Stellar CLI](https://developers.stellar.org/docs/tools/cli).

```bash
npm install
npm run deploy          # builds and deploys fresh contracts to testnet, writes .env
npm run dev:backend     # providers, router, oracle keeper, indexer
npm run dev:web         # the app on http://localhost:5173
```

Useful checks:

```bash
cargo test                                  # 73 contract tests (65 RateRace, 8 oracle)
npm run typecheck
npm run check                               # contract config, providers, a signed sample quote
npm run check:toml                          # each provider's stellar.toml
npm run demo:rejections -w @raterace/scripts   # the contract refusing a stale price and an unfair offer
```

Every pull request runs the contract tests and the typecheck in CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). `.env` holds every secret key and must never be committed.

Hosting: the web app is on Vercel and the backend on Render. See [`docs/HOSTING.md`](docs/HOSTING.md).

## Built with help from

Stellar's developer skill and Soroban development guide, the OpenZeppelin Stellar contracts, the Raven MCP gateway and the LumenLoop and Stellar Docs MCP servers for research, and Claude as a coding assistant.
