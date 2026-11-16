// Quote router. Owner: Abhiraj (issues #13, #14). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
//   POST /rfq            ask every anchor for a signed quote, verify each one, rank by landed amount (#13)
//                        mode "market": real providers' live prices bid, signed and bonded by test stand-ins
//                        mode "anchors": real Stellar anchors bid with simulated prices, same stand-ins
//   GET  /anchors        anchors with their on-chain bond and track record (#13)
//   POST /submit         sponsor (fee-bump) a sender-signed transaction so the sender pays no fees (#14)
//   POST /onboard/fund   create a demo account with Friendbot (#14)
//   POST /onboard/usdc   send 1,000 test USDC to a demo account (#14)
//   GET  /market         the oracle price and its age (?asset=INR; MXN by default)
//   GET  /benchmarks     real providers' live quotes for the same amount, checked against the 3% rule
//   GET  /health
//
// The router never holds user funds and cannot forge quotes: every quote is checked against
// the anchor's signing key stored ON-CHAIN, using the digest computed BY THE CONTRACT.
import { randomBytes } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  Address,
  rpc,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  ASSET_MXN,
  CONTRACT_ERRORS,
  CORRIDOR_MX_SPEI,
  PORTS,
  corridorByCurrency,
  corridorById,
  scaleFee,
  type CorridorInfo,
  TESTNET,
  explorerTx,
  fromUnits,
  hexToBytes,
  localPerUsd,
  markupBps,
  marketLocal,
  landedLocal,
  toUnits,
  type QuoteJson,
  type RankedQuote,
  type RfqResponse,
  type SubmitResponse,
} from "@raterace/shared";
import { makeClients, oraclePrice, quoteDigest, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, requireEnv } from "@raterace/shared/node";

// ---------- setup ----------

const cfg = loadConfig();
const deployment = loadDeployment();
if (!deployment) throw new Error('No deployments/testnet.json. Run "npm run deploy" first.');

const RATERACE_ID = deployment.contracts.raterace;
const ANCHORS = deployment.anchors;
const USDC_CODE = deployment.usdc.code;
const USDC_ISSUER = deployment.usdc.issuer;
const QUOTE_LIFETIME_S = 120;
const ANCHOR_TIMEOUT_MS = 4_000;
const MAX_MARKUP_BPS = 300;
const ONBOARD_USDC = "1000";
/**
 * Test anchors allowed to stand in for real providers in market mode. Gamma is left out on
 * purpose: its payout worker never pays (it is the demo's failing provider), and a real
 * provider's price must not look like it failed because of who stood in for it.
 */
const MARKET_STAND_INS = (process.env.MARKET_STAND_INS ?? "alpha,beta").split(",").map((s) => s.trim());

const { raterace, oracle } = makeClients({
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  rateraceContractId: RATERACE_ID,
  oracleContractId: deployment.contracts.oracle,
  simulationAccount: deployment.accounts.sponsor,
});
const server = new rpc.Server(cfg.rpcUrl);
const horizon = new Horizon.Server(cfg.horizonUrl);

// Secrets are read lazily so /rfq works even if only public settings are present.
const sponsorKey = () => Keypair.fromSecret(requireEnv("SPONSOR_SECRET"));
const issuerKey = () => Keypair.fromSecret(requireEnv("USDC_ISSUER_SECRET"));

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- simple in-memory rate limits (per IP) ----------

const hits = new Map<string, number[]>();
function rateLimit(bucket: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      res.status(429).json({ error: "Too many requests, try again in a minute." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "200kb" }));

function send(res: Response, e: unknown) {
  if (e instanceof HttpError) {
    res.status(e.status).json({ error: e.message });
  } else {
    console.error("[router]", e);
    res.status(502).json({ error: "Could not reach the Stellar network. Try again." });
  }
}

// ---------- GET /health ----------

