import { formatBps, formatMxn } from "@raterace/shared";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface RaceOffer {
  /** Stable id, e.g. the anchor name. */
  id: string;
  name: string;
  /** Amount the family receives, MXN units (7 decimals) as a string. */
  landedLocal: string;
  /** How far below the market rate this offer lands, after all fees. */
  markupBps: number;
  delivered: number;
  penalties: number;
}

interface RaceBoardProps {
  offers: RaceOffer[];
  /** What the family would receive at the market rate with no fees (MXN units). */
  marketLocal: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

/** The thin line under each offer shows the final stretch: 5% below market up to the market rate. */
const STRETCH_BPS = 500;

function position(markupBps: number) {
  return Math.min(1, Math.max(0.02, 1 - markupBps / STRETCH_BPS));
}

/**
 * The offers, best first. Each row is one provider; the thin line shows how close
 * its offer gets to the market rate. The line draws in once when offers arrive.
 */
export function RaceBoard({ offers, marketLocal, selectedId, onSelect }: RaceBoardProps) {
  const reduce = useReducedMotion();
  const ranked = [...offers].sort((a, b) =>
    BigInt(b.landedLocal) > BigInt(a.landedLocal) ? 1 : -1,
  );
  const bestId = ranked[0]?.id;

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Offers, best first"
        className="divide-y overflow-hidden rounded-xl border bg-card"
      >
        {ranked.map((o, i) => {
          const selected = o.id === selectedId;
          const best = o.id === bestId;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect?.(o.id)}
              className={cn(
                "block w-full px-5 py-4 text-left transition-colors",
                selected ? "bg-secondary" : "hover:bg-secondary/50",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-foreground" : "border-input",
                  )}
                >
                  {selected && <span className="size-2.5 rounded-full bg-foreground" />}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                  {o.name}
                  {best && <Badge variant="good">Best</Badge>}
                </span>
                <span
                  className={cn(
                    "money text-xl font-semibold tracking-tight",
                    best && "text-good",
                  )}
                >
                  {formatMxn(o.landedLocal)}
                </span>
              </div>

              <div className="mt-3 ml-8">
                <div className="relative h-0.5 rounded-full bg-border" aria-hidden="true">
                  <motion.div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      best ? "bg-good" : "bg-foreground/70",
                    )}
                    initial={reduce ? false : { width: "0%" }}
                    animate={{ width: `${position(o.markupBps) * 100}%` }}
                    transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.1 + i * 0.1 }}
                  />
                </div>
                <div className="mt-2 flex justify-between gap-3 text-[0.8rem] whitespace-nowrap text-muted-foreground">
                  <span className="money">{formatBps(o.markupBps)} below market</span>
                  <span className="money">
                    {o.delivered} delivered, {o.penalties}{" "}
                    {o.penalties === 1 ? "penalty" : "penalties"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[0.8rem] text-muted-foreground">
        Market rate today: <span className="money text-foreground">{formatMxn(marketLocal)}</span>.
        A full line means the offer matches it.
      </p>
    </div>
  );
}
