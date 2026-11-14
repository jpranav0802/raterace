// Contract helpers shared by the anchors, router, indexer and scripts.
// Import from "@raterace/shared/chain". Works in Node and in the browser.
import { Client as OracleClient } from "oracle-client";
import { Client as RateRaceClient, type Quote } from "raterace-client";
import { bytesToHex, hexToBytes } from "./format";
import type { QuoteJson } from "./types";

export { OracleClient, RateRaceClient };
export type { Quote };

export interface ChainOptions {
  rpcUrl: string;
  networkPassphrase: string;
  rateraceContractId: string;
  oracleContractId: string;
  /** Any funded account; used as the source for read-only simulations. */
  simulationAccount: string;
}

export function makeClients(o: ChainOptions) {
  const base = {
    rpcUrl: o.rpcUrl,
    networkPassphrase: o.networkPassphrase,
    publicKey: o.simulationAccount,
  };
  return {
    raterace: new RateRaceClient({ ...base, contractId: o.rateraceContractId }),
    oracle: new OracleClient({ ...base, contractId: o.oracleContractId }),
  };
}

/** JSON quote (hex, strings) -> the contract's Quote type (Buffer, bigint). */
export function toContractQuote(q: Omit<QuoteJson, "signature"> | QuoteJson): Quote {
  return {
    anchor: q.anchor,
    request_id: Buffer.from(hexToBytes(q.requestId)),
    corridor: q.corridor,
    asset_code: q.assetCode,
    send_usdc: BigInt(q.sendUsdc),
    landed_local: BigInt(q.landedLocal),
    expires_at: BigInt(q.expiresAt),
  };
}

/**
 * The 32 bytes an anchor signs for a quote. Always computed BY THE CONTRACT (simulated
 * `quote_digest` call), never re-encoded by hand, so JS and Rust agree byte for byte.
 */
export async function quoteDigest(raterace: RateRaceClient, quote: Quote): Promise<Buffer> {
  const tx = await raterace.quote_digest({ quote });
  return Buffer.from(tx.result);
}

/** Latest oracle price for a currency code, or null if the oracle has none. */
export async function oraclePrice(
  oracle: OracleClient,
  assetCode: string,
): Promise<{ price: bigint; timestamp: number } | null> {
  const tx = await oracle.lastprice({ asset: { tag: "Other", values: [assetCode] } });
  const p = tx.result;
  return p ? { price: BigInt(p.price), timestamp: Number(p.timestamp) } : null;
}

export { bytesToHex, hexToBytes };
