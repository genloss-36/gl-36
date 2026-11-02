import devnet from "@gl36/deployments/devnet.json";

export const CLUSTER = devnet.cluster as "devnet" | "mainnet-beta";
export const RPC = devnet.rpc;
export const PROGRAM_ID = devnet.programId;
export const TESTNET = CLUSTER !== "mainnet-beta";

export interface Project {
  id: string;
  title: string;
  site: string;
}

export const PROJECTS: Record<string, Project> = Object.fromEntries(
  Object.entries(devnet.projects).map(([id, p]) => [id, { id, title: p.title, site: p.site }]),
);

export interface KnownCollection {
  id: string;
  project: string;
  title: string;
  address: string;
  maxSupply: number;
}

export const COLLECTIONS: KnownCollection[] = devnet.collections
  .filter((c) => TESTNET || !("testnetOnly" in c && c.testnetOnly))
  .map(({ id, project, title, address, maxSupply }) => ({ id, project, title, address, maxSupply }));

export const GENLOSS_URL = PROJECTS.genloss?.site ?? "https://genloss.gl36.org";

export const FEATURED = COLLECTIONS.find((c) => c.project === "genloss" && c.id === "genesis") ?? COLLECTIONS[0];

const explorerCluster = TESTNET ? `?cluster=${CLUSTER}` : "";
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}${explorerCluster}`;

export const RENT = { now: 5_080, afterCuts: 696 } as const;
export const ACCOUNT_OVERHEAD = 128;
