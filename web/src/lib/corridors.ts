// Where you can send money. Only corridors registered on-chain (the contract checks the
// anchor's corridors) are live; the rest are shown as coming soon, never as working.
export interface Corridor {
  /** ISO country code, lowercase (also used for the flag image). */
  country: string;
  countryName: string;
  currency: string;
  /** On-chain corridor id, when live. */
  corridor?: string;
  method?: string;
  methodLabel?: string;
  live: boolean;
}

export const SOURCE = { country: "us", countryName: "United States", currency: "USD" } as const;

export const CORRIDORS: Corridor[] = [
  {
    country: "mx",
    countryName: "Mexico",
    currency: "MXN",
    corridor: "MX_SPEI",
    method: "SPEI",
    methodLabel: "Bank deposit (SPEI)",
    live: true,
  },
  { country: "ph", countryName: "Philippines", currency: "PHP", live: false },
  { country: "in", countryName: "India", currency: "INR", live: false },
  { country: "gt", countryName: "Guatemala", currency: "GTQ", live: false },
  { country: "co", countryName: "Colombia", currency: "COP", live: false },
  { country: "do", countryName: "Dominican Republic", currency: "DOP", live: false },
  { country: "br", countryName: "Brazil", currency: "BRL", live: false },
  { country: "ng", countryName: "Nigeria", currency: "NGN", live: false },
  { country: "vn", countryName: "Vietnam", currency: "VND", live: false },
];

export const DEFAULT_CORRIDOR = CORRIDORS[0];
