// Plain-language messages for contract error codes (docs/BUILD_PLAN.md section 4.6).
export { formatBps, formatLocal, formatMxn, formatUsd, fromUnits, toUnits } from "@raterace/shared";

const MESSAGES: Record<number, string> = {
  6: "New transfers are paused for a moment. Please try again shortly.",
  12: "This provider is paused.",
  14: "This provider can't cover this amount right now.",
  20: "This offer expired. Get new offers.",
  21: "This offer was already used. Get new offers.",
  22: "The market rate is unavailable. Try again in a minute.",
  23: "The market rate is unavailable. Try again in a minute.",
  24: "This offer is too far below the market rate.",
  25: "You reached your daily sending limit.",
  31: "This transfer has already moved on. Refreshing…",
  33: "The provider still has time to pay. Please wait for the deadline.",
  35: "The time to report a problem has passed.",
};

export function errorMessage(code?: number): string {
  if (code === undefined) return "Something went wrong. Please try again.";
  return MESSAGES[code] ?? `Something went wrong (code ${code}).`;
}
