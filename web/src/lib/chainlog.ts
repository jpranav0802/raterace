// A live log of what actually happened on Stellar during this visit, for the "On Stellar"
// panel. Every entry comes from a real response (a transaction hash, a simulation result, a
// signature check the router did against the anchor's on-chain key). Nothing is invented.
import { useSyncExternalStore } from "react";

export type LogStatus = "pending" | "done" | "failed";

export interface LogEntry {
  id: number;
  /** ms since epoch */
  at: number;
  title: string;
  detail?: string;
  hash?: string;
  status: LogStatus;
  /** Sponsored transactions count towards "fees we paid for you". */
  sponsored?: boolean;
}

const KEY = "raterace_chainlog";
let entries: LogEntry[] = load();
let nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
const listeners = new Set<() => void>();

function load(): LogEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function emit() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries.slice(-60)));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export const chainlog = {
  add(e: Omit<LogEntry, "id" | "at" | "status"> & { status?: LogStatus }): number {
    const id = nextId++;
    entries = [...entries, { status: "done", ...e, id, at: Date.now() }];
    emit();
    return id;
  },
  start(title: string, detail?: string): number {
    return chainlog.add({ title, detail, status: "pending" });
  },
  update(id: number, patch: Partial<Omit<LogEntry, "id">>) {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    emit();
  },
  done(id: number, patch: Partial<Omit<LogEntry, "id" | "status">> = {}) {
    chainlog.update(id, { ...patch, status: "done" });
  },
  fail(id: number, detail?: string) {
    chainlog.update(id, { status: "failed", ...(detail ? { detail } : {}) });
  },
  clear() {
    entries = [];
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useChainLog(): LogEntry[] {
  return useSyncExternalStore(subscribe, () => entries);
}