app.get("/health", (_req, res) => {
  // The web app reads the USDC asset from here to build the trustline the user signs.
  res.json({ ok: true, service: "router", usdc: { code: USDC_CODE, issuer: USDC_ISSUER } });
});

// ---------- GET /market ----------
// The oracle's current price for a currency, for showing the live market rate before quotes
// are asked. `mxnPerUsd` is the local currency per 1 USD whatever the currency (older name).

app.get("/market", async (req, res) => {
  try {
    const asset = typeof req.query.asset === "string" ? req.query.asset : ASSET_MXN;
    if (!corridorByCurrency(asset)) throw new HttpError(400, "Unsupported currency");
    const price = await oraclePrice(oracle, asset);
    if (!price) throw new HttpError(503, "Market rate unavailable");
    res.json({
      asset,
      price: price.price.toString(),
      timestamp: price.timestamp,
      mxnPerUsd: localPerUsd(price.price),
      localPerUsd: localPerUsd(price.price),
      ageS: Math.max(0, Math.floor(Date.now() / 1000) - price.timestamp),
    });
  } catch (e) {
    send(res, e);
  }
});

// ---------- real providers' live prices (Wise public comparison data) ----------
// Used by GET /benchmarks and by /rfq in "market" mode. Each quote is run through the
// contract's own markup formula against our oracle price.

interface Benchmark {
  name: string;
  type: string;
  feeUsd: number;
  /** Exchange rate the provider applies, MXN per USD. */
  rate: number;
  /** What the family receives, MXN units (7 decimals). */
  receivedLocal: string;
  /** Below market, same formula as the contract (negative = better than market). */
  markupBps: number;
  wouldPassCap: boolean;
  collectedAt: string;
}
interface BenchmarksResponse {
  source: string;
  sourceUrl: string;
  fetchedAt: number;
  sendUsdc: string;
  oracle: { price: string; mxnPerUsd: number };
  marketLocal: string;
  providers: Benchmark[];
}
const benchmarkCache = new Map<string, { at: number; data: BenchmarksResponse }>();
const BENCHMARK_TTL_MS = 5 * 60_000;

async function getBenchmarks(send: bigint, price: { price: bigint }): Promise<BenchmarksResponse> {
  const key = send.toString();
  const cached = benchmarkCache.get(key);
  if (cached && Date.now() - cached.at < BENCHMARK_TTL_MS) return cached.data;
  const sourceUrl = `https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=MXN&sendAmount=${fromUnits(send, 2)}`;
  const r = await fetch(sourceUrl, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r?.ok) throw new HttpError(502, "Live provider prices are unavailable right now");
  const j = (await r.json()) as {
    providers?: { name: string; type: string; quotes: { fee: number; rate: number; receivedAmount: number; dateCollected: string }[] }[];
  };
  const providers: Benchmark[] = (j.providers ?? [])
    .filter((p) => p.quotes?.[0] && p.quotes[0].receivedAmount > 0)
    .map((p) => {
      const q = p.quotes[0];
      const receivedLocal = toUnits(q.receivedAmount.toFixed(2));
      const m = markupBps(send, receivedLocal, price.price);
      return {
        name: p.name,
        type: p.type,
        feeUsd: q.fee,
        rate: q.rate,
        receivedLocal: receivedLocal.toString(),
        markupBps: m,
        wouldPassCap: m <= MAX_MARKUP_BPS,
        collectedAt: q.dateCollected,
      };
    })
    .sort((a, b) => (BigInt(b.receivedLocal) > BigInt(a.receivedLocal) ? 1 : -1));
  const data: BenchmarksResponse = {
    source: "Wise public comparison data",
    sourceUrl,
    fetchedAt: Math.floor(Date.now() / 1000),
    sendUsdc: key,
    oracle: { price: price.price.toString(), mxnPerUsd: localPerUsd(price.price) },
    marketLocal: marketLocal(send, price.price).toString(),
    providers,
  };
  benchmarkCache.set(key, { at: Date.now(), data });
  return data;
}

