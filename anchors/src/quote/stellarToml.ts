// SEP-1 Stellar Info File for the mock anchors. Owner: Avani.
//
// Real Stellar anchors publish /.well-known/stellar.toml so wallets and other services can
// discover them: which accounts they control, which key they sign with, and where their
// SEP-38 quote server lives. Each mock anchor serves its own file, so the RateRace demo
// discovers providers the same way it would discover real ones.
// Spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md

export interface StellarTomlInput {
  displayName: string;
  networkPassphrase: string;
  /** The anchor's Stellar account (G...). Receives USDC when it marks an order paid. */
  account?: string;
  /** The anchor's quote-signing key as a Stellar public key (G...). */
  signingKey?: string;
  /** Base URL of this anchor's SEP-38 quote server (POST /quote lives here). */
  quoteServer: string;
  usdcIssuer?: string;
}

/** TOML basic string: same escaping rules as JSON for the characters we use. */
const str = (s: string) => JSON.stringify(s);

export function renderStellarToml(i: StellarTomlInput): string {
  const lines: string[] = [
    `# SEP-1 Stellar Info File for ${i.displayName}, a MOCK payout provider (anchor)`,
    `# in the RateRace demo on Stellar testnet. Not a real company; prices are made up.`,
    ``,
    `NETWORK_PASSPHRASE = ${str(i.networkPassphrase)}`,
  ];
  if (i.account) lines.push(`ACCOUNTS = [${str(i.account)}]`);
  if (i.signingKey) {
    lines.push(
      ``,
      `# The key this anchor's server signs with. In RateRace it signs SEP-38 quotes: its raw`,
      `# 32 bytes are the signing_key registered for this anchor in the RateRace contract,`,
      `# so anyone can check that a quote really came from the domain that published this file.`,
      `SIGNING_KEY = ${str(i.signingKey)}`,
    );
  }
  lines.push(
    ``,
    `# SEP-38 quote server: POST /quote returns a firm, signed quote for the amount the`,
    `# recipient receives after all fees (RateRace extension: "raterace" field).`,
    `ANCHOR_QUOTE_SERVER = ${str(i.quoteServer)}`,
    ``,
    `[DOCUMENTATION]`,
    `ORG_NAME = ${str(`${i.displayName} (RateRace demo anchor)`)}`,
    `ORG_DESCRIPTION = ${str(
      "Mock licensed payout provider used to demonstrate RateRace remittance auctions on Stellar testnet.",
    )}`,
    `ORG_URL = ${str("https://github.com/jpranav0802/raterace")}`,
  );
  if (i.usdcIssuer) {
    lines.push(
      ``,
      `[[CURRENCIES]]`,
      `code = "USDC"`,
      `issuer = ${str(i.usdcIssuer)}`,
      `status = "test"`,
      `is_asset_anchored = false`,
      `desc = ${str("Test USDC issued for the RateRace demo; used for escrow, bonds and settlement.")}`,
    );
  }
  return lines.join("\n") + "\n";
}
