// The family link: a private link the sender shares so the recipient can follow the transfer
// and say whether the money arrived. No account, no app, no wallet on the recipient's side.
import { hash } from "@stellar/stellar-sdk";
import { bytesToHex, type FamilyView } from "@raterace/shared";
import { config } from "./config";
import { demoKeypair } from "./wallet";

const key = (orderId: number) => `raterace_family_${config.rateraceContractId.slice(-6)}_${orderId}`;

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function familyUrl(orderId: number, token: string): string {
  return `${window.location.origin}/f/${orderId}#${token}`;
}

/**
 * Returns the family link for one of the sender's own orders, creating it on first use.
 * Creating it means: make a random secret, sign a statement with the sender's key so the
 * service knows the link is really the sender's, and register it. Returns null if the
 * order is not visible to the service yet (try again shortly).
 */
export async function ensureFamilyLink(orderId: number): Promise<string | null> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(key(orderId));
  } catch {
    // storage blocked: fall through and make a fresh link for this visit
  }
  const fresh = !token;
  token ??= randomToken();

  const tokenHash = bytesToHex(hash(Buffer.from(token, "utf8")));
  const message = Buffer.from(`raterace-family-link:${orderId}:${tokenHash}`);
  const signature = bytesToHex(demoKeypair().sign(message));

  const res = await fetch(`${config.indexerUrl}/family/${orderId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, signature }),
  });
  if (!res.ok) return null;
  if (fresh) {
    try {
      localStorage.setItem(key(orderId), token);
    } catch {
      // link still works for this visit
    }
  }
  return familyUrl(orderId, token);
}

export async function fetchFamilyView(orderId: number, token: string): Promise<FamilyView | "invalid"> {
  const res = await fetch(`${config.indexerUrl}/family/${orderId}?token=${encodeURIComponent(token)}`);
  if (res.status === 404) return "invalid";
  if (!res.ok) throw new Error("unreachable");
  return (await res.json()) as FamilyView;
}

export async function sendFamilyAnswer(orderId: number, token: string, arrived: boolean): Promise<void> {
  const res = await fetch(`${config.indexerUrl}/family/${orderId}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, arrived }),
  });
  if (!res.ok) throw new Error("failed");
}
