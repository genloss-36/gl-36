import devnet from "../data/devnet.json";

export const CONFIG = devnet;
export type CollectionCfg = (typeof devnet.collections)[number];

export const TESTNET = CONFIG.cluster !== "mainnet-beta";
export const COLLECTIONS: CollectionCfg[] = CONFIG.collections.filter((c) => TESTNET || !("testnetOnly" in c && c.testnetOnly));

export const DOCS_URL = "https://gl36.org";
export const CHAIN = TESTNET ? "solana:devnet" : "solana:mainnet";

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

const explorerCluster = TESTNET ? "?cluster=devnet" : "";
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${explorerCluster}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}${explorerCluster}`;