app.get("/benchmarks", rateLimit("benchmarks", 30, 60_000), async (req, res) => {
  try {
    const sendUsdc = String(req.query.sendUsdc ?? "");
    if (!/^\d+$/.test(sendUsdc) || BigInt(sendUsdc) <= 0n) throw new HttpError(400, "sendUsdc must be a positive integer string");
    const price = await oraclePrice(oracle, ASSET_MXN);
    if (!price) throw new HttpError(503, "Market rate unavailable");
    res.json(await getBenchmarks(BigInt(sendUsdc), price));
  } catch (e) {
    send(res, e);
  }
});

// ---------- POST /rfq (#13) ----------

type AnchorQuoteResponse = { raterace?: { quote?: Omit<QuoteJson, "signature">; signature?: string } };

/** Extra, optional field on the /rfq response: what happened with each bidder (for the demo's live view). */
type AuditOutcome = "verified" | "no-quote" | "mismatch" | "bad-signature" | "inactive" | "over-cap" | "no-bond" | "error";
interface AuditRow {
  name: string;
  displayName: string;
  ms: number;
  outcome: AuditOutcome;
  markupBps?: number;
  /** Market mode: the real provider whose live price this lane carries. */
  live?: { type: string; feeUsd: number; rate: number; collectedAt: string };
  /** Anchors mode: a real Stellar anchor's name with a simulated price. */
  sim?: { note: string };
  /** Market/anchors mode: the registered test anchor that signed and backs this price. */
  standIn?: { name: string; displayName: string };
}
type Anchor = (typeof ANCHORS)[number];
interface StandInRequest {
  provider: string;
  landed_local: string;
  fee_local: string;
  spread_bps: number;
}
interface RfqCtx {
  requestId: string;
  expiresAt: number;
  sendUsdc: bigint;
  sender: string;
  price: { price: bigint };
  corridor: CorridorInfo;
}

/**
 * Ask one anchor for a signed quote and verify it exactly as the contract will: digest from
 * the contract, key from the anchor's on-chain registration, markup against the oracle.
 */
async function askAnchor(a: Anchor, ctx: RfqCtx, row: AuditRow, standIn?: StandInRequest): Promise<RankedQuote | null> {
  const done = (outcome: AuditOutcome) => {
    row.outcome = outcome;
    return null;
  };
  const t0 = Date.now();
  const r = await fetch(`${a.quoteUrl}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sell_asset: `stellar:${USDC_CODE}:${USDC_ISSUER}`,
      buy_asset: `iso4217:${ctx.corridor.currency}`,
      sell_amount: fromUnits(ctx.sendUsdc, 7),
      context: "sep31",
      raterace: {
        request_id: ctx.requestId,
        corridor: ctx.corridor.id,
        sender: ctx.sender,
        expires_at: ctx.expiresAt,
        ...(standIn ? { stand_in: standIn } : {}),
      },
    }),
    signal: AbortSignal.timeout(ANCHOR_TIMEOUT_MS),
  });
  row.ms = Date.now() - t0;
  if (!r.ok) return done("no-quote");
  const json = (await r.json()) as AnchorQuoteResponse;
  const quote = json.raterace?.quote;
  const signature = json.raterace?.signature;
  if (!quote || typeof signature !== "string" || !/^[0-9a-f]{128}$/.test(signature)) return done("no-quote");

  // The quote must be exactly what we asked for, from the anchor we asked.
  if (
    quote.anchor !== a.address ||
    quote.requestId !== ctx.requestId ||
    quote.corridor !== ctx.corridor.id ||
    quote.assetCode !== ctx.corridor.currency ||
    quote.sendUsdc !== ctx.sendUsdc.toString() ||
    quote.expiresAt !== ctx.expiresAt ||
    !/^\d+$/.test(quote.landedLocal) ||
    (standIn && quote.landedLocal !== standIn.landed_local)
  ) {
    console.warn(`[router] ${a.name}: quote doesn't match the request, skipped`);
    return done("mismatch");
  }

  const [digest, onChain] = await Promise.all([
    quoteDigest(raterace, toContractQuote(quote)),
    raterace.get_anchor({ anchor: a.address }).then((t) => t.result.unwrap()),
  ]);
  if (!onChain.active) return done("inactive");
  const key = Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(onChain.signing_key)));
  if (!key.verify(digest, Buffer.from(hexToBytes(signature)))) {
    console.warn(`[router] ${a.name}: invalid signature, skipped`);
    return done("bad-signature");
  }

  const markup = markupBps(ctx.sendUsdc, BigInt(quote.landedLocal), ctx.price.price);
  row.markupBps = markup;
  if (markup > MAX_MARKUP_BPS) return done("over-cap");
  row.outcome = "verified";
  return {
    ...quote,
    signature,
    markupBps: markup,
    reputation: { filled: onChain.filled, disputed: onChain.disputed, slashed: onChain.slashed },
    valid: true,
  };
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Simulated anchors bid with their own configured prices (the original mode). */
async function simulatedBids(ctx: RfqCtx, audit: AuditRow[]) {
  return Promise.allSettled(
    ANCHORS.map((a) => {
      const row: AuditRow = { name: a.name, displayName: a.displayName, ms: 0, outcome: "error" };
      audit.push(row);
      return askAnchor(a, ctx, row);
    }),
  );
}

