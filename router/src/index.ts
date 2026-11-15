// Quote router. Owner: Abhiraj (issues #13, #14). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
//   POST /rfq            ask every anchor for a signed quote, verify each one, rank by landed amount (#13)
//   GET  /anchors        anchors with their on-chain bond and track record (#13)
//   POST /submit         sponsor (fee-bump) a sender-signed transaction so the sender pays no fees (#14)
//   POST /onboard/fund   create a demo account with Friendbot (#14)
//   POST /onboard/usdc   send 1,000 test USDC to a demo account (#14)
//   GET  /market         the oracle MXN price and its age
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
  TESTNET,
  explorerTx,
  fromUnits,
  hexToBytes,
  localPerUsd,
  markupBps,
  marketLocal,
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
const USDC_CODE = deployment.usdc.code;
const USDC_ISSUER = deployment.usdc.issuer;
const QUOTE_LIFETIME_S = 120;
const ANCHOR_TIMEOUT_MS = 4_000;
const MAX_MARKUP_BPS = 300;
const ONBOARD_USDC = "1000";

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
// The oracle's current MXN price, for showing the live market rate before quotes are asked.

app.get("/market", async (_req, res) => {
  try {
    const price = await oraclePrice(oracle, ASSET_MXN);
    if (!price) throw new HttpError(503, "Market rate unavailable");
    res.json({
      price: price.price.toString(),
      timestamp: price.timestamp,
      mxnPerUsd: localPerUsd(price.price),
      ageS: Math.max(0, Math.floor(Date.now() / 1000) - price.timestamp),
    });
  } catch (e) {
    send(res, e);
  }
});

// ---------- GET /benchmarks ----------
// Real providers' live quotes for the same transfer, from Wise's public comparison data,
// each run through the contract's own markup formula against our oracle price. Shows where
// today's real market lands and which offers RateRace's 3% rule would reject on-chain.

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

app.get("/benchmarks", rateLimit("benchmarks", 30, 60_000), async (req, res) => {
  try {
    const sendUsdc = String(req.query.sendUsdc ?? "");
    if (!/^\d+$/.test(sendUsdc) || BigInt(sendUsdc) <= 0n) throw new HttpError(400, "sendUsdc must be a positive integer string");
    const cached = benchmarkCache.get(sendUsdc);
    if (cached && Date.now() - cached.at < BENCHMARK_TTL_MS) {
      res.json(cached.data);
      return;
    }
    const price = await oraclePrice(oracle, ASSET_MXN);
    if (!price) throw new HttpError(503, "Market rate unavailable");
    const send = BigInt(sendUsdc);
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
      sendUsdc,
      oracle: { price: price.price.toString(), mxnPerUsd: localPerUsd(price.price) },
      marketLocal: marketLocal(send, price.price).toString(),
      providers,
    };
    benchmarkCache.set(sendUsdc, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    send(res, e);
  }
});

// ---------- POST /rfq (#13) ----------

type AnchorQuoteResponse = { raterace?: { quote?: Omit<QuoteJson, "signature">; signature?: string } };

/** Extra, optional field on the /rfq response: what happened with each anchor (for the demo's live view). */
type AuditOutcome = "verified" | "no-quote" | "mismatch" | "bad-signature" | "inactive" | "over-cap" | "error";
interface AuditRow {
  name: string;
  displayName: string;
  ms: number;
  outcome: AuditOutcome;
  markupBps?: number;
}

app.post("/rfq", rateLimit("rfq", 30, 60_000), async (req, res) => {
  try {
    const body = req.body ?? {};
    if (body.corridor !== CORRIDOR_MX_SPEI) throw new HttpError(400, "Only MX_SPEI is supported for now");
    if (body.assetCode !== ASSET_MXN) throw new HttpError(400, "assetCode must be MXN");
    if (typeof body.sendUsdc !== "string" || !/^\d+$/.test(body.sendUsdc) || BigInt(body.sendUsdc) <= 0n) {
      throw new HttpError(400, "sendUsdc must be a positive integer string (7 decimals)");
    }
    if (typeof body.sender !== "string" || !StrKey.isValidEd25519PublicKey(body.sender)) {
      throw new HttpError(400, "sender must be a valid G... address");
    }
    const sendUsdc = BigInt(body.sendUsdc);
    const requestId = randomBytes(32).toString("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + QUOTE_LIFETIME_S;

    const price = await oraclePrice(oracle, ASSET_MXN);
    if (!price) throw new HttpError(503, "Market rate unavailable, try again in a minute");

    // Ask every anchor in parallel; any that fail, time out or return 503 are skipped.
    const audit: AuditRow[] = [];
    const settled = await Promise.allSettled(
      deployment.anchors.map(async (a): Promise<RankedQuote | null> => {
        const t0 = Date.now();
        const row: AuditRow = { name: a.name, displayName: a.displayName, ms: 0, outcome: "error" };
        audit.push(row);
        const done = (outcome: AuditOutcome) => {
          row.outcome = outcome;
          return null;
        };
        const r = await fetch(`${a.quoteUrl}/quote`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sell_asset: `stellar:${USDC_CODE}:${USDC_ISSUER}`,
            buy_asset: `iso4217:${ASSET_MXN}`,
            sell_amount: fromUnits(sendUsdc, 7),
            context: "sep31",
            raterace: { request_id: requestId, corridor: CORRIDOR_MX_SPEI, sender: body.sender, expires_at: expiresAt },
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
          quote.requestId !== requestId ||
          quote.corridor !== CORRIDOR_MX_SPEI ||
          quote.assetCode !== ASSET_MXN ||
          quote.sendUsdc !== sendUsdc.toString() ||
          quote.expiresAt !== expiresAt ||
          !/^\d+$/.test(quote.landedLocal)
        ) {
          console.warn(`[router] ${a.name}: quote doesn't match the request, skipped`);
          return done("mismatch");
        }

        // Verify the signature like the contract will: digest from the contract,
        // key from the anchor's on-chain registration.
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

        const markup = markupBps(sendUsdc, BigInt(quote.landedLocal), price.price);
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
      }),
    );
    settled.forEach((s, i) => {
      if (s.status === "rejected") console.warn(`[router] ${deployment.anchors[i].name}: ${(s.reason as Error).message}`);
    });

    const quotes = settled
      .map((s) => (s.status === "fulfilled" ? s.value : null))
      .filter((q): q is RankedQuote => q !== null)
      .sort((x, y) => (BigInt(y.landedLocal) > BigInt(x.landedLocal) ? 1 : BigInt(y.landedLocal) < BigInt(x.landedLocal) ? -1 : 0));

    const out: RfqResponse & { audit: AuditRow[] } = {
      audit,
      requestId,
      expiresAt,
      oracle: { price: price.price.toString(), timestamp: price.timestamp, mxnPerUsd: localPerUsd(price.price) },
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
