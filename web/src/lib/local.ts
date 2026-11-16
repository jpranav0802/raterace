// Things this browser remembers for the person using it: saved recipients, past transfers
// and view preferences. Stored in localStorage (wrapped: it can be unavailable), never sent
// anywhere. Recipient details stay on this device; only their fingerprint goes on-chain.
import { useSyncExternalStore } from "react";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not fatal: it just won't be remembered.
  }
}

function store<T>(key: string, fallback: T) {
  let value = read<T>(key, fallback);
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      write(key, next);
      for (const l of listeners) l();
    },
    use(): T {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => {
            listeners.delete(l);
          };
        },
        () => value,
      );
    },
  };
}

// ---------- recipients ----------

export interface Recipient {
  id: string;
  name: string;
  clabe: string;
  country: string;
  lastSentAt: number;
}

export const recipients = store<Recipient[]>("raterace_recipients", []);

export function rememberRecipient(name: string, clabe: string, country: string) {
  const id = `${country}:${clabe}`;
  const rest = recipients.get().filter((r) => r.id !== id);
  recipients.set([{ id, name, clabe, country, lastSentAt: Date.now() }, ...rest].slice(0, 12));
}

// ---------- transfers ----------

export interface TransferRecord {
  orderId: string;
  hash: string;
  at: number;
  recipientName: string;
  country: string;
  currency: string;
  sendUsdc: string;
  landedLocal: string;
  provider: string;
  standIn?: string;
}

export const transfers = store<TransferRecord[]>("raterace_transfers", []);

export function rememberTransfer(t: TransferRecord) {
  transfers.set([t, ...transfers.get().filter((x) => x.orderId !== t.orderId)].slice(0, 50));
}

// ---------- preferences ----------

/** Show the "On Stellar" network view next to the app. */
export const networkView = store<boolean>("raterace_network_view", true);

/**
 * Sample contacts so the demo can be run without typing an account number. The CLABEs are
 * well-formed (real bank codes, valid check digit) but made up; they are labelled "Sample".
 */
export const SAMPLE_CONTACTS: Recipient[] = [
  { id: "sample:rosa", name: "Rosa Hernández", clabe: "012180015412378003", country: "mx", lastSentAt: 0 },
  { id: "sample:luis", name: "Luis García", clabe: "072180009873214008", country: "mx", lastSentAt: 0 },
  { id: "sample:maria", name: "María López", clabe: "014180065501939000", country: "mx", lastSentAt: 0 },
];

export const isSample = (r: Recipient) => r.id.startsWith("sample:");
