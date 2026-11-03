import mainnet from "@gl-36/deployments/mainnet.json";

export const CLUSTER = mainnet.cluster;
export const RPC = mainnet.rpc;
export const PROGRAM_ID = mainnet.programId;

export interface Project {
  id: string;
  title: string;
  site: string;
}

export const PROJECTS: Record<string, Project> = Object.fromEntries(
  Object.entries(mainnet.projects).map(([id, p]) => [id, { id, title: p.title, site: p.site }]),
);

export interface KnownCollection {
  id: string;
  project: string;
  title: string;
  address: string;
  maxSupply: number;
}

export const COLLECTIONS: KnownCollection[] = (mainnet.collections as KnownCollection[]).map(
  ({ id, project, title, address, maxSupply }) => ({ id, project, title, address, maxSupply }),
);

export const GENLOSS_URL = PROJECTS.genloss?.site ?? "https://genloss.gl36.org";

export const FEATURED: KnownCollection | undefined =
  COLLECTIONS.find((c) => c.project === "genloss" && c.id === "genesis") ?? COLLECTIONS[0];

export const explorerAddress = (a: string) => `https://solscan.io/account/${a}`;

export const X = { handle: "gl36protocol", url: "https://x.com/gl36protocol" } as const;

export const RENT = { now: 5_080, afterCuts: 696 } as const;
export const ACCOUNT_OVERHEAD = 128;
