// The race. Each provider launches when its signed offer actually arrived (the router's
// measured response time, slowed down so the eye can follow) and runs toward the finish
// line: the market rate. The closer an offer gets to the market rate, the further it runs.
// When everyone has finished, the lanes re-rank and the winner lights up.
import { formatBps, formatMxn, type RankedQuote } from "@raterace/shared";
import { Check, RotateCcw, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { AuditRow } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The track shows the last 5% before the market rate. */
const STRETCH_BPS = 500;
const RUN_MS = 1700;
const LAUNCH_BASE_MS = 300;

function position(markupBps: number) {
  return Math.min(1, Math.max(0.03, 1 - markupBps / STRETCH_BPS));
}

/** Real response time -> launch delay on screen (x4, capped so a slow anchor doesn't stall the show). */
function launchDelay(ms: number) {
  return LAUNCH_BASE_MS + Math.min(1600, ms * 4);
}

const OUTCOME_TEXT: Record<AuditRow["outcome"], string> = {
  verified: "signed offer",
  "no-quote": "no offer",
  mismatch: "offer didn't match the request",
  "bad-signature": "signature didn't match its registered key",
  inactive: "provider is paused",
  "over-cap": "over the 3% limit, disqualified",
  error: "didn't answer in time",
};

function useCountUp(target: number, from: number, delay: number, duration: number, runKey: number) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : from);
  useEffect(() => {
    if (reduce) {
      setValue(target);
      return;
    }
    setValue(from);
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, from, delay, duration, runKey, reduce]);
  return value;
}

