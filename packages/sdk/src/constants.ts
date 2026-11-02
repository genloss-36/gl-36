import type { Address } from "@solana/kit";

export const PROGRAM_ID = {
  mainnet: "GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb" as Address,
} as const;

export type Cluster = keyof typeof PROGRAM_ID;

export const SYSTEM_PROGRAM = "11111111111111111111111111111111" as Address;
export const SLOT_HASHES = "SysvarS1otHashes111111111111111111111111111" as Address;

export const COLLECTION_TAG = 1;
export const LAYOUT_VERSION = 1;

export const HEADER_LEN = 224;
export const SLOT_LEN = 36;
export const ACCOUNT_OVERHEAD = 128;

export const PRICE_UNIT = 1_000n;
export const MAX_PRICE = 0xffff_ffff;
export const MAX_SUPPLY = 0xffff;
export const MAX_MINT_BATCH = 10;
export const MAX_FEE_BPS = 1_000;

export const FLAG_SETTLED = 1;
export const FLAG_CLOSED = 2;

export const SETTLE_DELAY = 32n;

export const HEADER_OFFSET = {
  tag: 0,
  version: 1,
  bump: 2,
  flags: 3,
  maxSupply: 4,
  minted: 6,
  feeBps: 8,
  nonce: 12,
  mintPrice: 16,
  creator: 24,
  treasury: 56,
  closeSlot: 88,
  entropy: 152,
  generatorHash: 184,
} as const;

export const SLOT_OFFSET = {
  owner: 0,
  price: 32,
} as const;