/**
 * Market mode: every real provider's live price bids. Prices outside the 3% rule are refused
 * up front; each remaining price is signed and backed (bond) by a registered test anchor
 * acting as a stand-in, so the contract can lock it. Stand-ins are picked by free bond.
 */
async function marketBids(ctx: RfqCtx, audit: AuditRow[]) {
  const bm = await getBenchmarks(ctx.sendUsdc, ctx.price);
  const [anchorsOnChain, chainConfig] = await Promise.all([
    Promise.all(ANCHORS.map((a) => raterace.get_anchor({ anchor: a.address }).then((t) => t.result.unwrap()))),
    raterace.get_config().then((t) => t.result.unwrap()),
  ]);
  const reserve = (ctx.sendUsdc * BigInt(chainConfig.bond_ratio_bps)) / 10_000n;
  const free = anchorsOnChain.map((on, i) =>
    on.active && MARKET_STAND_INS.includes(ANCHORS[i].name) ? BigInt(on.bond) - BigInt(on.reserved) : 0n,
  );
  const mid = localPerUsd(ctx.price.price);

  const jobs: Promise<RankedQuote | null>[] = [];
  for (const p of bm.providers) {
    const received = BigInt(p.receivedLocal);
    const markup = markupBps(ctx.sendUsdc, received, ctx.price.price);
    const row: AuditRow = {
      name: `live-${slug(p.name)}`,
      displayName: p.name,
      ms: 0,
      outcome: "error",
      markupBps: markup,
      live: { type: p.type, feeUsd: p.feeUsd, rate: p.rate, collectedAt: p.collectedAt },
    };
    audit.push(row);
    if (markup > MAX_MARKUP_BPS) {
      row.outcome = "over-cap";
      continue;
    }
    // The stand-in with the most free bond takes this price.
    let best = -1;
    free.forEach((f, i) => {
      if (f >= reserve && (best < 0 || f > free[best])) best = i;
    });
    if (best < 0) {
      row.outcome = "no-bond";
      continue;
    }
    free[best] -= reserve;
    const a = ANCHORS[best];
    row.standIn = { name: a.name, displayName: a.displayName };
    const standIn: StandInRequest = {
      provider: p.name,
      landed_local: p.receivedLocal,
      fee_local: toUnits((p.feeUsd * p.rate).toFixed(2)).toString(),
      spread_bps: Math.round(((mid - p.rate) / mid) * 10_000),
    };
    jobs.push(
      askAnchor(a, ctx, row, standIn).then((q) => (q ? { ...q, anchorName: row.name, displayName: p.name } : null)),
    );
  }
  return { settled: await Promise.allSettled(jobs), bm };
}


