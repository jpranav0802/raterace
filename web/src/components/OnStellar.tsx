// "On Stellar, live": the machinery behind the simple app, shown as it happens.
// Desktop: a sticky column next to the app. Phone: a pill at the bottom that opens a sheet.
import { explorerTx } from "@raterace/shared";
import { ArrowUpRight, Check, ChevronDown, Loader2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { chainlog, useChainLog, type LogEntry } from "@/lib/chainlog";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";

function time(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

function Entry({ e }: { e: LogEntry }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative flex gap-3 pb-4 last:pb-0"
    >
      <span
        className={cn(
          "relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          e.status === "done" && "bg-good/15 text-good",
          e.status === "pending" && "bg-secondary text-muted-foreground",
          e.status === "failed" && "bg-bad/15 text-bad",
        )}
      >
        {e.status === "done" && <Check className="size-3" strokeWidth={3} />}
        {e.status === "pending" && <Loader2 className="size-3 animate-spin" />}
        {e.status === "failed" && <X className="size-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm leading-snug font-medium">{e.title}</p>
          <span className="money shrink-0 font-mono text-[0.7rem] text-muted-foreground">{time(e.at)}</span>
        </div>
        {e.detail && <p className="mt-0.5 font-mono text-[0.72rem] leading-relaxed break-words text-muted-foreground">{e.detail}</p>}
        {e.hash && (
          <a
            href={explorerTx(e.hash, config.explorerUrl)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-0.5 font-mono text-[0.72rem] text-foreground/80 underline decoration-muted-foreground/50 underline-offset-2 hover:text-foreground"
          >
            tx {e.hash.slice(0, 8)}…{e.hash.slice(-4)}
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
    </motion.li>
  );
}

function Feed({ entries }: { entries: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [entries.length]);
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Start a transfer. Every step the network takes shows up here, with a link to the public record.
      </p>
    );
  }
  return (
    <ol className="relative">
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-[9.5px] w-px bg-border" />
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <Entry key={e.id} e={e} />
        ))}
      </AnimatePresence>
      <div ref={end} />
    </ol>
  );
}

function Header({ entries }: { entries: LogEntry[] }) {
  const sponsored = entries.filter((e) => e.sponsored && e.status === "done").length;
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-good" />
          </span>
          On Stellar, live
        </p>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => chainlog.clear()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-secondary/60 px-3 py-2">
          <p className="text-[0.7rem] text-muted-foreground">Network fees you paid</p>
          <p className="money text-lg font-semibold text-good">$0.00</p>
        </div>
        <div className="rounded-lg bg-secondary/60 px-3 py-2">
          <p className="text-[0.7rem] text-muted-foreground">Transactions we sponsored</p>
          <p className="money text-lg font-semibold">{sponsored}</p>
        </div>
      </div>
    </div>
  );
}

/** Desktop column. */
export function OnStellarPanel() {
  const entries = useChainLog();
  return (
    <aside aria-label="What happened on Stellar" className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] flex-col rounded-xl border bg-card/60 p-5 lg:flex">
      <Header entries={entries} />
      <div className="mt-5 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        <Feed entries={entries} />
      </div>
    </aside>
  );
}

/** Phone: a pill that opens a bottom sheet. */
export function OnStellarSheet() {
  const entries = useChainLog();
  const [open, setOpen] = useState(false);
  const last = entries[entries.length - 1];
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-[28rem] items-center gap-3 rounded-full border bg-card/90 px-4 py-2.5 text-left shadow-2xl backdrop-blur"
      >
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-good" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {last ? last.title : "On Stellar, live"}
        </span>
        <span className="money shrink-0 text-xs text-muted-foreground">{entries.length} steps</span>
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-label="What happened on Stellar"
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border-t bg-card p-5"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="mx-auto -mt-2 mb-3 flex text-muted-foreground"
              >
                <ChevronDown className="size-5" />
              </button>
              <Header entries={entries} />
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
                <Feed entries={entries} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
