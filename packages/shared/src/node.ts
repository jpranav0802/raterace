// Node-only helpers. Never import this file from the web app.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PORTS, TESTNET } from "./constants";
import type { Deployment } from "./types";

/** Absolute path of the repo root (the folder with the root package.json). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

let loaded = false;
function loadDotenv() {
  if (loaded) return;
  dotenv.config({ path: resolve(REPO_ROOT, ".env"), quiet: true });
  loaded = true;
  fillPublicValuesFromDeployment();
}

/**
 * A host (Render) only gets the secrets typed into its dashboard, not the .env file. Every
 * PUBLIC value the services need (contract IDs, account addresses, the deploy ledger) is
 * also in the committed deployments/testnet.json, so fill in whichever of those are missing.
 * Values already set (from .env or the host) always win. No secret is ever read from here.
 */
function fillPublicValuesFromDeployment() {
  const p = resolve(REPO_ROOT, "deployments/testnet.json");
  if (!existsSync(p)) return;
  let d: Deployment;
  try {
    d = JSON.parse(readFileSync(p, "utf8")) as Deployment;
  } catch {
    return;
  }
  const values: Record<string, string | undefined> = {
    RATERACE_CONTRACT_ID: d.contracts?.raterace,
    ORACLE_CONTRACT_ID: d.contracts?.oracle,
    USDC_CONTRACT_ID: d.contracts?.usdc,
    USDC_CODE: d.usdc?.code,
    USDC_ISSUER_PUBLIC: d.usdc?.issuer,
    DEPLOY_LEDGER: d.deployLedger ? String(d.deployLedger) : undefined,
    ADMIN_PUBLIC: d.accounts?.admin,
    SPONSOR_PUBLIC: d.accounts?.sponsor,
    DEMO_SENDER_PUBLIC: d.accounts?.demoSender,
  };
  for (const a of d.anchors ?? []) values[`${a.name.toUpperCase()}_PUBLIC`] = a.address;
  for (const [key, value] of Object.entries(values)) {
    if (value && !process.env[key]) process.env[key] = value;
  }
}

/** Read an env variable from the root .env; throws a clear error if missing. */
export function requireEnv(name: string): string {
  loadDotenv();
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Get the current .env from Pranav (or run "npm run deploy") and put it in the repo root.`,
    );
  }
  return v;
}

export function optionalEnv(name: string, fallback = ""): string {
  loadDotenv();
  return process.env[name] || fallback;
}

/** Network + service settings with safe testnet defaults (works without a .env). */
export function loadConfig() {
  loadDotenv();
  return {
    rpcUrl: optionalEnv("RPC_URL", TESTNET.rpcUrl),
    horizonUrl: optionalEnv("HORIZON_URL", TESTNET.horizonUrl),
    networkPassphrase: optionalEnv("NETWORK_PASSPHRASE", TESTNET.networkPassphrase),
    explorerUrl: optionalEnv("EXPLORER_URL", TESTNET.explorerUrl),
    routerUrl: optionalEnv("ROUTER_URL", `http://localhost:${PORTS.router}`),
    indexerUrl: optionalEnv("INDEXER_URL", `http://localhost:${PORTS.indexer}`),
    rateraceContractId: optionalEnv("RATERACE_CONTRACT_ID"),
    oracleContractId: optionalEnv("ORACLE_CONTRACT_ID"),
    usdcContractId: optionalEnv("USDC_CONTRACT_ID"),
    deployLedger: Number(optionalEnv("DEPLOY_LEDGER", "0")),
  };
}

/** deployments/testnet.json, or null before the first deploy. */
export function loadDeployment(): Deployment | null {
  const p = resolve(REPO_ROOT, "deployments/testnet.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Deployment;
}
