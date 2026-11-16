// Keeps the mock oracle's prices fresh AND real, the way Reflector does on mainnet.
// Owner: Abhiraj (#25). Without it the contract refuses every order 10 minutes after the
// last price update (OracleStale, max_oracle_age_s = 600).
//   npm run oracle:keeper -w @raterace/scripts
//
// Every 4 minutes it writes the live mid-market rate for every corridor's currency (see
// packages/shared/src/corridors.ts) to the mock oracle. Sources, in order: Wise's public
// mid-market rate, open.er-api.com, the ECB rate via Frankfurter. If none answers for a
// currency it re-stamps the current price so orders keep working.
//   ORACLE_SOURCE=hold   keep whatever prices are set (e.g. one set from /admin), only re-stamp
//
// It leaves a price older than 30 minutes alone: that is the deliberate "make price stale"
// demo. On start it always refreshes, so a host that slept recovers by itself.
import { contract, Keypair } from "@stellar/stellar-sdk";
import { CORRIDORS, ORACLE_DECIMALS, fallbackOraclePrice, type CorridorInfo } from "@raterace/shared";
import { OracleClient, oraclePrice } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, optionalEnv, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error("No deployments/testnet.json");

const admin = Keypair.fromSecret(requireEnv("ADMIN_SECRET"));
/** The deploy's MXN price (Reflector mainnet value); other currencies use the shared table. */
const mxnFallback = BigInt(requireEnv("MOCK_MXN_USD_PRICE"));
const EVERY_S = Number(optionalEnv("ORACLE_KEEPER_EVERY_S", "240"));
const LIVE = optionalEnv("ORACLE_SOURCE", "live") !== "hold";
const LEAVE_ALONE_AFTER_S = 1800;

const oracle = new OracleClient({
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  contractId: dep.contracts.oracle,
  publicKey: admin.publicKey(),
  signTransaction: contract.basicNodeSigner(admin, cfg.networkPassphrase).signTransaction,
});

// One price per currency, even if two corridors share one.
const CURRENCIES = [...new Map(CORRIDORS.map((c) => [c.currency, c])).values()];

/** A live rate is only accepted within 30% of the recorded fallback: guards against a bad feed. */
const sane = (c: CorridorInfo, r: unknown): r is number =>
  typeof r === "number" && r > c.fallbackPerUsd * 0.7 && r < c.fallbackPerUsd * 1.3;

async function wiseMid(c: CorridorInfo): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=${c.currency}&sendAmount=1000`,
      { signal: AbortSignal.timeout(8000) },
    );
    const j = (await r.json()) as { providers?: { quotes: { rate: number; isConsideredMidMarketRate: boolean }[] }[] };
    const mid = j.providers?.flatMap((p) => p.quotes).find((q) => q.isConsideredMidMarketRate)?.rate;
    return sane(c, mid) ? mid : null;
  } catch {
    return null;
  }
}

/** One request covers every currency. Fetched at most once per round. */
async function tableRates(url: string): Promise<Record<string, number>> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return ((await r.json()) as { rates?: Record<string, number> }).rates ?? {};
  } catch {
    return {};
  }
}

/** Live units of local currency per 1 USD, or null. */
async function liveRate(
  c: CorridorInfo,
  tables: { erApi?: Record<string, number>; ecb?: Record<string, number> },
): Promise<{ rate: number; source: string } | null> {
  const mid = await wiseMid(c);
  if (mid !== null) return { rate: mid, source: "Wise mid-market" };
  tables.erApi ??= await tableRates("https://open.er-api.com/v6/latest/USD");
  if (sane(c, tables.erApi[c.currency])) return { rate: tables.erApi[c.currency], source: "open.er-api.com" };
  tables.ecb ??= await tableRates("https://api.frankfurter.dev/v1/latest?base=USD");
  if (sane(c, tables.ecb[c.currency])) return { rate: tables.ecb[c.currency], source: "ECB via Frankfurter" };
  return null;
}

/** Oracle price = USD per 1 unit of local currency, 14 decimals. */
const toOraclePrice = (localPerUsd: number) => BigInt(Math.round(10 ** ORACLE_DECIMALS / localPerUsd));

async function refresh(c: CorridorInfo, force: boolean, tables: Parameters<typeof liveRate>[1]) {
  const now = Math.floor(Date.now() / 1000);
  const current = await oraclePrice(oracle, c.currency);
  const age = current ? now - current.timestamp : Infinity;
  if (!force && age < EVERY_S) return;
  if (!force && age > LEAVE_ALONE_AFTER_S && age !== Infinity) {
    console.log(`${c.currency} price is ${age}s old: looks like the stale-price demo, leaving it`);
    return;
  }
  const live = LIVE ? await liveRate(c, tables) : null;
  const fallback = c.currency === "MXN" ? mxnFallback : fallbackOraclePrice(c.currency)!;
  const price = live ? toOraclePrice(live.rate) : (current?.price ?? fallback);
  const tx = await oracle.set_price({ asset: { tag: "Other", values: [c.currency] }, price });
  await tx.signAndSend();
  console.log(
    `${new Date().toISOString()} ${c.currency} price set to ${price}` +
      (live ? ` (1 USD = ${live.rate} ${c.currency}, ${live.source})` : " (re-stamped, no live source)") +
      (age === Infinity ? "" : `, previous was ${age}s old`),
  );
}

async function tick(force: boolean) {
  const tables = {};
  // One at a time: every update is a transaction from the same admin account.
  for (const c of CURRENCIES) {
    try {
      await refresh(c, force, tables);
    } catch (e) {
      console.error(`keeper: ${c.currency} failed:`, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

async function loop(force: boolean) {
  await tick(force);
  setTimeout(() => loop(false), 30_000);
}

console.log(
  `oracle keeper: ${CURRENCIES.map((c) => c.currency).join(", ")} every ${EVERY_S}s, ` +
    `source ${LIVE ? "live market rate" : "hold current prices"}`,
);
loop(true);
