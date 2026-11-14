// Reads the deployed contracts through the generated TypeScript client and prints their
// state. Also a working example of how to use the client. Run: npm run check
import { Keypair } from "@stellar/stellar-sdk";
import { Client as OracleClient } from "oracle-client";
import { Client as RateRaceClient, type Quote } from "raterace-client";
import { explorerContract, formatMxn, formatUsd } from "@raterace/shared";
import { loadConfig, loadDeployment, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const deployment = loadDeployment();
if (!deployment) throw new Error('No deployments/testnet.json yet. Run "npm run deploy" first.');

const options = {
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  // Any funded account works as the simulation source for read-only calls.
  publicKey: deployment.accounts.sponsor,
};
const raterace = new RateRaceClient({ ...options, contractId: deployment.contracts.raterace });
const oracle = new OracleClient({ ...options, contractId: deployment.contracts.oracle });

console.log(`RateRace ${deployment.contracts.raterace}`);
console.log(`         ${explorerContract(deployment.contracts.raterace)}\n`);

// Calls are simulated automatically; `.result` is the decoded return value.
const config = (await raterace.get_config()).result.unwrap();
console.log(
  `Config: payout ${config.payout_window_s}s, challenge ${config.challenge_window_s}s, ` +
    `bond ${config.bond_ratio_bps / 100}%, penalty ${config.penalty_bps / 100}%, ` +
    `max markup ${config.default_max_markup_bps / 100}%`,
);

const price = (await oracle.lastprice({ asset: { tag: "Other", values: ["MXN"] } })).result;
if (!price) throw new Error("Oracle has no MXN price");
console.log(`Oracle: 1 MXN = ${Number(price.price) / 1e14} USD (set at ${new Date(Number(price.timestamp) * 1000).toISOString()})\n`);

const ids = (await raterace.list_anchor_ids()).result;
for (const id of ids) {
  const a = (await raterace.get_anchor({ anchor: id })).result.unwrap();
  const name = deployment.anchors.find((x) => x.address === id)?.displayName ?? id.slice(0, 6);
  console.log(
    `${name.padEnd(6)} ${a.active ? "active   " : "suspended"} bond ${formatUsd(a.bond)} ` +
      `(locked ${formatUsd(a.reserved)})  delivered ${a.filled}, disputed ${a.disputed}, penalties ${a.slashed}`,
  );
}

// The signing pattern: get the digest from the contract, sign it with the anchor's quote key.
const alpha = deployment.anchors[0];
const quote: Quote = {
  anchor: alpha.address,
  request_id: Buffer.alloc(32, 1),
  corridor: "MX_SPEI",
  asset_code: "MXN",
  send_usdc: 2_000_000_000n,
  landed_local: 39_370_000_000n,
  expires_at: BigInt(Math.floor(Date.now() / 1000) + 120),
};
// BytesN values can come back as a plain Uint8Array: wrap them in a Buffer before use.
const digest = Buffer.from((await raterace.quote_digest({ quote })).result);
const quoteKey = Keypair.fromSecret(requireEnv("ALPHA_QUOTE_SECRET"));
const signature = quoteKey.sign(digest);
const ok =
  Buffer.from(quoteKey.rawPublicKey()).toString("hex") === alpha.signingKeyHex &&
  quoteKey.verify(digest, signature);
console.log(
  `\nSample quote: ${formatUsd(quote.send_usdc)} -> ${formatMxn(quote.landed_local)}; ` +
    `digest ${digest.toString("hex").slice(0, 16)}..., signature ${ok ? "valid and matches the on-chain key" : "INVALID"}`,
);
if (!ok) process.exit(1);
