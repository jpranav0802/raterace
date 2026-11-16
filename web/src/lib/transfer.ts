// What the Send page hands to the Quotes page. Owner: Abhiraj (#17, #18).
// Kept in navigation state and mirrored to sessionStorage so a reload of /quotes still works.
import { hash } from "@stellar/stellar-sdk";
import { bytesToHex } from "@raterace/shared";
import type { RfqRequestWithMode, RfqWithAudit } from "./api";

export interface PendingTransfer {
  request: RfqRequestWithMode;
  rfq: RfqWithAudit;
  /** sha256(JSON.stringify({ name, clabe })), hex. The raw details never leave the browser. */
  recipientHash: string;
  recipientName: string;
  /** e.g. "BBVA México ···0008" (never the full account number). */
  recipientBank?: string;
  country?: string;
  countryName?: string;
  currency?: string;
}

const KEY = "raterace_pending_transfer";

export function savePending(t: PendingTransfer) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // Navigation state still carries it.
  }
}

export function loadPending(): PendingTransfer | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingTransfer) : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export async function recipientHash(name: string, clabe: string): Promise<string> {
  // Uses the Stellar SDK's sha256 rather than crypto.subtle, which browsers only provide on
  // https or localhost: the app must also work when opened from a phone over plain http.
  return bytesToHex(hash(Buffer.from(JSON.stringify({ name, clabe }), "utf8")));
}