function mxn(n: number) {
  return `MX$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Lane {
  id: string;
  name: string;
  quote?: RankedQuote;
  audit?: AuditRow;
  markupBps: number;
  landed: number;
}

function LaneRow({
  lane,
  best,
  finished,
  selected,
  onSelect,
  runKey,
  marketNum,
}: {
  lane: Lane;
  best: boolean;
  finished: boolean;
  selected: boolean;
  onSelect?: () => void;
  runKey: number;
  marketNum: number;
}) {
  const reduce = useReducedMotion();
  const delay = launchDelay(lane.audit?.ms ?? 0);
  const valid = !!lane.quote;
  const shown = useCountUp(lane.landed, marketNum * 0.9, delay, RUN_MS, runKey);
  const pos = position(lane.markupBps);
  const winner = finished && best;

  return (
    <motion.button
      layout={!reduce}
      transition={{ layout: { type: "spring", stiffness: 260, damping: 30 } }}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!valid}
      onClick={onSelect}
      className={cn(
        "relative block w-full overflow-hidden px-5 py-4 text-left transition-colors",
        valid ? (selected ? "bg-secondary" : "hover:bg-secondary/50") : "cursor-default opacity-60",
      )}
    >
      {winner && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-good/15 via-good/5 to-transparent"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        />
      )}
      <div className="relative flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-foreground" : "border-input",
          )}
        >
          {selected && <span className="size-2.5 rounded-full bg-foreground" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          {lane.name}
          {winner && (
            <motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Badge variant="good" className="whitespace-nowrap">Best offer</Badge>
            </motion.span>
          )}
        </span>
        <span
          className={cn(
            "money shrink-0 text-lg font-semibold tracking-tight transition-colors duration-500 sm:text-xl",
            winner && "text-good",
            !valid && "text-bad line-through decoration-2",
          )}
        >
          {valid
            ? finished || lane.landed - shown < 0.005
              ? formatMxn(lane.quote!.landedLocal)
              : mxn(shown)
            : "—"}
        </span>
      </div>

      <div className="relative mt-3 ml-8">
        <div className="relative h-1.5 rounded-full bg-border/70" aria-hidden="true">
          <motion.div
            key={runKey}
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              !valid ? "bg-bad/70" : winner ? "bg-good" : "bg-gradient-to-r from-foreground/10 to-foreground/70",
            )}
            initial={reduce ? false : { width: "0%" }}
            animate={{ width: `${pos * 100}%` }}
            transition={{ duration: RUN_MS / 1000, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
          >
            <span
              className={cn(
                "absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rounded-full",
                !valid ? "bg-bad" : winner ? "bg-good shadow-[0_0_16px_4px] shadow-good/60" : "bg-foreground shadow-[0_0_12px_2px] shadow-foreground/40",
              )}
            />
          </motion.div>
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[0.78rem] text-muted-foreground">
          <span className={cn("money", !valid && "text-bad")}>
            {valid
              ? `${formatBps(lane.markupBps)} below market`
              : lane.audit
                ? OUTCOME_TEXT[lane.audit.outcome]
                : "no offer"}
          </span>
          {lane.audit && (
            <span className="money inline-flex items-center gap-1">
              {valid && <ShieldCheck className="size-3.5 text-good" />}
              {valid ? `signed · answered in ${lane.audit.ms} ms` : `${lane.audit.ms} ms`}
            </span>
          )}
          {lane.quote && !lane.audit && (
            <span className="money">
              {lane.quote.reputation.filled} delivered, {lane.quote.reputation.slashed} penalties
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

interface RaceTrackProps {
  quotes: RankedQuote[];
  audit?: AuditRow[];
  /** MXN units at the market rate with no fees. */
  marketLocal: bigint;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Change to restart the race (e.g. new offers). */
  raceId: string;
}

export function RaceTrack({ quotes, audit, marketLocal, selectedId, onSelect, raceId }: RaceTrackProps) {
  const reduce = useReducedMotion();
  const [runKey, setRunKey] = useState(0);
  const [finished, setFinished] = useState(!!reduce);

  const lanes: Lane[] = useMemo(() => {
    const byName = new Map(quotes.map((q) => [q.anchorName, q]));
    const rows = audit?.length ? audit : quotes.map((q) => ({ name: q.anchorName, displayName: q.displayName }) as AuditRow);
    return rows.map((a) => {
      const q = byName.get(a.name);
      const markupBps = q?.markupBps ?? a.markupBps ?? STRETCH_BPS;
      return {
        id: a.name,
        name: q?.displayName ?? a.displayName,
        quote: q,
        audit: audit?.length ? a : undefined,
        markupBps,
        landed: q ? Number(BigInt(q.landedLocal)) / 1e7 : 0,
      };
    });
  }, [quotes, audit]);

  const bestId = quotes[0]?.anchorName;
  const totalMs = Math.max(...lanes.map((l) => launchDelay(l.audit?.ms ?? 0))) + RUN_MS + 250;
  const slowestReal = Math.max(0, ...lanes.map((l) => l.audit?.ms ?? 0));

  useEffect(() => {
    if (reduce) return;
    setFinished(false);
    const t = setTimeout(() => setFinished(true), totalMs);
    return () => clearTimeout(t);
  }, [raceId, runKey, totalMs, reduce]);

  // While racing, lanes stay in a fixed order; at the finish they re-rank, best first.
  const ordered = finished
    ? [...lanes].sort((a, b) => (a.quote && b.quote ? b.landed - a.landed : a.quote ? -1 : b.quote ? 1 : 0))
    : lanes;

  const valid = lanes.filter((l) => l.quote);
  const spread = valid.length > 1 ? Math.max(...valid.map((l) => l.landed)) - Math.min(...valid.map((l) => l.landed)) : 0;
  const marketNum = Number(marketLocal) / 1e7;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {finished ? (
            <>
              <Check className="size-4 text-good" />
              {valid.length} signed offers
              {slowestReal > 0 && <span className="money">in {(slowestReal / 1000).toFixed(2)} s</span>}
            </>
          ) : (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-70" />
                <span className="relative inline-flex size-2 rounded-full bg-good" />
              </span>
              Providers are racing…
            </>
          )}
        </span>
        {finished && !reduce && (
          <button
            type="button"
            onClick={() => setRunKey((k) => k + 1)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" /> Replay
          </button>
        )}
      </div>

      <div className="relative">
        <div role="radiogroup" aria-label="Offers, best first" className="divide-y overflow-hidden rounded-xl border bg-card">
          {ordered.map((lane) => (
            <LaneRow
              key={lane.id}
              lane={lane}
              best={lane.id === bestId}
              finished={finished}
              selected={lane.id === selectedId}
              onSelect={() => lane.quote && onSelect?.(lane.id)}
              runKey={runKey}
              marketNum={marketNum}
            />
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 text-[0.8rem] text-muted-foreground">
        <span>
          Finish line = market rate: <span className="money text-foreground">{formatMxn(marketLocal)}</span>
        </span>
        {finished && spread > 0 && (
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="money text-good"
          >
            Competition is worth {mxn(spread)} to your family
          </motion.span>
        )}
      </div>
    </div>
  );
}
