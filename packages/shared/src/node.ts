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
