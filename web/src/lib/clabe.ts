// CLABE: Mexico's 18-digit standardised bank account number.
// Digits 1-3 are the bank code, digit 18 is a check digit (weights 3, 7, 1 repeating).

const BANKS: Record<string, string> = {
  "002": "Citibanamex",
  "006": "Bancomext",
  "012": "BBVA México",
  "014": "Santander",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "044": "Scotiabank",
  "058": "Banregio",
  "072": "Banorte",
  "127": "Banco Azteca",
  "137": "BanCoppel",
  "646": "STP",
};

export function bankName(clabe: string): string | null {
  return clabe.length >= 3 ? (BANKS[clabe.slice(0, 3)] ?? null) : null;
}

export function checkDigit(first17: string): number {
  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (Number(first17[i]) * weights[i % 3]) % 10;
  return (10 - (sum % 10)) % 10;
}

/** null when valid, otherwise a plain-language problem. */
export function clabeError(value: string): string | null {
  if (!value) return "Enter the 18-digit CLABE.";
  if (!/^\d+$/.test(value)) return "A CLABE has only digits.";
  if (value.length !== 18) return `A CLABE has 18 digits. This one has ${value.length}.`;
  if (checkDigit(value.slice(0, 17)) !== Number(value[17])) return "This CLABE doesn't look right. Check the last digit.";
  return null;
}

export function maskClabe(clabe: string) {
  return `···${clabe.slice(-4)}`;
}
