// FROZEN: docs/BUILD_PLAN.md section 4.10.
export const PORTS = {
  web: 5173,
  router: 8787,
  indexer: 8790,
  alpha: 8801,
  beta: 8802,
  gamma: 8803,
} as const;

export const ANCHOR_NAMES = ["alpha", "beta", "gamma"] as const;
export type AnchorName = (typeof ANCHOR_NAMES)[number];

export const CORRIDOR_MX_SPEI = "MX_SPEI";
export const ASSET_MXN = "MXN";

/** USDC and MXN amounts use 7 decimals on-chain. */
export const AMOUNT_DECIMALS = 7;
/** Oracle prices use 14 decimals (USD per 1 unit of local currency). */
export const ORACLE_DECIMALS = 14;

export const TESTNET = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  explorerUrl: "https://stellar.expert/explorer/testnet",
  friendbotUrl: "https://friendbot.stellar.org",
} as const;

/** Contract error codes. FROZEN: must match contracts/raterace/src/errors.rs. */
export const CONTRACT_ERRORS: Record<number, string> = {
  1: "AlreadyInitialized",
  2: "NotInitialized",
  3: "InvalidConfig",
  4: "InvalidAmount",
  5: "Overflow",
  10: "AnchorExists",
  11: "AnchorNotFound",
  12: "AnchorInactive",
  13: "CorridorNotAllowed",
  14: "InsufficientBond",
  15: "NotOrderAnchor",
  20: "QuoteExpired",
  21: "RequestIdUsed",
  22: "OracleUnavailable",
  23: "OracleStale",
  24: "MarkupTooHigh",
  25: "DailyCapExceeded",
  30: "OrderNotFound",
  31: "WrongStatus",
  32: "DeadlinePassed",
  33: "DeadlineNotPassed",
  34: "ChallengeWindowOpen",
  35: "ChallengeWindowClosed",
};
