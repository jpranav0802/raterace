import { TESTNET } from "./constants";

const base = (explorerUrl?: string) => (explorerUrl || TESTNET.explorerUrl).replace(/\/$/, "");

export const explorerTx = (hash: string, explorerUrl?: string) => `${base(explorerUrl)}/tx/${hash}`;
export const explorerContract = (id: string, explorerUrl?: string) =>
  `${base(explorerUrl)}/contract/${id}`;
export const explorerAccount = (address: string, explorerUrl?: string) =>
  `${base(explorerUrl)}/account/${address}`;
