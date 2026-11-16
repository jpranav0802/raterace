// The three mock anchors. Owner: Pranav (issue #12).
// These are stand-ins for licensed Stellar anchors; their prices are made up for the demo.
import { toUnits, type AnchorName } from "@raterace/shared";

export interface AnchorProfile {
  name: AnchorName;
  displayName: string;
  /** Margin the anchor takes on the exchange rate, in basis points. */
  spreadBps: number;
  /** Flat fee for the bank payout, in MXN units (7 decimals). Scaled for other currencies (scaleFee). */
  payoutFeeLocal: bigint;
}

// At 20 MXN per USD, $200 lands as: Gamma MX$3,966, Alpha MX$3,937, Beta MX$3,923.
// Gamma quotes best but never pays (see payout/worker.ts): it drives the refund + penalty demo.
export const PROFILES: AnchorProfile[] = [
  { name: "alpha", displayName: "Alpha", spreadBps: 120, payoutFeeLocal: toUnits("15") },
  { name: "beta", displayName: "Beta", spreadBps: 80, payoutFeeLocal: toUnits("45") },
  { name: "gamma", displayName: "Gamma", spreadBps: 60, payoutFeeLocal: toUnits("10") },
];
