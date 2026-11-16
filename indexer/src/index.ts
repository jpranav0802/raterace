// Event indexer (issue #16). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
// Follows the RateRace contract's events over Stellar RPC (`getEvents`) and folds them into
// each order's current status and timeline, plus a per-anchor leaderboard. Everything it
// serves can be re-derived from the chain: on start it replays from the deploy ledger.
//
// Note for production: public RPC nodes only keep recent events (about a week), so a real
// deployment would use a full indexer with its own database.
import cors from "cors";
import express from "express";
import { rpc } from "@stellar/stellar-sdk";
import { PORTS, bytesToHex, type LeaderboardRow, type OrderView } from "@raterace/shared";
import { makeClients } from "@raterace/shared/chain";
import { fetchEvents, type ContractEvent, type EventCursor } from "@raterace/shared/events";
import { loadConfig, loadDeployment } from "@raterace/shared/node";

const POLL_MS = 3000;

const cfg = loadConfig();
const deployment = loadDeployment();
const ready = Boolean(cfg.rateraceContractId && cfg.oracleContractId && deployment);

const orders = new Map<number, OrderView>();
let leaderboard: LeaderboardRow[] = [];
let lastLedger = 0;

const anchorName = (address: string) =>
  deployment?.anchors.find((a) => a.address === address)?.name ?? "";
const anchorDisplay = (address: string) =>
  deployment?.anchors.find((a) => a.address === address)?.displayName ?? `${address.slice(0, 4)}…${address.slice(-4)}`;

/** Apply one contract event to the in-memory state. */
function apply(ev: ContractEvent) {
  lastLedger = Math.max(lastLedger, ev.ledger);
  if (typeof ev.subject !== "bigint") return; // anchor events only affect the leaderboard
  const id = Number(ev.subject);
  const d = ev.data;

  if (ev.name === "awarded") {
    orders.set(id, {
      id,
      status: "Open",
      sender: String(d.sender),
      anchor: String(d.anchor),
      anchorName: anchorName(String(d.anchor)),
      sendUsdc: String(d.send_usdc),
      landedLocal: String(d.landed_local),
      corridor: String(d.corridor),
      openedAt: ev.at,
      payoutDeadline: Number(d.payout_deadline),
      challengeEnds: 0,
      payoutRef: null,
      txs: [],
    });
  }
  const order = orders.get(id);
  if (!order) return;

  switch (ev.name) {
    case "paid":
      order.status = "Paid";
      order.challengeEnds = Number(d.challenge_ends);
      order.payoutRef = bytesToHex(d.payout_ref as Uint8Array);
      break;
    case "confirmed":
    case "released":
      order.status = "Settled";
      break;
    case "disputed":
      order.status = "Disputed";
      break;
    case "resolved":
      order.status = d.anchor_at_fault ? "Slashed" : "Settled";
      if (d.anchor_at_fault) {
        order.penalty = String(d.penalty);
        order.refund = (BigInt(order.sendUsdc) + BigInt(String(d.penalty))).toString();
      }
      break;
    case "refunded":
      order.status = "Refunded";
      order.refund = String(d.refund);
      order.penalty = String(d.penalty);
      break;
  }
  if (!order.txs.some((t) => t.hash === ev.txHash && t.event === ev.name)) {
    order.txs.push({ event: ev.name, hash: ev.txHash, ledger: ev.ledger, at: ev.at });
  }
}

async function main() {
  const app = express();
  app.use(cors());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "indexer", ready, orders: orders.size, lastLedger });
  });

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  });

  app.get("/orders", (req, res) => {
    const sender = typeof req.query.sender === "string" ? req.query.sender : undefined;
    const list = [...orders.values()]
      .filter((o) => !sender || o.sender === sender)
      .sort((a, b) => b.id - a.id);
    res.json(list);
  });

  app.get("/leaderboard", (_req, res) => {
    res.json(leaderboard);
  });

  const port = Number(process.env.PORT) || PORTS.indexer;
  app.listen(port, () =>
    console.log(
      `indexer listening on http://localhost:${port}` + (ready ? "" : "  (no .env yet: nothing to index)"),
    ),
  );
  if (!ready || !deployment) return;

  const server = new rpc.Server(cfg.rpcUrl);
  const { raterace } = makeClients({
    rpcUrl: cfg.rpcUrl,
    networkPassphrase: cfg.networkPassphrase,
    rateraceContractId: cfg.rateraceContractId,
    oracleContractId: cfg.oracleContractId,
    simulationAccount: deployment.accounts.sponsor,
  });

  /** Bond and track record live in contract storage, so read them from the contract. */
  async function refreshLeaderboard() {
    const ids = (await raterace.list_anchor_ids()).result;
    const rows = await Promise.all(
      ids.map(async (address): Promise<LeaderboardRow> => {
        const a = (await raterace.get_anchor({ anchor: address })).result.unwrap();
        return {
          anchor: address,
          name: anchorName(address),
          displayName: anchorDisplay(address),
          active: a.active,
          bond: a.bond.toString(),
          reserved: a.reserved.toString(),
          filled: a.filled,
          disputed: a.disputed,
          slashed: a.slashed,
        };
      }),
    );
    // Most deliveries first; suspended providers last.
    leaderboard = rows.sort(
      (x, y) => Number(y.active) - Number(x.active) || y.filled - x.filled || x.slashed - y.slashed,
    );
  }

  let cursor: EventCursor = { startLedger: cfg.deployLedger || deployment.deployLedger };
  let first = true;

  async function poll() {
    try {
      // Drain everything that is available, then wait for the next tick.
      for (;;) {
        const { events, next } = await fetchEvents(server, cfg.rateraceContractId, cursor);
        cursor = next;
        events.forEach(apply);
        if (events.length || first) await refreshLeaderboard();
        first = false;
        if (events.length < 200) break;
      }
    } catch (e) {
      console.error(`indexer: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  await poll();
  console.log(`indexer: caught up, ${orders.size} order(s)`);
  setInterval(poll, POLL_MS);
}

void main();