/**
 * "anchors" mode: real Stellar anchors that pay out in Mexico bid for the transfer.
 * Their real prices aren't public, so these are SIMULATED prices in a realistic range (a
 * rate margin plus a payout fee), with a little per-request variation so the order can
 * change. The web app says so on screen. Each price is signed and bonded on testnet by one
 * of our honest test anchors standing in, exactly like market mode.
 */
const STELLAR_ANCHOR_BIDDERS = [
  { name: "Bitso", note: "Exchange · SPEI payouts", spreadBps: 45, feeLocal: "5" },
  { name: "Koywe", note: "On/off-ramp · SPEI", spreadBps: 75, feeLocal: "0" },
  { name: "Etherfuse", note: "On/off-ramp · SPEI", spreadBps: 60, feeLocal: "12" },
  { name: "Alfred Pay", note: "On/off-ramp · SPEI", spreadBps: 105, feeLocal: "0" },
  { name: "MoneyGram", note: "Cash and bank network", spreadBps: 140, feeLocal: "20" },
];
/**
 * Corridors other than Mexico: we have not checked which real anchors serve them, so no
 * company is named. The bidders are plainly labelled test providers with simulated prices
 * (same fee levels as above, scaled to the currency).
 */
const TEST_BIDDERS = [
  { name: "Test provider 1", spreadBps: 45, feeLocal: "5" },
  { name: "Test provider 2", spreadBps: 75, feeLocal: "0" },
  { name: "Test provider 3", spreadBps: 60, feeLocal: "12" },
  { name: "Test provider 4", spreadBps: 105, feeLocal: "0" },
  { name: "Test provider 5", spreadBps: 140, feeLocal: "20" },
];
const biddersFor = (c: CorridorInfo) =>
  c.id === CORRIDOR_MX_SPEI
    ? STELLAR_ANCHOR_BIDDERS
    : TEST_BIDDERS.map((b) => ({ ...b, note: `Simulated price · ${c.method}` }));
const JITTER_BPS = 10;

async function anchorBids(ctx: RfqCtx, audit: AuditRow[]) {
  const [anchorsOnChain, chainConfig] = await Promise.all([
    Promise.all(ANCHORS.map((a) => raterace.get_anchor({ anchor: a.address }).then((t) => t.result.unwrap()))),
    raterace.get_config().then((t) => t.result.unwrap()),
  ]);
  const reserve = (ctx.sendUsdc * BigInt(chainConfig.bond_ratio_bps)) / 10_000n;
  const free = anchorsOnChain.map((on, i) =>
    on.active && MARKET_STAND_INS.includes(ANCHORS[i].name) ? BigInt(on.bond) - BigInt(on.reserved) : 0n,
  );

  const jobs: Promise<RankedQuote | null>[] = [];
  for (const b of biddersFor(ctx.corridor)) {
    const spread = Math.max(0, b.spreadBps + Math.round((Math.random() * 2 - 1) * JITTER_BPS));
    // Fees are defined in pesos; scale them to a similar value in this currency.
    const fee = scaleFee(toUnits(b.feeLocal), ctx.corridor.currency);
    const landed = landedLocal(ctx.sendUsdc, ctx.price.price, spread, fee);
    const row: AuditRow = {
      name: `anchor-${slug(b.name)}`,
      displayName: b.name,
      ms: 0,
      outcome: "error",
      markupBps: markupBps(ctx.sendUsdc, landed, ctx.price.price),
      sim: { note: b.note },
    };
    audit.push(row);
    let best = -1;
    free.forEach((f, i) => {
      if (f >= reserve && (best < 0 || f > free[best])) best = i;
    });
    if (best < 0) {
      row.outcome = "no-bond";
      continue;
    }
    free[best] -= reserve;
    const a = ANCHORS[best];
    row.standIn = { name: a.name, displayName: a.displayName };
    const standIn: StandInRequest = { provider: b.name, landed_local: landed.toString(), fee_local: fee.toString(), spread_bps: spread };
    jobs.push(askAnchor(a, ctx, row, standIn).then((q) => (q ? { ...q, anchorName: row.name, displayName: b.name } : null)));
  }
  return Promise.allSettled(jobs);
}

