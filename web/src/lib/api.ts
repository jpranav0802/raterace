// Calls to the quote router (docs/BUILD_PLAN.md section 4.9). Owner: Abhiraj (#17).
import type { RfqRequest, RfqResponse, SubmitResponse } from "@raterace/shared";
import { config } from "./config";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.routerUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("We couldn't reach the service. Check your connection and try again.", 0);
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status);
  return json;
}

/** Optional extra on the router's /rfq response: what happened with each provider. */
export interface AuditRow {
  name: string;
  displayName: string;
  /** How long the provider took to answer, ms. */
  ms: number;
  outcome: "verified" | "no-quote" | "mismatch" | "bad-signature" | "inactive" | "over-cap" | "error";
  markupBps?: number;
}
export type RfqWithAudit = RfqResponse & { audit?: AuditRow[] };

export interface Market {
  price: string;
  timestamp: number;
  mxnPerUsd: number;
  ageS: number;
}

export const api = {
  health: () => call<{ ok: boolean; usdc: { code: string; issuer: string } }>("/health"),
  market: () => call<Market>("/market"),
  fund: (publicKey: string) => call<{ ok: boolean; existed?: boolean; hash?: string }>("/onboard/fund", { publicKey }),
  usdc: (publicKey: string) => call<{ ok: boolean; hash?: string }>("/onboard/usdc", { publicKey }),
  rfq: (req: RfqRequest) => call<RfqWithAudit>("/rfq", req),
  submit: (xdr: string) => call<SubmitResponse>("/submit", { xdr }),
};
