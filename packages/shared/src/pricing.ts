// Pricing maths shared by the anchors, the router and the web app.
// Everything is integer maths on bigint, in on-chain units, and matches the contract:
//   amounts: 7 decimals (USDC and local currency)   oracle price: USD per 1 local unit, 14 decimals
import { ORACLE_DECIMALS } from "./constants";

const BPS = 10_000n;
const PRICE_SCALE = 10n ** BigInt(ORACLE_DECIMALS);

/** Local currency you get for `sendUsdc` at the oracle rate with no fees at all. */
export function marketLocal(sendUsdc: bigint, price: bigint): bigint {
  return (sendUsdc * PRICE_SCALE) / price;
}

/** What the family receives: market amount, minus the provider's rate margin, minus the payout fee. */
export function landedLocal(
  sendUsdc: bigint,
  price: bigint,
  spreadBps: number,
  payoutFeeLocal: bigint,
): bigint {
  const afterSpread = (marketLocal(sendUsdc, price) * (BPS - BigInt(spreadBps))) / BPS;
  return afterSpread - payoutFeeLocal;
}

/**
 * How far below the market rate an offer lands, in basis points, all fees included.
 * Same formula as the contract's `open_order` markup check. Can be negative (better than market).
 */
export function markupBps(sendUsdc: bigint, landed: bigint, price: bigint): number {
  const landedUsd = (landed * price) / PRICE_SCALE;
  return Number(((sendUsdc - landedUsd) * BPS) / sendUsdc);
}

/** Local units per 1 USD as a plain number, for display only (e.g. 20.0 MXN per USD). */
export function localPerUsd(price: bigint): number {
  return Number(PRICE_SCALE) / Number(price);
}
