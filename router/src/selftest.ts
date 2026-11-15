// End-to-end check of the router, the way a brand-new browser user goes through it.
// Run the anchors and the router first, then:  npm run selftest -w @raterace/router
//
//   1. new keypair -> /onboard/fund (Friendbot)
//   2. USDC trustline, signed by the user, fee paid by the sponsor via /submit
//   3. /onboard/usdc (1,000 test USDC)
//   4. /rfq -> best quote -> open_order signed by the user, sponsored via /submit
//   5. check: order exists on-chain and the user paid 0 XLM in fees
import { createHash } from "node:crypto";
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder, contract } from "@stellar/stellar-sdk";
import { formatMxn, hexToBytes, type RfqResponse, type SubmitResponse } from "@raterace/shared";
import { RateRaceClient, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error("No deployments/testnet.json");
const ROUTER = cfg.routerUrl;
const horizon = new Horizon.Server(cfg.horizonUrl);

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${ROUTER}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${JSON.stringify(json)}`);
  return json;
}

const user = Keypair.random();
console.log("user", user.publicKey());

// 1. create the account
await post("/onboard/fund", { publicKey: user.publicKey() });
console.log("1. funded by Friendbot");

// 2. trustline, sponsored
const acct = await horizon.loadAccount(user.publicKey());
const xlmBefore = acct.balances.find((b) => b.asset_type === "native")!.balance;
const trust = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
  .addOperation(Operation.changeTrust({ asset: new Asset(dep.usdc.code, dep.usdc.issuer) }))
  .setTimeout(60)
  .build();
trust.sign(user);
const t = await post<SubmitResponse>("/submit", { xdr: trust.toXDR() });
console.log("2. trustline", t.status, t.explorerUrl);

// 3. test dollars
await post("/onboard/usdc", { publicKey: user.publicKey() });
console.log("3. received 1,000 test USDC");

// 4. quotes, then open_order with the best one
const rfq = await post<RfqResponse>("/rfq", {
  corridor: "MX_SPEI",
  assetCode: "MXN",
  sendUsdc: "2000000000",
  sender: user.publicKey(),
  recipientCountry: "MX",
  method: "SPEI",
});
if (rfq.quotes.length === 0) throw new Error("no quotes");
const best = rfq.quotes[0];
console.log(`4. ${rfq.quotes.length} quotes; best ${best.displayName} lands ${formatMxn(best.landedLocal)}`);

const signer = contract.basicNodeSigner(user, cfg.networkPassphrase);
const client = new RateRaceClient({
  contractId: dep.contracts.raterace,
  networkPassphrase: cfg.networkPassphrase,
  rpcUrl: cfg.rpcUrl,
  publicKey: user.publicKey(),
  signTransaction: signer.signTransaction,
});
const recipientHash = createHash("sha256").update(JSON.stringify({ name: "Rosa", clabe: "002180700000000000" })).digest();
const tx = await client.open_order({
  sender: user.publicKey(),
  quote: toContractQuote(best),
  signature: Buffer.from(hexToBytes(best.signature)),
  recipient_hash: recipientHash,
  max_markup_bps: 300,
});
await tx.sign();
const sub = await post<SubmitResponse>("/submit", { xdr: tx.signed!.toXDR() });
console.log("   open_order", sub.status, "order id", sub.returnValue, sub.explorerUrl);

// 5. checks
const order = (await client.get_order({ order_id: BigInt(sub.returnValue!) })).result.unwrap();
const after = await horizon.loadAccount(user.publicKey());
const xlmAfter = after.balances.find((b) => b.asset_type === "native")!.balance;
console.log(`5. order status ${order.status.tag}; user XLM before ${xlmBefore}, after ${xlmAfter} (trustline reserve only, no fees)`);

// A transaction for some other contract must be refused.
const bad = new TransactionBuilder(after, { fee: BASE_FEE, networkPassphrase: cfg.networkPassphrase })
  .addOperation(Operation.payment({ destination: dep.accounts.admin, asset: Asset.native(), amount: "1" }))
  .setTimeout(60)
  .build();
bad.sign(user);
const refused = await fetch(`${ROUTER}/submit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ xdr: bad.toXDR() }),
});
console.log("   non-allowed transaction refused:", refused.status === 400, await refused.text());