app.post("/rfq", rateLimit("rfq", 30, 60_000), async (req, res) => {
  try {
    const body = req.body ?? {};
    const corridor = typeof body.corridor === "string" ? corridorById(body.corridor) : undefined;
    if (!corridor) throw new HttpError(400, "Unsupported corridor");
    if (body.assetCode !== corridor.currency) {
      throw new HttpError(400, `assetCode must be ${corridor.currency} for ${corridor.id}`);
    }
    if (typeof body.sendUsdc !== "string" || !/^\d+$/.test(body.sendUsdc) || BigInt(body.sendUsdc) <= 0n) {
      throw new HttpError(400, "sendUsdc must be a positive integer string (7 decimals)");
    }
    if (typeof body.sender !== "string" || !StrKey.isValidEd25519PublicKey(body.sender)) {
      throw new HttpError(400, "sender must be a valid G... address");
    }
    const price = await oraclePrice(oracle, corridor.currency);
    if (!price) throw new HttpError(503, "Market rate unavailable, try again in a minute");
    const ctx: RfqCtx = {
      requestId: randomBytes(32).toString("hex"),
      expiresAt: Math.floor(Date.now() / 1000) + QUOTE_LIFETIME_S,
      sendUsdc: BigInt(body.sendUsdc),
      sender: body.sender,
      price,
      corridor,
    };

    const audit: AuditRow[] = [];
    // "market" compares against Wise's public USD->MXN data, so it only exists for Mexico.
    if (body.mode === "market" && corridor.id !== CORRIDOR_MX_SPEI) {
      throw new HttpError(400, "Live market mode is only available for Mexico");
    }
    const mode: "simulated" | "market" | "anchors" =
      body.mode === "market" ? "market" : body.mode === "anchors" ? "anchors" : "simulated";
    let settled: PromiseSettledResult<RankedQuote | null>[];
    let source: { name: string; url: string; oldestCollected?: string } | undefined;
    if (mode === "anchors") {
      settled = await anchorBids(ctx, audit);
    } else if (mode === "market") {
      const r = await marketBids(ctx, audit);
      settled = r.settled;
      source = { name: r.bm.source, url: r.bm.sourceUrl, oldestCollected: r.bm.providers.map((p) => p.collectedAt).sort()[0] };
    } else {
      settled = await simulatedBids(ctx, audit);
    }
    settled.forEach((s) => {
      if (s.status === "rejected") console.warn(`[router] bid failed: ${(s.reason as Error).message}`);
    });

    const quotes = settled
      .map((s) => (s.status === "fulfilled" ? s.value : null))
      .filter((q): q is RankedQuote => q !== null)
      .sort((x, y) => (BigInt(y.landedLocal) > BigInt(x.landedLocal) ? 1 : BigInt(y.landedLocal) < BigInt(x.landedLocal) ? -1 : 0));

    const out: RfqResponse & { audit: AuditRow[]; mode: typeof mode; source?: typeof source } = {
      mode,
      source,
      audit,
      requestId: ctx.requestId,
      expiresAt: ctx.expiresAt,
      oracle: {
        price: price.price.toString(),
        timestamp: price.timestamp,
        mxnPerUsd: localPerUsd(price.price),
        localPerUsd: localPerUsd(price.price),
      },
      corridor: corridor.id,
      assetCode: corridor.currency,
      onRampFeeUsd: "0.00",
      quotes,
    };
    res.json(out);
  } catch (e) {
    send(res, e);
  }
});

