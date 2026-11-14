// Public settings only. Values come from VITE_* variables in the repo root .env.
import { PORTS, TESTNET } from "@raterace/shared";

const env = import.meta.env;

export const config = {
  rpcUrl: env.VITE_RPC_URL || TESTNET.rpcUrl,
  networkPassphrase: env.VITE_NETWORK_PASSPHRASE || TESTNET.networkPassphrase,
  explorerUrl: env.VITE_EXPLORER_URL || TESTNET.explorerUrl,
  routerUrl: env.VITE_ROUTER_URL || `http://localhost:${PORTS.router}`,
  indexerUrl: env.VITE_INDEXER_URL || `http://localhost:${PORTS.indexer}`,
  rateraceContractId: (env.VITE_RATERACE_CONTRACT_ID as string | undefined) || "",
};
