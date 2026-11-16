// Where you can send money. The list itself lives in @raterace/shared (the deploy script
// registers every corridor on-chain for the test anchors, and the contract refuses a
// corridor an anchor isn't registered for). This file adds what only the form needs:
// how the recipient's account is asked for and checked in each country.
//
// On testnet no bank payout happens in any country: the test anchors simulate it.
import { CORRIDORS as SHARED, type CorridorInfo } from "@raterace/shared";
import { bankName, clabeError } from "./clabe";

/** How one country's recipient account is asked for and checked. */
export interface AccountRule {
  /** Field label, e.g. "CLABE". */
  label: string;
  placeholder: string;
  /** Only digits may be typed. */
  digitsOnly: boolean;
  maxLength: number;
  /** A made-up but well-formed value for the "use a sample" link. */
  sample: string;
  /** null when valid, otherwise a plain-language problem. */
  error: (value: string) => string | null;
  /** Bank name read from the account number, where the format allows it. */
  detect?: (value: string) => string | null;
}

export interface Corridor extends CorridorInfo {
  /** On-chain corridor id (same as `id`). */
  corridor: string;
  account: AccountRule;
  live: boolean;
}

function digits(label: string, min: number, max: number, sample: string, placeholder?: string): AccountRule {
  const range = min === max ? `${min}` : `${min} to ${max}`;
  return {
    label,
    placeholder: placeholder ?? `${range} digits`,
    digitsOnly: true,
    maxLength: max,
    sample,
    error: (v) =>
      !v
        ? `Enter the ${label.toLowerCase()}.`
        : v.length < min || v.length > max
          ? `This should have ${range} digits. This one has ${v.length}.`
          : null,
  };
}

const ACCOUNTS: Record<string, AccountRule> = {
  mx: {
    label: "CLABE",
    placeholder: "18-digit bank account number",
    digitsOnly: true,
    maxLength: 18,
    sample: "012180015412378003",
    error: clabeError,
    detect: bankName,
  },
  in: {
    label: "UPI ID",
    placeholder: "name@bank",
    digitsOnly: false,
    maxLength: 80,
    sample: "priya.sharma@examplebank",
    error: (v) =>
      !v
        ? "Enter the UPI ID."
        : /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9]{1,}$/.test(v)
          ? null
          : "A UPI ID looks like name@bank.",
  },
  ph: digits("Account or wallet number", 10, 16, "001234567890"),
  br: {
    label: "PIX key",
    placeholder: "CPF, phone, email or random key",
    digitsOnly: false,
    maxLength: 77,
    sample: "ana.silva@example.com",
    error: (v) => (!v ? "Enter the PIX key." : v.trim().length < 8 ? "That PIX key looks too short." : null),
  },
  co: digits("Bank account number", 6, 20, "12345678901"),
  gt: digits("Bank account number", 6, 20, "3001234567"),
  do: digits("Bank account number", 6, 20, "7601234567"),
  ng: digits("Account number (NUBAN)", 10, 10, "0123456789", "10-digit account number"),
  vn: digits("Bank account number", 6, 19, "1023456789"),
};

export const SOURCE = { country: "us", countryName: "United States", currency: "USD" } as const;

export const CORRIDORS: Corridor[] = SHARED.map((c) => ({
  ...c,
  corridor: c.id,
  account: ACCOUNTS[c.country],
  live: true,
}));

export const DEFAULT_CORRIDOR = CORRIDORS[0];

export function corridorForCountry(country: string | undefined): Corridor {
  return CORRIDORS.find((c) => c.country === country) ?? DEFAULT_CORRIDOR;
}

/** "···8003", or "pr···@examplebank" for keys with an @. Never the full account. */
export function maskAccount(value: string): string {
  const at = value.indexOf("@");
  return at > 0 ? `${value.slice(0, 2)}···${value.slice(at)}` : `···${value.slice(-4)}`;
}

/** e.g. "BBVA México ···8003", "UPI pr···@examplebank". */
export function describeAccount(c: Corridor, value: string): string {
  return `${c.account.detect?.(value) ?? (c.country === "mx" ? "Bank" : c.method)} ${maskAccount(value)}`;
}
