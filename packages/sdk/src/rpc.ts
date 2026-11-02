import {
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type Base58EncodedBytes,
  type Commitment,
  type GetAccountInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type GetProgramAccountsApi,
  type Rpc,
} from "@solana/kit";
import {
  decodeCollection,
  decodeHeader,
  decodeSlot,
  slotOffset,
  type Collection,
  type CollectionHeader,
  type Slot,
} from "./account.ts";
import { ACCOUNT_OVERHEAD, COLLECTION_TAG, HEADER_LEN, HEADER_OFFSET, LAYOUT_VERSION, SLOT_LEN } from "./constants.ts";

export interface FetchConfig {
  commitment?: Commitment;
  programId?: Address;
}

export interface FetchedCollection {
  address: Address;
  lamports: bigint;
  data: Uint8Array;
  collection: Collection;
}

const bytes = (base64: string) => new Uint8Array(getBase64Encoder().encode(base64));

function owned(owner: Address, programId: Address | undefined, address: Address) {
  if (programId !== undefined && owner !== programId) {
    throw new Error(`${address} is owned by ${owner}, not by the GL-36 program ${programId}`);
  }
}

export async function fetchCollection(
  rpc: Rpc<GetAccountInfoApi>,
  address: Address,
  config: FetchConfig = {},
): Promise<FetchedCollection | null> {
  const { value } = await rpc
    .getAccountInfo(address, { encoding: "base64", commitment: config.commitment ?? "confirmed" })
    .send();
  if (!value) return null;
  owned(value.owner, config.programId, address);
  const data = bytes(value.data[0]);
  return { address, lamports: BigInt(value.lamports), data, collection: decodeCollection(data) };
}

export async function fetchHeader(
  rpc: Rpc<GetAccountInfoApi>,
  address: Address,
  config: FetchConfig = {},
): Promise<CollectionHeader | null> {
  const { value } = await rpc
    .getAccountInfo(address, {
      encoding: "base64",
      commitment: config.commitment ?? "confirmed",
      dataSlice: { offset: 0, length: HEADER_LEN },
    })
    .send();
  if (!value) return null;
  owned(value.owner, config.programId, address);
  return decodeHeader(bytes(value.data[0]));
}

export async function fetchSlot(
  rpc: Rpc<GetAccountInfoApi>,
  address: Address,
  id: number,
  config: FetchConfig = {},
): Promise<Slot | null> {
  const { value } = await rpc
    .getAccountInfo(address, {
      encoding: "base64",
      commitment: config.commitment ?? "confirmed",
      dataSlice: { offset: slotOffset(id), length: SLOT_LEN },
    })
    .send();
  if (!value) return null;
  owned(value.owner, config.programId, address);
  const data = bytes(value.data[0]);
  return data.length < SLOT_LEN ? null : decodeSlot(data, id);
}

export interface FoundCollection {
  address: Address;
  header: CollectionHeader;
}

export async function findCollections(
  rpc: Rpc<GetProgramAccountsApi>,
  programId: Address,
  options: { creator?: Address; commitment?: Commitment } = {},
): Promise<FoundCollection[]> {
  const tagAndVersion = getBase58Decoder().decode(new Uint8Array([COLLECTION_TAG, LAYOUT_VERSION])) as Base58EncodedBytes;
  const filters = [
    { memcmp: { offset: 0n, bytes: tagAndVersion, encoding: "base58" as const } },
    ...(options.creator
      ? [{ memcmp: { offset: BigInt(HEADER_OFFSET.creator), bytes: options.creator as string as Base58EncodedBytes, encoding: "base58" as const } }]
      : []),
  ];
  const accounts = (await rpc
    .getProgramAccounts(programId, {
      encoding: "base64",
      commitment: options.commitment ?? "confirmed",
      dataSlice: { offset: 0, length: HEADER_LEN },
      filters,
    })
    .send()) as unknown as readonly { pubkey: Address; account: { data: readonly [string, string] } }[];
  return accounts.map(({ pubkey, account }) => ({ address: pubkey, header: decodeHeader(bytes(account.data[0])) }));
}

export async function getLamportsPerByte(rpc: Rpc<GetMinimumBalanceForRentExemptionApi>): Promise<bigint> {
  const min = await rpc.getMinimumBalanceForRentExemption(0n).send();
  return BigInt(min) / BigInt(ACCOUNT_OVERHEAD);
}

export const rentExemptMinimum = (dataLength: number, lamportsPerByte: bigint): bigint =>
  BigInt(ACCOUNT_OVERHEAD + dataLength) * lamportsPerByte;