// ---------- GET /anchors (#13) ----------

app.get("/anchors", async (_req, res) => {
  try {
    const rows = await Promise.all(
      deployment.anchors.map(async (a) => {
        const on = (await raterace.get_anchor({ anchor: a.address })).result.unwrap();
        return {
          name: a.name,
          displayName: a.displayName,
          address: a.address,
          active: on.active,
          bond: on.bond.toString(),
          reserved: on.reserved.toString(),
          filled: on.filled,
          disputed: on.disputed,
          slashed: on.slashed,
        };
      }),
    );
    res.json(rows);
  } catch (e) {
    send(res, e);
  }
});

// ---------- POST /submit (#14) ----------

/** Only RateRace contract calls and the USDC trustline may be sponsored. */
function checkAllowed(tx: Transaction) {
  if (tx.operations.length !== 1) throw new HttpError(400, "Exactly one operation is allowed");
  const op = tx.operations[0];
  if (op.type === "invokeHostFunction") {
    // stellar-sdk 17: host functions are tagged classes with a `type` field.
    const fn = (op as Operation.InvokeHostFunction).func;
    if (fn.type !== "hostFunctionTypeInvokeContract") {
      throw new HttpError(400, "Only contract calls are allowed");
    }
    const target = Address.fromScAddress(fn.invokeContract.contractAddress).toString();
    if (target !== RATERACE_ID) throw new HttpError(400, "Only RateRace contract calls are allowed");
    return;
  }
  if (op.type === "changeTrust") {
    const line = (op as Operation.ChangeTrust).line;
    if (line instanceof Asset && line.getCode() === USDC_CODE && line.getIssuer() === USDC_ISSUER) return;
    throw new HttpError(400, "Only the USDC trustline is allowed");
  }
  throw new HttpError(400, `Operation type ${op.type} is not allowed`);
}

/** Wrap the sender's transaction in a fee bump paid by the sponsor. */
function feeBump(inner: Transaction) {
  const sponsor = sponsorKey();
  try {
    return TransactionBuilder.buildFeeBumpTransaction(sponsor, BASE_FEE, inner, cfg.networkPassphrase);
  } catch (e) {
    // The SDK tells us the minimum per-operation fee if BASE_FEE is too low.
    const m = /at least (\d+) stroops/.exec((e as Error).message);
    if (!m) throw e;
    return TransactionBuilder.buildFeeBumpTransaction(sponsor, m[1], inner, cfg.networkPassphrase);
  }
}

