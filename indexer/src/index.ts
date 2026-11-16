// Event indexer (issue #16). API is FROZEN: docs/BUILD_PLAN.md section 4.10.
//
// Follows the RateRace contract's events over Stellar RPC (`getEvents`) and folds them into
// each order's current status and timeline, plus a per-anchor leaderboard. Everything it
// serves can be re-derived from the chain: on start it replays from the deploy ledger.
//
// Note for production: public RPC nodes only keep recent events (about a week), so a real
// deployment would use a full indexer with its own database.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import {
  PORTS,
  bytesToHex,
  hexToBytes,
  type FamilyAnswer,
  type FamilyView,
  type LeaderboardRow,
  type OrderView,
} from "@raterace/shared";
import { makeClients } from "@raterace/shared/chain";
import { fetchEvents, type ContractEvent, type EventCursor } from "@raterace/shared/events";
import { REPO_ROOT, loadConfig, loadDeployment } from "@raterace/shared/node";

const POLL_MS = 3000;

const cfg = loadConfig();
const deployment = loadDeployment();
const ready = Boolean(cfg.rateraceContractId && cfg.oracleContractId && deployment);

const orders = new Map<number, OrderView>();
let leaderboard: LeaderboardRow[] = [];
let lastLedger = 0;

// ---------- family links ----------
// After locking an offer, the sender creates a private link for the recipient. The recipient
// needs no account: the link shows the transfer's progress and lets them say whether the money
// arrived. Their answer is relayed to the sender's app, which signs the on-chain confirm or
// dispute. This is off-chain convenience data, kept in a small local file.

interface FamilyLink {
  contractId: string;
  /** sha256 of the secret in the link. The secret itself is never stored. */
  tokenHash: string;
  answer: FamilyAnswer | null;
}

const FAMILY_FILE = resolve(REPO_ROOT, "indexer/.family.json");
const family = new Map<number, FamilyLink>();
try {
  if (existsSync(FAMILY_FILE)) {
    for (const [id, link] of Object.entries(JSON.parse(readFileSync(FAMILY_FILE, "utf8")) as Record<string, FamilyLink>)) {
      // Links belong to one deployment: order ids restart at 1 on every redeploy.
      if (link.contractId === cfg.rateraceContractId) family.set(Number(id), link);
    }
  }
} catch {
  // unreadable file: start empty
}
function saveFamily() {
  try {
    writeFileSync(FAMILY_FILE, JSON.stringify(Object.fromEntries(family)));
  } catch {
    // read-only disk (some hosts): links then live in memory only
  }
}
const sha256Hex = (text: string) => createHash("sha256").update(text).digest("hex");
/** The message the sender signs to prove the family link is theirs. */
export const familyLinkMessage = (orderId: number, tokenHash: string) =>
  Buffer.from(`raterace-family-link:${orderId}:${tokenHash}`);

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
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "indexer", ready, orders: orders.size, lastLedger });
  });

  const withAnswer = (o: OrderView): OrderView => {
    const answer = family.get(o.id)?.answer;
    return answer ? { ...o, familyAnswer: answer } : o;
  };

  app.get("/orders/:id", (req, res) => {
    const order = orders.get(Number(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(withAnswer(order));
  });

  // Sender creates the family link. Body: { token, signature }.
  // `signature` is the sender's ed25519 signature over familyLinkMessage(id, sha256(token)),
  // so only the account that opened the order can create its link.
  app.post("/family/:id", (req, res) => {
    const id = Number(req.params.id);
    const order = orders.get(id);
    const { token, signature } = (req.body ?? {}) as { token?: string; signature?: string };
    if (!order) {
      res.status(404).json({ error: "Order not found yet. Try again in a few seconds." });
      return;
    }
    if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token) || typeof signature !== "string") {
      res.status(400).json({ error: "Bad request" });
      return;
    }
    const tokenHash = sha256Hex(token);
    let valid = false;
    try {
      valid = Keypair.fromPublicKey(order.sender).verify(
        familyLinkMessage(id, tokenHash),
        Buffer.from(hexToBytes(signature)),
      );
    } catch {
      valid = false;
    }
    if (!valid) {
      res.status(403).json({ error: "Only the sender can create this link." });
      return;
    }
    const existing = family.get(id);
    if (existing && existing.tokenHash !== tokenHash) {
      res.status(409).json({ error: "A link already exists for this transfer." });
      return;
    }
    if (!existing) {
      family.set(id, { contractId: cfg.rateraceContractId, tokenHash, answer: null });
      saveFamily();
    }
    res.json({ ok: true });
  });

  const familyLink = (id: number, token: unknown) => {
    const link = family.get(id);
    return link && typeof token === "string" && sha256Hex(token) === link.tokenHash ? link : null;
  };

  // Recipient's view. Needs the secret from the link.
  app.get("/family/:id", (req, res) => {
    const id = Number(req.params.id);
    const link = familyLink(id, req.query.token);
    const order = orders.get(id);
    if (!link || !order) {
      res.status(404).json({ error: "This link is not valid." });
      return;
    }
    const view: FamilyView = {
      id,
      status: order.status,
      landedLocal: order.landedLocal,
      anchorName: order.anchorName,
      payoutDeadline: order.payoutDeadline,
      challengeEnds: order.challengeEnds,
      paidAt: order.txs.find((t) => t.event === "paid")?.at ?? 0,
      answer: link.answer,
    };
    res.json(view);
  });

  // Recipient answers "did it arrive?". Body: { token, arrived }.
  app.post("/family/:id/answer", (req, res) => {
    const id = Number(req.params.id);
    const { token, arrived } = (req.body ?? {}) as { token?: string; arrived?: boolean };
    const link = familyLink(id, token);
    const order = orders.get(id);
    if (!link || !order) {
      res.status(404).json({ error: "This link is not valid." });
      return;
    }
    if (typeof arrived !== "boolean") {
      res.status(400).json({ error: "Bad request" });
      return;
    }
    if (order.status !== "Paid") {
      res.status(409).json({ error: "This transfer is not waiting for an answer." });
      return;
    }
    if (!link.answer) {
      link.answer = { arrived, at: Math.floor(Date.now() / 1000) };
      saveFamily();
    }
    res.json({ ok: true, answer: link.answer });
  });

  app.get("/orders", (req, res) => {
    const sender = typeof req.query.sender === "string" ? req.query.sender : undefined;
    const list = [...orders.values()]
      .filter((o) => !sender || o.sender === sender)
      .sort((a, b) => b.id - a.id);
    res.json(list.map(withAnswer));
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
