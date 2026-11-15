// Keeps the mock oracle's MXN price fresh, the way Reflector updates every 5 minutes on
// mainnet. Owner: Abhiraj (#25). Without it the contract refuses every order 10 minutes
// after the last price update (OracleStale, max_oracle_age_s = 600).
//   npm run oracle:keeper -w @raterace/scripts
//
// It re-stamps the CURRENT price (so a price set from /admin is kept). It leaves a price
// older than 30 minutes alone: that is the deliberate "make price stale" demo. On start it
// always refreshes, so a host that slept recovers by itself.
import { contract, Keypair } from "@stellar/stellar-sdk";
import { ASSET_MXN } from "@raterace/shared";
import { OracleClient, oraclePrice } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, optionalEnv, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error("No deployments/testnet.json");

const admin = Keypair.fromSecret(requireEnv("ADMIN_SECRET"));
const fallbackPrice = BigInt(requireEnv("MOCK_MXN_USD_PRICE"));
const EVERY_S = Number(optionalEnv("ORACLE_KEEPER_EVERY_S", "240"));
const LEAVE_ALONE_AFTER_S = 1800;

const oracle = new OracleClient({
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  contractId: dep.contracts.oracle,
  publicKey: admin.publicKey(),
  signTransaction: contract.basicNodeSigner(admin, cfg.networkPassphrase).signTransaction,
});
const MXN = { tag: "Other" as const, values: [ASSET_MXN] as [string] };

async function tick(force: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const current = await oraclePrice(oracle, ASSET_MXN);
  const age = current ? now - current.timestamp : Infinity;
  if (!force && age < EVERY_S) return;
  if (!force && age > LEAVE_ALONE_AFTER_S) {
    console.log(`price is ${age}s old: looks like the stale-price demo, leaving it`);
    return;
  }
  const price = current?.price ?? fallbackPrice;
  const tx = await oracle.set_price({ asset: MXN, price });
  await tx.signAndSend();
  console.log(`${new Date().toISOString()} MXN price re-stamped (${price}), was ${age}s old`);
}

async function loop(force: boolean) {
  try {
    await tick(force);
  } catch (e) {
    console.error("keeper tick failed:", e instanceof Error ? e.message : e);
  }
  setTimeout(() => loop(false), 30_000);
}

console.log(`oracle keeper: refresh every ${EVERY_S}s`);
loop(true);
