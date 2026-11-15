# Hosting the live demo (issue #25)

Goal: anyone opens a link on their phone and completes a send. Testnet only, no real money.

| Piece | Where | Why |
|---|---|---|
| Web app (`web/`) | Vercel (static) | Plain Vite build; only public `VITE_*` settings |
| Router + 3 mock anchors + oracle keeper | Render web service `raterace-router` | One container; the router reaches the anchors on `localhost:8801-8803`, as `deployments/testnet.json` says |
| Indexer | Render web service `raterace-indexer` | Order tracker and leaderboard data |

Secrets live only in Render's dashboard. Nothing secret goes to Vercel. `VITE_*` values are public and end up in the browser bundle.

## Before you start

1. Pranav has redeployed the contract with `open_order` merged (#6). `deployments/testnet.json` and its contract IDs are committed on `main`.
2. You have the current repo-root `.env` that matches that deployment. You copy values from it below.

## 1. Backend on Render (about 10 minutes)

1. render.com: sign in with GitHub, then **New → Blueprint** and pick the `raterace` repo. Render reads [`render.yaml`](../render.yaml) and proposes two services.
2. Render asks for the secret values. Copy each one from `.env`:
   - `SPONSOR_SECRET` pays every user's fees.
   - `USDC_ISSUER_SECRET` hands out 1,000 test dollars per new user.
   - `ADMIN_SECRET` is used by the oracle keeper to re-stamp the price.
   - `MOCK_MXN_USD_PRICE`.
   - `ALPHA_QUOTE_SECRET`, `BETA_QUOTE_SECRET`, `GAMMA_QUOTE_SECRET` let the anchors sign their quotes.
   - `ALPHA_SECRET`, `BETA_SECRET`, `GAMMA_SECRET` let the payout workers call `mark_paid` for each anchor.
3. Deploy. When it is live, open `https://raterace-router-XXXX.onrender.com/health`. It should show `{"ok":true,...}`.
4. Run a check from your laptop:
   ```bash
   ROUTER_URL=https://raterace-router-XXXX.onrender.com npm run selftest -w @raterace/router
   ```
   It creates a fresh user, opens a real order through the hosted router, and confirms the user paid no fees.

## 2. Web on Vercel (about 5 minutes)

1. vercel.com: **Add New → Project**, import the repo, and set **Root Directory** to `web`. [`web/vercel.json`](../web/vercel.json) sends every path to the app, so `/quotes` and `/order/1` reload correctly.
2. Under **Environment Variables**, add these. All of them are public.
   ```
   VITE_ROUTER_URL=https://raterace-router-XXXX.onrender.com
   VITE_INDEXER_URL=https://raterace-indexer-XXXX.onrender.com
   VITE_RATERACE_CONTRACT_ID=<RATERACE_CONTRACT_ID from .env>
   VITE_RPC_URL=https://soroban-testnet.stellar.org
   VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   VITE_EXPLORER_URL=https://stellar.expert/explorer/testnet
   ```
3. Deploy, open the URL on a phone, and send $200 to a test name with an 18-digit CLABE. Done means the phone reaches the order page.

## Things that bite

- **Price goes stale.** The contract refuses any order whose market price is older than 10 minutes. Every 4 minutes the keeper writes the live USD/MXN mid-market rate (Wise's public mid-market rate, falling back to ECB via Frankfurter). That keeps the price fresh and real.
  - A price set from `/admin` is replaced within 4 minutes. Set `ORACLE_SOURCE=hold` to keep a manual price and only re-stamp it.
  - It deliberately leaves a price older than 30 minutes alone, so the "make price stale" demo from `/admin` or `npm run demo:rejections` keeps working until you restore it.
  - It always refreshes on start.
- **Free Render services sleep** after 15 minutes without visitors. The first request then takes about 50 seconds.
  - Open `/health` a minute before the showcase.
  - Or upgrade the router service to a paid plan for demo day.
- **Sponsor and issuer balances.** Each new user costs the sponsor a little testnet XLM. Check the `SPONSOR_PUBLIC` account on stellar.expert, and top it up with Friendbot if needed.
- **Rate limits.** The router limits each IP: 30 quote requests per minute and 5 test-dollar grants per hour. A whole room on one Wi-Fi shares one IP. If that's a problem, raise the numbers in `router/src/index.ts` for demo day.
- **Never** put a `*_SECRET` into a `VITE_*` variable or into Vercel.
