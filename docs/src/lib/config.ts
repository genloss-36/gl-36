import devnet from "@devnet";

export const CLUSTER = devnet.cluster as "devnet" | "mainnet-beta";
export const RPC = devnet.rpc;
export const PROGRAM_ID = devnet.programId;
export const TESTNET = CLUSTER !== "mainnet-beta";

export interface KnownCollection {
  id: string;
  title: string;
  address: string;
  maxSupply: number;
}

export const COLLECTIONS: KnownCollection[] = devnet.collections
  .filter((c) => TESTNET || !("testnetOnly" in c && c.testnetOnly))
  .map(({ id, title, address, maxSupply }) => ({ id, title, address, maxSupply }));

export const GENLOSS_URL = "https://genloss.gl36.org";

export const FEATURED = COLLECTIONS.find((c) => c.id === "genesis") ?? COLLECTIONS[0];

const explorerCluster = TESTNET ? `?cluster=${CLUSTER}` : "";
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}${explorerCluster}`;

export const RENT = { now: 5_080, afterCuts: 696 } as const;
export const ACCOUNT_OVERHEAD = 128;
