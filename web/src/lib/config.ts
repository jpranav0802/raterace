// Public settings only. Values come from VITE_* variables in the repo root .env.
import { PORTS, TESTNET } from "@raterace/shared";

const env = import.meta.env;

/**
 * When the app is opened from another device on the same Wi-Fi (http://192.168.x.x:5173),
 * "localhost" in a service URL would point at that device. Swap in the host the page came from.
 */
function reachable(url: string): string {
  const here = window.location.hostname;
  if (here === "localhost" || here === "127.0.0.1") return url;
  return url.replace("//localhost:", `//${here}:`).replace("//127.0.0.1:", `//${here}:`);
}

export const config = {
  rpcUrl: env.VITE_RPC_URL || TESTNET.rpcUrl,
  networkPassphrase: env.VITE_NETWORK_PASSPHRASE || TESTNET.networkPassphrase,
  explorerUrl: env.VITE_EXPLORER_URL || TESTNET.explorerUrl,
  routerUrl: reachable(env.VITE_ROUTER_URL || `http://localhost:${PORTS.router}`),
  indexerUrl: reachable(env.VITE_INDEXER_URL || `http://localhost:${PORTS.indexer}`),
  rateraceContractId: (env.VITE_RATERACE_CONTRACT_ID as string | undefined) || "",
};
