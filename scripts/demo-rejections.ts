// The contract saying "no", for the demo video. Owner: Abhiraj (issue #22).
//   npm run demo:rejections
//
// Each case builds a quote signed by Alpha's real quote key and asks the contract to open an
// order with it (simulation only: nothing is sent, no money moves). The contract decides.
//   0. a fair offer                      -> accepted
//   1. market price is an hour old       -> OracleStale (23)
//   2. offer lands 6% below the market   -> MarkupTooHigh (24)
// The price is restored to a fresh one at the end, even if a case fails.
import { randomBytes } from "node:crypto";
import { contract, Keypair, rpc } from "@stellar/stellar-sdk";
import {
  CONTRACT_ERRORS,
  CORRIDOR_MX_SPEI,
  ASSET_MXN,
  formatBps,
  formatMxn,
  landedLocal,
  marketLocal,
  markupBps,
  toUnits,
} from "@raterace/shared";
import { OracleClient, RateRaceClient, oraclePrice, quoteDigest, type Quote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error('No deployments/testnet.json yet. Run "npm run deploy" first.');

const admin = Keypair.fromSecret(requireEnv("ADMIN_SECRET"));
const alphaQuoteKey = Keypair.fromSecret(requireEnv("ALPHA_QUOTE_SECRET"));
const alpha = dep.anchors.find((a) => a.name === "alpha");
if (!alpha) throw new Error("No alpha anchor in the deployment");
const sender = dep.accounts.demoSender;

const base = { rpcUrl: cfg.rpcUrl, networkPassphrase: cfg.networkPassphrase };
const raterace = new RateRaceClient({ ...base, contractId: dep.contracts.raterace, publicKey: sender });
const oracle = new OracleClient({
  ...base,
  contractId: dep.contracts.oracle,
  publicKey: admin.publicKey(),
  signTransaction: contract.basicNodeSigner(admin, cfg.networkPassphrase).signTransaction,
});
const MXN = { tag: "Other" as const, values: [ASSET_MXN] as [string] };

const SEND = toUnits("200");
const now = () => Math.floor(Date.now() / 1000);

async function setPrice(price: bigint, timestamp?: number) {
  const tx =
    timestamp === undefined
      ? await oracle.set_price({ asset: MXN, price })
      : await oracle.set_price_at({ asset: MXN, price, timestamp: BigInt(timestamp) });
  await tx.signAndSend();
}

/** Signs a quote with Alpha's key, then simulates open_order. Returns the error code, or null if accepted. */
async function tryOpen(landed: bigint): Promise<number | null> {
  const quote: Quote = {
    anchor: alpha!.address,
    request_id: randomBytes(32),
    corridor: CORRIDOR_MX_SPEI,
    asset_code: ASSET_MXN,
    send_usdc: SEND,
    landed_local: landed,
    expires_at: BigInt(now() + 120),
  };
  const digest = await quoteDigest(raterace, quote);
  const tx = await raterace.open_order({
    sender,
    quote,
    signature: Buffer.from(alphaQuoteKey.sign(digest)),
    recipient_hash: randomBytes(32),
    max_markup_bps: 300,
  });
  const sim = tx.simulation;
  if (sim && rpc.Api.isSimulationError(sim)) {
    const m = sim.error.match(/Error\(Contract, #(\d+)\)/);
    if (!m) throw new Error(`Unexpected failure: ${sim.error}`);
    return Number(m[1]);
  }
  return null;
}

function verdict(code: number | null, expected: number | null) {
  const got = code === null ? "accepted" : `refused: ${CONTRACT_ERRORS[code]} (${code})`;
  const ok = code === expected ? "as expected" : `UNEXPECTED, wanted ${expected === null ? "accepted" : expected}`;
  console.log(`   Contract: ${got}  [${ok}]\n`);
  return code === expected;
}

const configured = BigInt(requireEnv("MOCK_MXN_USD_PRICE"));
const current = await oraclePrice(oracle, ASSET_MXN);
const price = current?.price ?? configured;
const market = marketLocal(SEND, price);
let allOk = true;

console.log(`\nSending $200 to Mexico. Market rate today: ${formatMxn(market)}.\n`);

try {
  // Fresh price so case 0 and 2 test only what they mean to.
  await setPrice(price);

  const fair = landedLocal(SEND, price, 80, toUnits("10"));
  console.log(`0. Alpha offers ${formatMxn(fair)} (${formatBps(markupBps(SEND, fair, price))} below market).`);
  allOk = verdict(await tryOpen(fair), null) && allOk;

  console.log("1. The market price feed stops updating. Its last price is an hour old.");
  await setPrice(price, now() - 3600);
  console.log("   Alpha offers the same fair amount.");
  const stale = await tryOpen(fair);
  allOk = verdict(stale, 23) && allOk;
  console.log("   Nobody can lock an offer against an old price. The sender sees:");
  console.log('   "The market rate is unavailable. Try again in a minute."\n');
  await setPrice(price);

  const greedy = (market * 94n) / 100n;
  console.log(
    `2. Alpha offers ${formatMxn(greedy)}: ${formatBps(markupBps(SEND, greedy, price))} below market, ` +
      `${formatMxn(market - greedy)} less for the family.`,
  );
  allOk = verdict(await tryOpen(greedy), 24) && allOk;
  console.log("   The limit is 3%. A provider cannot quietly widen its margin. The sender sees:");
  console.log('   "This offer is too far below the market rate."\n');
} finally {
  await setPrice(price);
  console.log("Market price restored and fresh.");
}

if (!allOk) process.exit(1);
