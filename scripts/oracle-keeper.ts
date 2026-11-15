// Keeps the mock oracle's MXN price fresh AND real, the way Reflector does on mainnet.
// Owner: Abhiraj (#25). Without it the contract refuses every order 10 minutes after the
// last price update (OracleStale, max_oracle_age_s = 600).
//   npm run oracle:keeper -w @raterace/scripts
//
// Every 4 minutes it writes the live USD/MXN mid-market rate (Wise's public mid-market
// rate, falling back to the ECB rate via Frankfurter) to the mock oracle. If both sources
// are down it re-stamps the current price so orders keep working.
//   ORACLE_SOURCE=hold   keep whatever price is set (e.g. one set from /admin), only re-stamp
//
// It leaves a price older than 30 minutes alone: that is the deliberate "make price stale"
// demo. On start it always refreshes, so a host that slept recovers by itself.
import { contract, Keypair } from "@stellar/stellar-sdk";
import { ASSET_MXN, ORACLE_DECIMALS } from "@raterace/shared";
import { OracleClient, oraclePrice } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, optionalEnv, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error("No deployments/testnet.json");

const admin = Keypair.fromSecret(requireEnv("ADMIN_SECRET"));
const fallbackPrice = BigInt(requireEnv("MOCK_MXN_USD_PRICE"));
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
const MXN = { tag: "Other" as const, values: [ASSET_MXN] as [string] };

/** Live MXN per 1 USD, or null. */
async function liveMxnPerUsd(): Promise<{ rate: number; source: string } | null> {
  const sane = (r: unknown): r is number => typeof r === "number" && r > 10 && r < 40;
  try {
    const r = await fetch("https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=MXN&sendAmount=1000", {
      signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { providers?: { quotes: { rate: number; isConsideredMidMarketRate: boolean }[] }[] };
    const mid = j.providers?.flatMap((p) => p.quotes).find((q) => q.isConsideredMidMarketRate)?.rate;
    if (sane(mid)) return { rate: mid, source: "Wise mid-market" };
  } catch {
    /* try the next source */
  }
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN", { signal: AbortSignal.timeout(8000) });
    const rate = ((await r.json()) as { rates?: { MXN?: number } }).rates?.MXN;
    if (sane(rate)) return { rate, source: "ECB via Frankfurter" };
  } catch {
    /* fall through */
  }
  return null;
}

/** Oracle price = USD per 1 MXN with 14 decimals. */
const toOraclePrice = (mxnPerUsd: number) => BigInt(Math.round(10 ** ORACLE_DECIMALS / mxnPerUsd));

async function tick(force: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const current = await oraclePrice(oracle, ASSET_MXN);
  const age = current ? now - current.timestamp : Infinity;
  if (!force && age < EVERY_S) return;
  if (!force && age > LEAVE_ALONE_AFTER_S) {
    console.log(`price is ${age}s old: looks like the stale-price demo, leaving it`);
    return;
  }
  const live = LIVE ? await liveMxnPerUsd() : null;
  const price = live ? toOraclePrice(live.rate) : (current?.price ?? fallbackPrice);
  const tx = await oracle.set_price({ asset: MXN, price });
  await tx.signAndSend();
  console.log(
    `${new Date().toISOString()} MXN price set to ${price}` +
      (live ? ` (1 USD = ${live.rate} MXN, ${live.source})` : " (re-stamped, no live source)") +
      `, previous was ${age}s old`,
  );
}

async function loop(force: boolean) {
  try {
    await tick(force);
  } catch (e) {
    console.error("keeper tick failed:", e instanceof Error ? e.message : e);
  }
  setTimeout(() => loop(false), 30_000);
}

console.log(`oracle keeper: refresh every ${EVERY_S}s, source ${LIVE ? "live market rate" : "hold current price"}`);
loop(true);
