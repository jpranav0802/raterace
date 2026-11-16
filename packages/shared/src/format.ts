import { AMOUNT_DECIMALS } from "./constants";
import { corridorByCurrency } from "./corridors";

/** "200" or "200.5" -> 2000000000n / 2005000000n (7 decimals). Throws on bad input. */
export function toUnits(decimal: string, decimals: number = AMOUNT_DECIMALS): bigint {
  const s = decimal.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Invalid amount: "${decimal}"`);
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimals in "${decimal}"`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** 2005000000n -> "200.50". Rounds down to `places`. */
export function fromUnits(
  units: bigint | string,
  places = 2,
  decimals: number = AMOUNT_DECIMALS,
): string {
  let v = BigInt(units);
  const neg = v < 0n;
  if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").slice(0, places);
  return `${neg ? "-" : ""}${whole}${places > 0 ? "." + frac : ""}`;
}

function withCommas(decimal: string): string {
  const [whole, frac] = decimal.split(".");
  const w = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === undefined ? w : `${w}.${frac}`;
}

/** 2000000000n -> "$200.00" */
export function formatUsd(units: bigint | string): string {
  return `$${withCommas(fromUnits(units))}`;
}

/** 39370000000n, "MXN" -> "MX$3,937.00". An unknown currency prints its code: "XYZ 12.00". */
export function formatLocal(units: bigint | string, currency: string): string {
  const symbol = corridorByCurrency(currency)?.symbol ?? `${currency} `;
  return `${symbol}${withCommas(fromUnits(units))}`;
}

/** 39370000000n -> "MX$3,937.00" */
export function formatMxn(units: bigint | string): string {
  return formatLocal(units, "MXN");
}

/** 120 -> "1.20%" */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(hex)) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
