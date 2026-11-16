// RateRace next to the real market, right now. Real providers' live quotes for the same
// amount (Wise's public comparison data), each checked with the contract's own markup
// formula against the same oracle price. Offers below the red line would be refused on-chain.
import { formatBps, formatMxn } from "@raterace/shared";
import { motion, useReducedMotion } from "motion/react";
import type { Benchmarks } from "@/lib/api";
import { cn } from "@/lib/utils";

const CAP_BPS = 300;

interface Row {
  key: string;
  name: string;
  sub?: string;
  received: number;
  /** Exact MXN units, for display. */
  units: string;
  markupBps: number;
  ours: boolean;
  passes: boolean;
}

function mxn(n: number) {
  return `MX$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RealMarket({
  data,
  ours,
}: {
  data: Benchmarks;
  /** The offer the sender picked in the race. */
  ours: { provider: string; landedLocal: string; markupBps: number };
}) {
  const reduce = useReducedMotion();
  const market = Number(data.marketLocal) / 1e7;
  const cap = market * (1 - CAP_BPS / 10_000);
  const oursNum = Number(ours.landedLocal) / 1e7;

  const rows: Row[] = [
    {
      key: "ours",
      name: `RateRace · ${ours.provider}`,
      sub: "your offer",
      received: oursNum,
      units: ours.landedLocal,
      markupBps: ours.markupBps,
      ours: true,
      passes: true,
    },
    ...data.providers.map((p) => ({
      key: p.name,
      name: p.name,
      sub: p.type === "bank" ? "bank" : undefined,
      received: Number(p.receivedLocal) / 1e7,
      units: p.receivedLocal,
      markupBps: p.markupBps,
      ours: false,
      passes: p.wouldPassCap,
    })),
  ].sort((a, b) => b.received - a.received);

  const real = data.providers.length;
  const beaten = data.providers.filter((p) => Number(p.receivedLocal) / 1e7 < oursNum).length;
  const rejected = data.providers.filter((p) => !p.wouldPassCap).length;
  const wu = data.providers.find((p) => /western union/i.test(p.name));
  const vsWu = wu ? oursNum - Number(wu.receivedLocal) / 1e7 : null;

  // Bar scale: a little below the lowest offer up to a little above the market / best offer.
  const lo = Math.min(...rows.map((r) => r.received), cap) * 0.995;
  const hi = Math.max(market, ...rows.map((r) => r.received)) * 1.002;
  const pct = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  const collected = data.providers.map((p) => p.collectedAt.slice(0, 10)).sort();
  const oldest = collected[0];

  return (
    <section aria-labelledby="real-market" className="rounded-xl border bg-card p-5">
      <h2 id="real-market" className="text-lg">
        Against real providers, right now
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Live prices for the same {mxnUsd(data.sendUsdc)} transfer, checked with the same rule the contract enforces.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <p className="money text-2xl font-semibold text-good">
            {beaten} of {real}
          </p>
          <p className="text-xs text-muted-foreground">real providers deliver less than {ours.provider}</p>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5">
          <p className="money text-2xl font-semibold text-bad">
            {rejected} of {real}
          </p>
          <p className="text-xs text-muted-foreground">would be refused by RateRace's 3% rule</p>
        </div>
      </div>
      {vsWu !== null && vsWu > 0 && (
        <p className="mt-3 text-sm">
          Your family gets <span className="money font-semibold text-good">{mxn(vsWu)} more</span> than with Western Union
          today.
        </p>
      )}

      <div className="relative mt-5">
        {/* Reference lines: the market rate and the 3% limit. */}
        <div className="pointer-events-none absolute inset-y-0 right-[6.1rem] left-[7.5rem] sm:left-[9rem]" aria-hidden="true">
          <div className="absolute inset-y-0 border-l-2 border-dashed border-foreground/60" style={{ left: pct(market) }}>
            <span className="absolute -top-5 -translate-x-1/2 text-[0.65rem] whitespace-nowrap text-foreground/80">
              market rate
            </span>
          </div>
          <div className="absolute inset-y-0 border-l-2 border-dashed border-bad/80" style={{ left: pct(cap) }}>
            <span className="absolute -top-5 -translate-x-1/2 text-[0.65rem] whitespace-nowrap text-bad">3% limit</span>
          </div>
        </div>

        <ol className="flex flex-col gap-1.5 pt-1">
          {rows.map((r, i) => (
            <li key={r.key} className={cn("flex items-center gap-2 rounded-md py-1", r.ours && "bg-good/10 ring-1 ring-good/40")}>
              <div className="w-[7rem] shrink-0 pl-2 sm:w-[8.5rem]">
                <p className={cn("truncate text-[0.8rem] leading-tight", r.ours ? "font-semibold text-good" : "text-foreground")}>
                  {r.name}
                </p>
                {r.sub && <p className="text-[0.65rem] leading-tight text-muted-foreground">{r.sub}</p>}
              </div>
              <div className="relative h-5 min-w-0 flex-1">
                <motion.div
                  className={cn(
                    "absolute inset-y-1 left-0 rounded-sm",
                    r.ours ? "bg-good" : r.passes ? "bg-foreground/35" : "bg-bad/45",
                  )}
                  initial={reduce ? false : { width: "0%" }}
                  animate={{ width: pct(r.received) }}
                  transition={{ duration: 0.8, delay: 0.05 * i, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
              <div className="w-[5.6rem] shrink-0 pr-2 text-right">
                <p className={cn("money text-[0.8rem] leading-tight font-medium", r.ours && "text-good")}>{formatMxn(r.units)}</p>
                <p className={cn("money text-[0.65rem] leading-tight", r.passes ? "text-muted-foreground" : "text-bad")}>
                  {r.markupBps < 0 ? "above market" : r.passes ? `${formatBps(r.markupBps)} below` : `${formatBps(r.markupBps)} · refused`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-4 text-[0.72rem] leading-relaxed text-muted-foreground">
        Market rate {formatMxn(data.marketLocal)} = 1 USD at {data.oracle.mxnPerUsd.toFixed(4)} MXN, the live mid-market rate our
        oracle publishes. Real quotes include each provider's fee and exchange-rate margin, from{" "}
        <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {data.source}
        </a>
        {oldest ? `, collected since ${oldest}` : ""}. RateRace providers in this demo are simulated test providers on the Stellar
        test network.
      </p>
    </section>
  );
}

function mxnUsd(sendUsdc: string) {
  return `$${(Number(sendUsdc) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
