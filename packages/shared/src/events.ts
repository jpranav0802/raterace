// Reading RateRace contract events over Stellar RPC (`getEvents`).
// Used by the anchors' payout workers and by the indexer. Import from "@raterace/shared/events".
//
// On-chain shape (see contracts/raterace/src/events.rs):
//   topics = [event name, order id or anchor address]   value = map of the remaining fields
import { rpc, scValToNative } from "@stellar/stellar-sdk";

export type EventName =
  | "registered"
  | "anchor_active"
  | "bond_added"
  | "bond_withdrawn"
  | "awarded"
  | "paid"
  | "confirmed"
  | "released"
  | "disputed"
  | "resolved"
  | "refunded";

export interface ContractEvent {
  name: EventName;
  /** Second topic: the order id (order events) or the anchor address (anchor events). */
  subject: bigint | string;
  /** The event's data fields, decoded (i128/u64 -> bigint, Address -> string, BytesN -> Buffer). */
  data: Record<string, unknown>;
  ledger: number;
  /** Unix seconds when the ledger closed. */
  at: number;
  txHash: string;
  /** Unique, ordered id of the event. */
  id: string;
}

export interface EventCursor {
  /** Paging cursor returned by the last call; undefined before the first call. */
  cursor?: string;
  /** Ledger to start from on the first call (use DEPLOY_LEDGER). */
  startLedger: number;
}

/**
 * Fetch the next batch of events for a contract, oldest first, and return the cursor to
 * pass to the next call. Safe to call in a loop every few seconds.
 * If `startLedger` is older than what the RPC still keeps, it starts from the oldest
 * ledger available instead of failing.
 */
export async function fetchEvents(
  server: rpc.Server,
  contractId: string,
  from: EventCursor,
  limit = 200,
): Promise<{ events: ContractEvent[]; next: EventCursor }> {
  const filters = [{ type: "contract" as const, contractIds: [contractId] }];
  let res: rpc.Api.GetEventsResponse;
  try {
    res = from.cursor
      ? await server.getEvents({ filters, cursor: from.cursor, limit })
      : await server.getEvents({ filters, startLedger: from.startLedger, limit });
  } catch (e) {
    // "startLedger must be within the ledger range: A - B": retry from the oldest ledger kept.
    const m = String((e as Error).message ?? e).match(/ledger range:\s*(\d+)\s*-\s*(\d+)/);
    if (from.cursor || !m) throw e;
    const oldest = Number(m[1]);
    const latest = Number(m[2]);
    const start = Math.min(Math.max(from.startLedger, oldest), latest);
    res = await server.getEvents({ filters, startLedger: start, limit });
  }

  const events: ContractEvent[] = [];
  for (const ev of res.events) {
    try {
      const name = scValToNative(ev.topic[0]) as EventName;
      const subject = ev.topic[1] ? (scValToNative(ev.topic[1]) as bigint | string) : "";
      const data = (scValToNative(ev.value) ?? {}) as Record<string, unknown>;
      events.push({
        name,
        subject,
        data,
        ledger: ev.ledger,
        at: Math.floor(new Date(ev.ledgerClosedAt).getTime() / 1000),
        txHash: ev.txHash,
        id: ev.id,
      });
    } catch {
      // Not one of ours (unexpected shape): skip it.
    }
  }
  return { events, next: { cursor: res.cursor, startLedger: from.startLedger } };
}
