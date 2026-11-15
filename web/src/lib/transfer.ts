// What the Send page hands to the Quotes page. Owner: Abhiraj (#17, #18).
// Kept in navigation state and mirrored to sessionStorage so a reload of /quotes still works.
import type { RfqRequest, RfqResponse } from "@raterace/shared";

export interface PendingTransfer {
  request: RfqRequest;
  rfq: RfqResponse;
  /** sha256(JSON.stringify({ name, clabe })), hex. The raw details never leave the browser. */
  recipientHash: string;
  recipientName: string;
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
  const data = new TextEncoder().encode(JSON.stringify({ name, clabe }));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
