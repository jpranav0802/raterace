// SEP-1 discovery check: what a wallet does to find and trust an anchor. Owner: Avani.
// For each mock anchor: fetch /.well-known/stellar.toml with the Stellar SDK's own SEP-1
// resolver, then confirm the SIGNING_KEY it publishes is the key registered for that
// anchor in the RateRace contract on testnet. Run (with the anchors running):
//   npm run dev:anchors      (in another terminal)
//   npm run check:toml
import { StellarToml, StrKey } from "@stellar/stellar-sdk";
import { Client as RateRaceClient } from "raterace-client";
import { explorerContract } from "@raterace/shared";
import { loadConfig, loadDeployment, optionalEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const deployment = loadDeployment();
if (!deployment) throw new Error('No deployments/testnet.json yet. Run "npm run deploy" first.');

const raterace = new RateRaceClient({
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  publicKey: deployment.accounts.sponsor, // any funded account works for read-only calls
  contractId: deployment.contracts.raterace,
});

const urls = new Map(
  optionalEnv("ANCHOR_URLS")
    .split(",")
    .map((p) => p.split("=").map((x) => x.trim()) as [string, string])
    .filter(([k, v]) => k && v),
);

let failures = 0;
const ok = (good: boolean, label: string) => {
  if (!good) failures++;
  console.log(`  ${good ? "✓" : "✗"} ${label}`);
};

console.log(`RateRace contract ${explorerContract(deployment.contracts.raterace)}\n`);

for (const a of deployment.anchors) {
  const base = urls.get(a.name) || a.quoteUrl;
  const domain = new URL(base).host; // e.g. localhost:8801
  console.log(`${a.displayName}: ${base}/.well-known/stellar.toml`);
  let toml: StellarToml.Api.StellarToml;
  try {
    // allowHttp only because the demo anchors run on localhost; real anchors must use https.
    toml = await StellarToml.Resolver.resolve(domain, { allowHttp: true, timeout: 5000 });
  } catch (e) {
    ok(false, `could not fetch it (${(e as Error).message}). Is "npm run dev:anchors" running?`);
    continue;
  }

  ok(toml.NETWORK_PASSPHRASE === cfg.networkPassphrase, `network: ${toml.NETWORK_PASSPHRASE}`);
  ok(Boolean(toml.ACCOUNTS?.includes(a.address)), `ACCOUNTS lists ${a.address}`);
  ok(Boolean(toml.ANCHOR_QUOTE_SERVER), `ANCHOR_QUOTE_SERVER = ${toml.ANCHOR_QUOTE_SERVER}`);

  const published = toml.SIGNING_KEY ?? "";
  if (!StrKey.isValidEd25519PublicKey(published)) {
    ok(false, `SIGNING_KEY is not a valid Stellar public key: "${published}"`);
    continue;
  }
  const publishedHex = Buffer.from(StrKey.decodeEd25519PublicKey(published)).toString("hex");
  const onChain = (await raterace.get_anchor({ anchor: a.address })).result.unwrap();
  const onChainHex = Buffer.from(onChain.signing_key).toString("hex");
  ok(
    publishedHex === onChainHex,
    `SIGNING_KEY ${published.slice(0, 8)}… matches the key registered on-chain (${onChainHex.slice(0, 12)}…)`,
  );
  console.log("");
}

if (failures) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All anchors are discoverable via SEP-1, and their published keys match the contract.");
