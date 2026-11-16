// The corridors RateRace can send to. One table, used by the deploy script, the oracle
// keeper, the mock anchors, the router and the web app.
//
// What is real and what is not, on testnet:
//   - `id` is registered on-chain for every mock anchor, and the contract refuses a quote
//     for a corridor the anchor isn't registered for.
//   - `currency` is the oracle asset code the contract checks the price against.
//   - `method` names the country's real payment rail, but no bank payout happens here:
//     the mock anchors only simulate it.
export interface CorridorInfo {
  /** On-chain corridor id (a Soroban Symbol). */
  id: string;
  /** ISO 3166 country code, lowercase. */
  country: string;
  countryName: string;
  /** ISO 4217 code, also the oracle asset code. */
  currency: string;
  /** Printed in front of amounts, e.g. "MX$". */
  symbol: string;
  method: string;
  methodLabel: string;
  /**
   * The mock anchors' flat payout fees are defined in pesos. This scales them to a
   * similar value in this currency (roughly: units of this currency per 1 MXN).
   */
  feeScale: number;
  /**
   * Units per 1 USD, used only if no live rate source can be reached. From
   * open.er-api.com, 16 Nov 2026 00:02 UTC. The oracle keeper replaces it with a live rate.
   */
  fallbackPerUsd: number;
  /** Recipient messages (share text) are written in Spanish for these. */
  spanish: boolean;
}

export const CORRIDORS: CorridorInfo[] = [
  { id: "MX_SPEI", country: "mx", countryName: "Mexico", currency: "MXN", symbol: "MX$", method: "SPEI", methodLabel: "Bank deposit (SPEI)", feeScale: 1, fallbackPerUsd: 18.544914, spanish: true },
  { id: "IN_UPI", country: "in", countryName: "India", currency: "INR", symbol: "₹", method: "UPI", methodLabel: "Bank account (UPI)", feeScale: 5, fallbackPerUsd: 94.399626, spanish: false },
  { id: "PH_INSTAPAY", country: "ph", countryName: "Philippines", currency: "PHP", symbol: "₱", method: "InstaPay", methodLabel: "Bank or e-wallet (InstaPay)", feeScale: 3.5, fallbackPerUsd: 63.910763, spanish: false },
  { id: "BR_PIX", country: "br", countryName: "Brazil", currency: "BRL", symbol: "R$", method: "PIX", methodLabel: "Bank account (PIX)", feeScale: 0.3, fallbackPerUsd: 5.663557, spanish: false },
  { id: "CO_BANK", country: "co", countryName: "Colombia", currency: "COP", symbol: "COL$", method: "bank transfer", methodLabel: "Bank deposit", feeScale: 180, fallbackPerUsd: 3316.635822, spanish: true },
  { id: "GT_BANK", country: "gt", countryName: "Guatemala", currency: "GTQ", symbol: "Q", method: "bank transfer", methodLabel: "Bank deposit", feeScale: 0.4, fallbackPerUsd: 7.652174, spanish: true },
  { id: "DO_BANK", country: "do", countryName: "Dominican Republic", currency: "DOP", symbol: "RD$", method: "bank transfer", methodLabel: "Bank deposit", feeScale: 3.3, fallbackPerUsd: 60.832855, spanish: true },
  { id: "NG_NIP", country: "ng", countryName: "Nigeria", currency: "NGN", symbol: "₦", method: "NIP", methodLabel: "Bank deposit (NIP)", feeScale: 75, fallbackPerUsd: 1352.107942, spanish: false },
  { id: "VN_NAPAS", country: "vn", countryName: "Vietnam", currency: "VND", symbol: "₫", method: "NAPAS 247", methodLabel: "Bank deposit (NAPAS 247)", feeScale: 1400, fallbackPerUsd: 25715.743135, spanish: false },
];

export const CORRIDOR_IDS = CORRIDORS.map((c) => c.id);

export function corridorById(id: string): CorridorInfo | undefined {
  return CORRIDORS.find((c) => c.id === id);
}

export function corridorByCurrency(currency: string): CorridorInfo | undefined {
  return CORRIDORS.find((c) => c.currency === currency);
}

/** Currency code for an on-chain corridor id; MXN if the id is unknown (older orders). */
export function currencyOf(corridorId: string | undefined): string {
  return (corridorId && corridorById(corridorId)?.currency) || "MXN";
}

/** A fee defined in pesos (7-decimal units), scaled to a similar value in `currency`. */
export function scaleFee(feeMxnUnits: bigint, currency: string): bigint {
  const scale = corridorByCurrency(currency)?.feeScale ?? 1;
  return (feeMxnUnits * BigInt(Math.round(scale * 100))) / 100n;
}

/** Fallback oracle price: USD per 1 unit of `currency`, 14 decimals. */
export function fallbackOraclePrice(currency: string): bigint | null {
  const c = corridorByCurrency(currency);
  return c ? BigInt(Math.round(1e14 / c.fallbackPerUsd)) : null;
}
