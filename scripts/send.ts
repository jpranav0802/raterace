// Opens one order from the demo sender with a chosen anchor, straight against the contract
// (no router, no browser). Handy for testing the payout worker and for demo scripts.
//   npm run dev:anchors          (in another terminal)
//   npm run send -- alpha        (anchor: alpha | beta | gamma; optional amount, default 200)
import { createHash, randomBytes } from "node:crypto";
import { Keypair, contract } from "@stellar/stellar-sdk";
import { CONTRACT_ERRORS, explorerTx, formatMxn, formatUsd, hexToBytes, toUnits, type QuoteJson } from "@raterace/shared";
import { RateRaceClient, toContractQuote } from "@raterace/shared/chain";
import { loadConfig, loadDeployment, requireEnv } from "@raterace/shared/node";

const cfg = loadConfig();
const dep = loadDeployment();
if (!dep) throw new Error('No deployments/testnet.json yet. Run "npm run deploy" first.');

const anchorName = (process.argv[2] || "alpha").toLowerCase();
const amount = process.argv[3] || "200";
const anchor = dep.anchors.find((a) => a.name === anchorName);
if (!anchor) throw new Error(`Unknown anchor "${anchorName}". Use alpha, beta or gamma.`);

const sender = Keypair.fromSecret(requireEnv("DEMO_SENDER_SECRET"));
const client = new RateRaceClient({
  contractId: dep.contracts.raterace,
  networkPassphrase: cfg.networkPassphrase,
  rpcUrl: cfg.rpcUrl,
  publicKey: sender.publicKey(),
  signTransaction: contract.basicNodeSigner(sender, cfg.networkPassphrase).signTransaction,
});

/** Turn a contract rejection into one readable line. */
function fail(e: unknown): never {
  const code = Number(String((e as Error).message).match(/Error\(Contract, #(\d+)\)/)?.[1]);
  if (!code) throw e;
  const hint =
    code === 23 ? ' The market price is more than 10 minutes old. Start the backend with "npm run dev:backend" (it keeps the price fresh).' : "";
  console.error(`The contract refused the order: ${CONTRACT_ERRORS[code] ?? "error"} (${code}).${hint}`);
  process.exit(1);
}

const res = await fetch(`${anchor.quoteUrl}/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sell_asset: `stellar:USDC:${dep.usdc.issuer}`,
    buy_asset: "iso4217:MXN",
    sell_amount: amount,
    context: "sep31",
    raterace: {
      request_id: randomBytes(32).toString("hex"),
      corridor: "MX_SPEI",
      sender: sender.publicKey(),
      expires_at: Math.floor(Date.now() / 1000) + 120,
    },
  }),
}).catch(() => {
  throw new Error(`${anchor.displayName} is not reachable. Is "npm run dev:anchors" running?`);
});
if (!res.ok) throw new Error(`${anchor.displayName} gave no quote: ${res.status} ${await res.text()}`);
const body = (await res.json()) as { raterace: { quote: Omit<QuoteJson, "signature">; signature: string } };

const tx = await client
  .open_order({
  sender: sender.publicKey(),
  quote: toContractQuote(body.raterace.quote),
  signature: Buffer.from(hexToBytes(body.raterace.signature)),
  recipient_hash: createHash("sha256").update(JSON.stringify({ name: "Rosa", clabe: "002180700000000000" })).digest(),
    max_markup_bps: 300,
  })
  .catch(fail);
const sent = await tx.signAndSend().catch(fail);
const orderId = sent.result.unwrap();
console.log(
  `Order ${orderId}: ${formatUsd(toUnits(amount))} with ${anchor.displayName}, family receives ` +
    `${formatMxn(body.raterace.quote.landedLocal)}`,
);
console.log(explorerTx(sent.sendTransactionResponse?.hash ?? "", cfg.explorerUrl));
