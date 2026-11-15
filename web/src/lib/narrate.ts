// Turns real router/contract responses into "On Stellar" log lines.
import { formatBps, formatMxn } from "@raterace/shared";
import type { RfqWithAudit } from "./api";
import { chainlog } from "./chainlog";

const MAX_ORACLE_AGE_MIN = 10;

const REASON: Record<string, string> = {
  "no-quote": "no offer for this amount",
  mismatch: "offer didn't match the request, dropped",
  "bad-signature": "signature doesn't match its on-chain key, dropped",
  inactive: "provider is paused on-chain",
  "over-cap": "too far below the market rate, dropped",
  error: "didn't answer in time",
};

export function narrateRfq(rfq: RfqWithAudit) {
  const ageMin = Math.max(0, Math.round((Date.now() / 1000 - rfq.oracle.timestamp) / 60));
  chainlog.add({
    title: "Market rate read from the on-chain oracle",
    detail: `1 USD = ${rfq.oracle.mxnPerUsd.toFixed(4)} MXN · ${ageMin} min old (limit ${MAX_ORACLE_AGE_MIN})`,
  });
  const rows = rfq.audit ?? [];
  chainlog.add({
    title: `Asked ${rows.length || rfq.quotes.length} licensed providers for signed offers`,
    detail: "same request to everyone · 2 min to accept",
  });
  for (const a of rows) {
    const q = rfq.quotes.find((x) => x.anchorName === a.name);
    if (q) {
      chainlog.add({
        title: `${a.displayName} offers ${formatMxn(q.landedLocal)}`,
        detail: `signature ✓ against ${a.displayName}'s on-chain key · ${formatBps(q.markupBps)} below market · ${a.ms} ms`,
      });
    } else {
      chainlog.add({
        title: `${a.displayName}: ${REASON[a.outcome] ?? "no offer"}`,
        detail: a.markupBps !== undefined ? `${formatBps(a.markupBps)} below market · limit 3.00%` : undefined,
        status: "failed",
      });
    }
  }
}
