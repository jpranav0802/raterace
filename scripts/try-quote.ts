// Asks each running mock anchor for a $200 quote, checks every signature against the
// key registered ON-CHAIN, and prints the offers best first. Run the anchors first:
//   npm run dev:anchors      (in another terminal)
//   npm run try-quote
import { randomBytes } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  formatBps,
  formatMxn,
  formatUsd,
  hexToBytes,
  marketLocal,
  markupBps,
  toUnits,
  type QuoteJson,
} from "@raterace/shared";
import { makeClients, oraclePrice, quoteDigest, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment } from "@raterace/shared/node";

const cfg = loadConfig();
const deployment = loadDeployment();
if (!deployment) throw new Error('No deployments/testnet.json yet. Run "npm run deploy" first.');

const { raterace, oracle } = makeClients({
  rpcUrl: cfg.rpcUrl,
  networkPassphrase: cfg.networkPassphrase,
  rateraceContractId: deployment.contracts.raterace,
  oracleContractId: deployment.contracts.oracle,
  simulationAccount: deployment.accounts.sponsor,
});

const amount = process.argv[2] || "200.00";
const requestId = randomBytes(32).toString("hex");
const expiresAt = Math.floor(Date.now() / 1000) + 120;
const price = await oraclePrice(oracle, "MXN");
if (!price) throw new Error("Oracle has no MXN price");

const rows: { name: string; landed: bigint; markup: number; ok: boolean }[] = [];
for (const a of deployment.anchors) {
  let res: Response;
  try {
    res = await fetch(`${a.quoteUrl}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sell_asset: `stellar:USDC:${deployment.usdc.issuer}`,
        buy_asset: "iso4217:MXN",
        sell_amount: amount,
        context: "sep31",
        raterace: {
          request_id: requestId,
          corridor: "MX_SPEI",
          sender: deployment.accounts.demoSender,
          expires_at: expiresAt,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    console.log(`${a.displayName}: not reachable at ${a.quoteUrl} (is "npm run dev:anchors" running?)`);
    continue;
  }
  if (!res.ok) {
    console.log(`${a.displayName}: no quote (${res.status} ${((await res.json()) as { error?: string }).error})`);
    continue;
  }
  const body = (await res.json()) as { raterace: { quote: Omit<QuoteJson, "signature">; signature: string } };
  const quote = body.raterace.quote;

  // Verify like the contract will: digest from the contract, key from the on-chain registry.
  const digest = await quoteDigest(raterace, toContractQuote(quote));
  const onChain = (await raterace.get_anchor({ anchor: a.address })).result.unwrap();
  const key = Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(onChain.signing_key)));
  const ok =
    quote.requestId === requestId &&
    quote.anchor === a.address &&
    key.verify(digest, Buffer.from(hexToBytes(body.raterace.signature)));

  const landed = BigInt(quote.landedLocal);
  rows.push({ name: a.displayName, landed, markup: markupBps(BigInt(quote.sendUsdc), landed, price.price), ok });
}

rows.sort((x, y) => (y.landed > x.landed ? 1 : -1));
const sendUnits = toUnits(amount);
console.log(`\nYou send ${formatUsd(sendUnits)}. Market rate would give ${formatMxn(marketLocal(sendUnits, price.price))}.\n`);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(6)} ${formatMxn(r.landed).padStart(13)}   ${formatBps(r.markup)} below market   signature ${r.ok ? "valid" : "INVALID"}`,
  );
}
if (rows.length !== deployment.anchors.length || rows.some((r) => !r.ok)) process.exit(1);
