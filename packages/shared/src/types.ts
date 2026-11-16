// FROZEN JSON shapes: docs/BUILD_PLAN.md section 4.10.
// Amounts are strings of integer units (7 decimals). Bytes are lowercase hex. Times are unix seconds.

export interface QuoteJson {
  anchor: string; // G... anchor account
  anchorName: string; // "alpha"
  displayName: string; // "Alpha"
  requestId: string; // hex, 64 chars
  corridor: string; // "MX_SPEI"
  assetCode: string; // "MXN"
  sendUsdc: string;
  landedLocal: string; // what the family receives after all fees
  expiresAt: number;
  signature: string; // hex, 128 chars
  fees: { spreadBps: number; payoutFeeLocal: string };
}

export interface RankedQuote extends QuoteJson {
  markupBps: number; // vs oracle mid-rate, includes all fees
  reputation: { filled: number; disputed: number; slashed: number };
  valid: true;
}

export interface RfqRequest {
  corridor: string;
  assetCode: string;
  sendUsdc: string;
  sender: string;
  recipientCountry: string;
  method: string;
}

export interface RfqResponse {
  requestId: string;
  expiresAt: number;
  oracle: { price: string; timestamp: number; mxnPerUsd: number };
  onRampFeeUsd: string;
  quotes: RankedQuote[];
}

export interface SubmitResponse {
  hash: string;
  status: "SUCCESS" | "FAILED";
  explorerUrl: string;
  returnValue?: string;
  errorCode?: number;
}

export type OrderStatus = "Open" | "Paid" | "Disputed" | "Settled" | "Refunded" | "Slashed";

export interface OrderView {
  id: number;
  status: OrderStatus;
  sender: string;
  anchor: string;
  anchorName: string;
  sendUsdc: string;
  landedLocal: string;
  corridor: string;
  openedAt: number;
  payoutDeadline: number;
  challengeEnds: number;
  payoutRef: string | null;
  /** Set once the sender has been paid back: total returned and the penalty part of it (USDC units). */
  refund?: string;
  penalty?: string;
  txs: { event: string; hash: string; ledger: number; at: number }[];
}

export interface LeaderboardRow {
  anchor: string;
  name: string;
  displayName: string;
  active: boolean;
  bond: string;
  reserved: string;
  filled: number;
  disputed: number;
  slashed: number;
}

export interface AnchorInfo {
  name: string;
  displayName: string;
  address: string;
  signingKeyHex: string;
  corridors: string[];
  spreadBps: number;
  payoutFeeLocal: string;
}

/** deployments/testnet.json (public, no secrets). */
export interface Deployment {
  network: "testnet";
  deployedAt: string;
  deployLedger: number;
  contracts: { raterace: string; oracle: string; usdc: string };
  usdc: { code: string; issuer: string };
  accounts: { admin: string; sponsor: string; demoSender: string };
  anchors: {
    name: string;
    displayName: string;
    address: string;
    signingKeyHex: string;
    quoteUrl: string;
  }[];
}