/** Contract error code for a failed transaction, found by re-simulating the inner tx. */
async function contractErrorCode(inner: Transaction): Promise<number | undefined> {
  try {
    const sim = await server.simulateTransaction(inner);
    if (rpc.Api.isSimulationError(sim)) {
      const m = /Error\(Contract, #(\d+)\)/.exec(sim.error);
      if (m) return Number(m[1]);
    }
  } catch {
    /* best effort */
  }
  return undefined;
}

app.post("/submit", rateLimit("submit", 30, 60_000), async (req, res) => {
  try {
    const raw = req.body?.xdr;
    if (typeof raw !== "string" || raw.length > 100_000) throw new HttpError(400, "Body must be { xdr: string }");
    let inner: Transaction;
    try {
      const parsed = TransactionBuilder.fromXDR(raw, cfg.networkPassphrase);
      if (!(parsed instanceof Transaction)) throw new Error("fee bump");
      inner = parsed;
    } catch {
      throw new HttpError(400, "Not a valid signed transaction for this network");
    }
    checkAllowed(inner);
    if (inner.signatures.length === 0) throw new HttpError(400, "Transaction must be signed by the sender");

    const bump = feeBump(inner);
    bump.sign(sponsorKey());
    const sent = await server.sendTransaction(bump);
    if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
      const out: SubmitResponse = {
        hash: sent.hash,
        status: "FAILED",
        explorerUrl: explorerTx(sent.hash, cfg.explorerUrl),
        errorCode: await contractErrorCode(inner),
      };
      res.status(400).json(out);
      return;
    }

    // Poll until the network has a final answer (max ~30 s).
    let result: rpc.Api.GetTransactionResponse | undefined;
    for (let i = 0; i < 30; i++) {
      result = await server.getTransaction(sent.hash);
      if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    const ok = result?.status === rpc.Api.GetTransactionStatus.SUCCESS;
    const out: SubmitResponse = {
      hash: sent.hash,
      status: ok ? "SUCCESS" : "FAILED",
      explorerUrl: explorerTx(sent.hash, cfg.explorerUrl),
    };
    if (ok && result && "returnValue" in result && result.returnValue) {
      out.returnValue = String(scValToNative(result.returnValue as xdr.ScVal));
    }
    if (!ok) out.errorCode = await contractErrorCode(inner);
    res.status(ok ? 200 : 400).json(out);
  } catch (e) {
    send(res, e);
  }
});

// ---------- POST /onboard/fund (#14) ----------

function publicKeyFrom(req: Request): string {
  const pk = req.body?.publicKey;
  if (typeof pk !== "string" || !StrKey.isValidEd25519PublicKey(pk)) throw new HttpError(400, "publicKey must be a valid G... address");
  return pk;
}

app.post("/onboard/fund", rateLimit("fund", 5, 60 * 60_000), async (req, res) => {
  try {
    const pk = publicKeyFrom(req);
    try {
      await horizon.loadAccount(pk);
      res.json({ ok: true, existed: true });
      return;
    } catch {
      /* not found: create it */
    }
    const r = await fetch(`${TESTNET.friendbotUrl}?addr=${encodeURIComponent(pk)}`);
    const text = await r.text();
    if (!r.ok) {
      // Friendbot returns 400 if the account already exists (race with another request).
      if (!/createAccountAlreadyExist|already exists/i.test(text)) throw new HttpError(502, "Friendbot failed, try again");
    }
    let hash: string | undefined;
    try {
      hash = (JSON.parse(text) as { hash?: string }).hash;
    } catch {
      /* not JSON: fine */
    }
    res.json({ ok: true, hash });
  } catch (e) {
    send(res, e);
  }
});

// ---------- POST /onboard/usdc (#14) ----------

app.post("/onboard/usdc", rateLimit("usdc", 5, 60 * 60_000), async (req, res) => {
  try {
    const pk = publicKeyFrom(req);
    const usdc = new Asset(USDC_CODE, USDC_ISSUER);
    const account = await horizon.loadAccount(pk).catch(() => null);
    if (!account) throw new HttpError(400, "Account not found: call /onboard/fund first");
    const hasTrustline = account.balances.some(
      (b) => "asset_code" in b && b.asset_code === USDC_CODE && "asset_issuer" in b && b.asset_issuer === USDC_ISSUER,
    );
    if (!hasTrustline) throw new HttpError(400, "Add the USDC trustline first");

    const issuer = issuerKey();
    const source = await horizon.loadAccount(issuer.publicKey());
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
      .addOperation(Operation.payment({ destination: pk, asset: usdc, amount: ONBOARD_USDC }))
      .setTimeout(60)
      .build();
    tx.sign(issuer);
    const r = await horizon.submitTransaction(tx);
    res.json({ ok: true, hash: r.hash });
  } catch (e) {
    send(res, e);
  }
});

// ---------- start ----------

const port = Number(process.env.PORT) || PORTS.router;
app.listen(port, () => console.log(`router listening on http://localhost:${port}`));

export { CONTRACT_ERRORS };
