// "On-chain record": the public record behind the simple app, written as it happens.
// Every line comes from a real response (a transaction hash, a contract check, a signature
// verified against a registered key). Desktop: a column next to the app. Phone: a bottom sheet.
import { explorerTx } from "@raterace/shared";
import { ArrowUpRight, Check, ChevronDown, FileText, Loader2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { chainlog, useChainLog, type LogEntry } from "@/lib/chainlog";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";

/** What the record will contain, shown before the first transfer. */
const PREVIEW = [
  { title: "Account set up", detail: "Created on Stellar; network fees paid by RateRace" },
  { title: "Offers verified", detail: "Each provider's signature checked against its registered key" },
  { title: "Money in escrow", detail: "Held by the RateRace contract, not by a company" },
  { title: "Paid out", detail: "Provider confirms delivery; its deposit is released" },
];

function time(ms: number) {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

function Marker({ status, n }: { status: LogEntry["status"] | "preview"; n?: number }) {
  return (
    <span
      className={cn(
        "relative z-10 mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border bg-card",
        status === "done" && "border-foreground/30 text-foreground",
        status === "pending" && "border-border text-muted-foreground",
        status === "failed" && "border-bad/50 text-bad",
        status === "preview" && "border-muted-foreground/40 text-[0.6rem] text-muted-foreground",
      )}
    >
      {status === "done" && <Check className="size-2.5" strokeWidth={3} />}
      {status === "pending" && <Loader2 className="size-2.5 animate-spin" />}
      {status === "failed" && <X className="size-2.5" strokeWidth={3} />}
      {status === "preview" && n}
    </span>
  );
}

function Entry({ e }: { e: LogEntry }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="relative flex gap-3 pb-4 last:pb-0"
    >
      <Marker status={e.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn("text-[0.84rem] leading-snug", e.status === "failed" && "text-bad")}>{e.title}</p>
          <span className="money shrink-0 font-mono text-[0.68rem] text-muted-foreground">{time(e.at)}</span>
        </div>
        {e.detail && (
          <p className="mt-0.5 font-mono text-[0.7rem] leading-relaxed break-words text-muted-foreground">{e.detail}</p>
        )}
        {e.hash && (
          <a
            href={explorerTx(e.hash, config.explorerUrl)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-0.5 font-mono text-[0.7rem] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
          >
            {e.hash.slice(0, 10)}…{e.hash.slice(-6)}
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
      <div>
        <ol className="relative">
          <span aria-hidden="true" className="absolute top-2 bottom-2 left-[8.5px] w-px bg-border" />
          {PREVIEW.map((p, i) => (
            <li key={p.title} className="relative flex gap-3 pb-4 last:pb-0">
              <Marker status="preview" n={i + 1} />
              <div>
                <p className="text-[0.84rem] text-muted-foreground">{p.title}</p>
                <p className="mt-0.5 text-[0.72rem] text-muted-foreground/70">{p.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          Each step is recorded as it happens, with a link to its public record on Stellar Expert.
        </p>
      </div>
    );
  }
  return (
    <ol className="relative">
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-[8.5px] w-px bg-border" />
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium tracking-normal">On-chain record</h2>
          <span className="rounded border px-1.5 py-px font-mono text-[0.62rem] text-muted-foreground">testnet</span>
        </div>
        {entries.length > 0 && (
          <button type="button" onClick={() => chainlog.clear()} className="text-xs text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 divide-x rounded-lg border text-xs">
        <div className="px-3 py-2">
          <dt className="text-muted-foreground">Network fees you paid</dt>
          <dd className="money mt-0.5 text-sm font-medium">$0.00</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-muted-foreground">Sponsored by RateRace</dt>
          <dd className="money mt-0.5 text-sm font-medium">
            {sponsored} {sponsored === 1 ? "transaction" : "transactions"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** Desktop column. */
export function OnStellarPanel() {
  const entries = useChainLog();
  return (
    <aside
      aria-label="On-chain record"
      className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] flex-col rounded-2xl border bg-card p-5 lg:flex"
    >
      <Header entries={entries} />
      <div className="mt-5 -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        <Feed entries={entries} />
      </div>
    </aside>
  );
}

/** Phone: a bar at the bottom that opens a sheet. */
export function OnStellarSheet() {
  const entries = useChainLog();
  const [open, setOpen] = useState(false);
  const last = entries[entries.length - 1];
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-[28rem] items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 text-left shadow-xl backdrop-blur"
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm">{last ? last.title : "On-chain record"}</span>
        <span className="money shrink-0 text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "step" : "steps"}
        </span>
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
              aria-label="On-chain record"
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border-t bg-card p-5"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="mx-auto -mt-2 mb-3 flex text-muted-foreground">
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
