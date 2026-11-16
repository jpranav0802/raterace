// Public settings only. Values come from VITE_* variables in the repo root .env.
import { PORTS, TESTNET } from "@raterace/shared";

const env = import.meta.env;

/**
 * When the app is opened from another device (a phone on the same Wi-Fi, or through a public
 * tunnel), "localhost" in a service URL would point at that device. In that case go through
 * the web server instead, which forwards /_router and /_indexer (see vite.config.ts).
 * A real hosted URL (not localhost) is used as it is.
 */
function reachable(url: string, proxyPath: string): string {
  const here = window.location.hostname;
  if (here === "localhost" || here === "127.0.0.1") return url;
  if (/\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return `${window.location.origin}${proxyPath}`;
  return url;
}

export const config = {
  rpcUrl: env.VITE_RPC_URL || TESTNET.rpcUrl,
  networkPassphrase: env.VITE_NETWORK_PASSPHRASE || TESTNET.networkPassphrase,
  explorerUrl: env.VITE_EXPLORER_URL || TESTNET.explorerUrl,
  routerUrl: reachable(env.VITE_ROUTER_URL || `http://localhost:${PORTS.router}`, "/_router"),
  indexerUrl: reachable(env.VITE_INDEXER_URL || `http://localhost:${PORTS.indexer}`, "/_indexer"),
  rateraceContractId: (env.VITE_RATERACE_CONTRACT_ID as string | undefined) || "",
};
