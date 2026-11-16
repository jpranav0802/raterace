// Payout workers for the mock anchors (issue #15).
//
// A worker watches the contract's `awarded` events. When its anchor wins an order it
// "pays the family" (simulated SPEI transfer), then calls `mark_paid` with a hash of the
// payout receipt and receives the escrowed USDC.
//
// Alpha and Beta are honest. Gamma never pays: its orders run past the deadline, which is
// what triggers the refund + penalty in the demo.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair, contract, rpc } from "@stellar/stellar-sdk";
import { corridorById, explorerTx, formatLocal, type AnchorName } from "@raterace/shared";
import { RateRaceClient } from "@raterace/shared/chain";
import { fetchEvents, type EventCursor } from "@raterace/shared/events";
import { REPO_ROOT, loadConfig, optionalEnv } from "@raterace/shared/node";

const POLL_MS = 4000;

/** How long each anchor's (simulated) bank transfer takes. `null` = never pays. */
const PAYOUT_DELAY_S: Record<AnchorName, number | null> = {
  alpha: 10,
  beta: 20,
  gamma: null,
};

function startWorker(name: AnchorName) {
  const cfg = loadConfig();
  const secret = optionalEnv(`${name.toUpperCase()}_SECRET`);
  if (!secret || !cfg.rateraceContractId) {
    console.log(`payout ${name}: not configured (no .env yet)`);
    return;
  }
  const delay = PAYOUT_DELAY_S[name];
  if (delay === null) {
    console.log(`payout ${name}: never pays (demo of a failing provider)`);
    return;
  }

  const keypair = Keypair.fromSecret(secret);
  const address = keypair.publicKey();
  const server = new rpc.Server(cfg.rpcUrl);
  const client = new RateRaceClient({
    contractId: cfg.rateraceContractId,
    networkPassphrase: cfg.networkPassphrase,
    rpcUrl: cfg.rpcUrl,
    publicKey: address,
    signTransaction: contract.basicNodeSigner(keypair, cfg.networkPassphrase).signTransaction,
  });

  // Remember where we got to, per contract, so a restart doesn't replay or miss events.
  const cursorFile = resolve(REPO_ROOT, `anchors/.cursor-${name}.json`);
  let cursor: EventCursor = { startLedger: cfg.deployLedger };
  try {
    if (existsSync(cursorFile)) {
      const saved = JSON.parse(readFileSync(cursorFile, "utf8"));
      if (saved.contractId === cfg.rateraceContractId) cursor = saved.cursor;
    }
  } catch {
    // unreadable cursor file: start from the deploy ledger
  }
  const saveCursor = () =>
    writeFileSync(cursorFile, JSON.stringify({ contractId: cfg.rateraceContractId, cursor }));

  const inFlight = new Set<string>();

  async function payOut(orderId: bigint) {
    const key = orderId.toString();
    if (inFlight.has(key)) return;
    inFlight.add(key);
    try {
      await new Promise((r) => setTimeout(r, delay! * 1000));

      // Idempotent: only pay orders that are still open (e.g. after a restart).
      const order = (await client.get_order({ order_id: orderId })).result.unwrap();
      if (order.status.tag !== "Open") return;
      if (BigInt(Math.floor(Date.now() / 1000)) > order.payout_deadline) {
        console.log(`payout ${name}: order ${key} is past its deadline, skipping`);
        return;
      }

      // The "bank transfer". Only its hash goes on-chain; the receipt itself stays with the anchor.
      const corridor = corridorById(String(order.quote.corridor));
      const currency = String(order.quote.asset_code);
      const receipt = {
        orderId: key,
        rail: corridor?.method ?? "bank transfer",
        currency,
        amountLocal: order.quote.landed_local.toString(),
        recipientHash: Buffer.from(order.recipient_hash).toString("hex"),
        trackingId: randomBytes(8).toString("hex"),
        paidAt: new Date().toISOString(),
      };
      const payoutRef = createHash("sha256").update(JSON.stringify(receipt)).digest();

      const tx = await client.mark_paid({ anchor: address, order_id: orderId, payout_ref: payoutRef });
      const sent = await tx.signAndSend();
      const hash = sent.sendTransactionResponse?.hash ?? "";
      console.log(
        `payout ${name}: order ${key} paid ${formatLocal(order.quote.landed_local, currency)} -> mark_paid ` +
          (hash ? explorerTx(hash, cfg.explorerUrl) : "sent"),
      );
    } catch (e) {
      console.error(`payout ${name}: order ${key} failed: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      inFlight.delete(key);
    }
  }

  async function poll() {
    try {
      const { events, next } = await fetchEvents(server, cfg.rateraceContractId, cursor);
      cursor = next;
      if (events.length) saveCursor();
      for (const ev of events) {
        if (ev.name === "awarded" && ev.data.anchor === address) {
          void payOut(ev.subject as bigint);
        }
      }
    } catch (e) {
      console.error(`payout ${name}: could not read events: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  console.log(`payout ${name}: watching for orders (pays after ~${delay}s)`);
  void poll();
  setInterval(poll, POLL_MS);
}

export function startPayoutWorkers() {
  for (const name of Object.keys(PAYOUT_DELAY_S) as AnchorName[]) startWorker(name);
}
