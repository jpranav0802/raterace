// The race. Each bidder runs toward the finish line: the market rate. The closer an offer
// gets to the market rate, the further it runs. Offers more than 3% below market are refused.
// When everyone has finished, the lanes re-rank and the winner lights up.
//
// Market mode: the bidders are real providers at their live public prices; each allowed price
// is signed and bonded on testnet by a test provider standing in (shown on the lane).
// Simulated mode: the bidders are the test providers with their own prices.
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

interface Lane {
  id: string;
  name: string;
  quote?: RankedQuote;
  audit?: AuditRow;
  markupBps: number;
  /** MXN, for the animation. */
  landed: number;
  /** Exact MXN units, for display. */
  units?: string;
}

/** Launch delay: real response time (x4) in simulated mode; a gentle stagger in market mode. */
function launchDelay(lane: Lane, index: number) {
  if (lane.audit?.live || lane.audit?.sim) return LAUNCH_BASE_MS + index * 120;
  return LAUNCH_BASE_MS + Math.min(1600, (lane.audit?.ms ?? 0) * 4);
}

const OUTCOME_TEXT: Record<AuditRow["outcome"], string> = {
  verified: "signed offer",
  "no-quote": "no offer",
  mismatch: "offer didn't match the request",
  "bad-signature": "signature didn't match its registered key",
  inactive: "provider is paused",
  "over-cap": "refused by the 3% rule",
  "no-bond": "no test provider had bond left to back it",
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

function LaneRow({
  lane,
  index,
  best,
  finished,
  selected,
  onSelect,
  runKey,
  marketNum,
  limitBps,
}: {
  lane: Lane;
  limitBps: number;
  index: number;
  best: boolean;
  finished: boolean;
  selected: boolean;
  onSelect?: () => void;
  runKey: number;
  marketNum: number;
}) {
  const reduce = useReducedMotion();
  const delay = launchDelay(lane, index);
  /** Selectable: a signed offer within the sender's own limit. */
  const valid = !!lane.quote && lane.markupBps <= limitBps;
  const beyondLimit = !!lane.quote && lane.markupBps > limitBps;
  const live = lane.audit?.live;
  const sim = lane.audit?.sim;
  const shown = useCountUp(lane.landed, marketNum * 0.9, delay, RUN_MS, runKey);
  const pos = position(lane.markupBps);
  const winner = finished && best;

  const amount =
    lane.landed > 0
      ? finished || lane.landed - shown < 0.005
        ? lane.units
          ? formatMxn(lane.units)
          : mxn(lane.landed)
        : mxn(shown)
      : "—";

  let detail: string;
  if (valid) detail = lane.markupBps < 0 ? "above the market rate" : `${formatBps(lane.markupBps)} below market`;
  else if (beyondLimit) detail = `${formatBps(lane.markupBps)} below market · beyond your ${formatBps(limitBps)} limit`;
  else if (lane.audit?.outcome === "over-cap") detail = `${formatBps(lane.markupBps)} below market · refused by the 3% rule`;
  else detail = lane.audit ? OUTCOME_TEXT[lane.audit.outcome] : "no offer";

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
        "relative block w-full overflow-hidden px-4 py-3 text-left transition-colors sm:px-5",
        valid ? (selected ? "bg-secondary" : "hover:bg-secondary/50") : "cursor-default",
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
            !valid ? "border-transparent" : selected ? "border-brand" : "border-input",
          )}
        >
          {selected && <span className="size-2.5 rounded-full bg-brand" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("font-medium", !valid && "text-muted-foreground")}>{lane.name}</span>
          {live?.type === "bank" && <span className="text-[0.7rem] text-muted-foreground">bank</span>}
          {sim && <span className="text-[0.7rem] text-muted-foreground">{sim.note}</span>}
          {winner && (
            <motion.span initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Badge variant="good" className="whitespace-nowrap">
                Best offer
              </Badge>
            </motion.span>
          )}
        </span>
        <span
          className={cn(
            "money shrink-0 text-lg font-semibold tracking-tight transition-colors duration-500 sm:text-xl",
            winner && "text-good",
            !valid && beyondLimit && "text-base font-medium text-muted-foreground sm:text-lg",
            !valid && !beyondLimit && "text-base font-medium text-bad/80 line-through decoration-1 sm:text-lg",
          )}
        >
          {amount}
        </span>
      </div>

      <div className="relative mt-2.5 ml-8">
        <div className="relative h-1.5 rounded-full bg-border/70" aria-hidden="true">
          <motion.div
            key={runKey}
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              beyondLimit ? "bg-muted-foreground/40" : !valid ? "bg-bad/60" : winner ? "bg-good" : "bg-gradient-to-r from-foreground/10 to-foreground/70",
            )}
            initial={reduce ? false : { width: "0%" }}
            animate={{ width: `${pos * 100}%` }}
            transition={{ duration: RUN_MS / 1000, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
          >
            <span
              className={cn(
                "absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rounded-full",
                beyondLimit
                  ? "bg-muted-foreground"
                  : !valid
                  ? "bg-bad"
                  : winner
                    ? "bg-good shadow-[0_0_16px_4px] shadow-good/60"
                    : "bg-foreground shadow-[0_0_12px_2px] shadow-foreground/40",
              )}
            />
          </motion.div>
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[0.76rem] text-muted-foreground">
          <span className={cn("money", !valid && !beyondLimit && "text-bad/90")}>{detail}</span>
          {valid && lane.audit && (
            <span className="money inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-good" />
              {lane.audit.standIn
                ? `signed & bonded by test anchor ${lane.audit.standIn.displayName}`
                : `signed · answered in ${lane.audit.ms} ms`}
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
  /** The sender's own limit: offers further below market than this can't be picked. */
  limitBps?: number;
}

export function RaceTrack({ quotes, audit, marketLocal, selectedId, onSelect, raceId, limitBps = 300 }: RaceTrackProps) {
  const reduce = useReducedMotion();
  const [runKey, setRunKey] = useState(0);
  const [finished, setFinished] = useState(!!reduce);

  const lanes: Lane[] = useMemo(() => {
    const byName = new Map(quotes.map((q) => [q.anchorName, q]));
    const rows = audit?.length ? audit : quotes.map((q) => ({ name: q.anchorName, displayName: q.displayName }) as AuditRow);
    const market = Number(marketLocal) / 1e7;
    return rows.map((a) => {
      const q = byName.get(a.name);
      const markupBps = q?.markupBps ?? a.markupBps ?? STRETCH_BPS;
      // A refused live price still shows what it would have delivered.
      const landed = q
        ? Number(BigInt(q.landedLocal)) / 1e7
        : a.live && a.markupBps !== undefined
          ? market * (1 - a.markupBps / 10_000)
          : 0;
      return {
        id: a.name,
        name: q?.displayName ?? a.displayName,
        quote: q,
        audit: audit?.length ? a : undefined,
        markupBps,
        landed,
        units: q?.landedLocal,
      };
    });
  }, [quotes, audit, marketLocal]);

  const market = lanes.some((l) => l.audit?.live || l.audit?.sim);
  const anchorsMode = lanes.some((l) => l.audit?.sim);
  const bestId = quotes[0]?.anchorName;
  const totalMs = Math.max(...lanes.map((l, i) => launchDelay(l, i))) + RUN_MS + 250;
  const slowestReal = Math.max(0, ...lanes.map((l) => l.audit?.ms ?? 0));

  useEffect(() => {
    if (reduce) return;
    setFinished(false);
    const t = setTimeout(() => setFinished(true), totalMs);
    return () => clearTimeout(t);
  }, [raceId, runKey, totalMs, reduce]);

  // While racing, lanes stay in a fixed order; at the finish they re-rank, best first, refused last.
  const ordered = finished
    ? [...lanes].sort((a, b) => (!!b.quote === !!a.quote ? b.landed - a.landed : a.quote ? -1 : 1))
    : lanes;

  const valid = lanes.filter((l) => l.quote && l.markupBps <= limitBps);
  const refused = lanes.filter((l) => l.audit?.outcome === "over-cap").length;
  const beyond = lanes.filter((l) => l.quote && l.markupBps > limitBps).length;
  const shownLanes = lanes.filter((l) => l.landed > 0);
  const spread =
    shownLanes.length > 1 ? Math.max(...shownLanes.map((l) => l.landed)) - Math.min(...shownLanes.map((l) => l.landed)) : 0;
  const marketNum = Number(marketLocal) / 1e7;

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {finished ? (
            <>
              <Check className="size-4 text-good" />
              {anchorsMode ? (
                <span>
                  <span className="text-foreground">{valid.length} offers within your limit</span>
                  {beyond > 0 && <span> · {beyond} beyond it</span>}
                </span>
              ) : market ? (
                <span>
                  <span className="text-foreground">{valid.length} allowed</span> ·{" "}
                  <span className="text-bad">{refused} refused by the 3% rule</span>
                </span>
              ) : (
                <>
                  {valid.length} signed offers
                  {slowestReal > 0 && <span className="money">in {(slowestReal / 1000).toFixed(2)} s</span>}
                </>
              )}
            </>
          ) : (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
              {anchorsMode ? `${lanes.length} Stellar anchors are bidding…` : market ? `${lanes.length} providers are bidding…` : "Providers are racing…"}
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

      <div role="radiogroup" aria-label="Offers, best first" className="divide-y overflow-hidden rounded-xl border bg-card">
        {ordered.map((lane) => (
          <LaneRow
            key={lane.id}
            lane={lane}
            index={lanes.indexOf(lane)}
            best={lane.id === bestId}
            finished={finished}
            selected={lane.id === selectedId}
            onSelect={() => lane.quote && lane.markupBps <= limitBps && onSelect?.(lane.id)}
            runKey={runKey}
            marketNum={marketNum}
            limitBps={limitBps}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 text-[0.8rem] text-muted-foreground">
        <span>
          Finish line = market rate: <span className="money text-foreground">{formatMxn(marketLocal)}</span>
        </span>
        {finished && spread > 0 && (
          <motion.span initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="money text-good">
            {anchorsMode
              ? `Best vs worst offer: ${mxn(spread)}`
              : market
                ? `Best vs worst provider today: ${mxn(spread)}`
                : `Competition is worth ${mxn(spread)} to your family`}
          </motion.span>
        )}
      </div>
    </div>
  );
}
