import mainnet from "@gl-36/deployments/mainnet.json";

export interface CollectionCfg {
  id: string;
  project: string;
  title: string;
  address: string;
  maxSupply: number;
  mintPrice: string;
}

export const CONFIG = mainnet;

export const PROJECT = "genloss";
export const COLLECTIONS: CollectionCfg[] = (CONFIG.collections as CollectionCfg[]).filter((c) => c.project === PROJECT);

export const DOCS_URL = "https://gl36.org";
export const CHAIN = "solana:mainnet";

const RPC_KEY = "genloss.rpc";

export function rpcUrl(): string {
  try {
    return localStorage.getItem(RPC_KEY) || CONFIG.rpc;
  } catch {
    return CONFIG.rpc;
  }
}

export function setRpcUrl(url: string) {
  try {
    if (url && url !== CONFIG.rpc) localStorage.setItem(RPC_KEY, url);
    else localStorage.removeItem(RPC_KEY);
  } catch {
  }
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}`;
