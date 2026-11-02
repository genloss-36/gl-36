import { getAddressDecoder, type Address } from "@solana/kit";
import {
  COLLECTION_TAG,
  FLAG_CLOSED,
  FLAG_SETTLED,
  HEADER_LEN,
  HEADER_OFFSET as O,
  LAYOUT_VERSION,
  SETTLE_DELAY,
  SLOT_LEN,
  SLOT_OFFSET,
} from "./constants.ts";

export interface Slot {
  id: number;
  owner: Address;
  price: number;
}

export interface CollectionHeader {
  bump: number;
  flags: number;
  maxSupply: number;
  minted: number;
  feeBps: number;
  nonce: number;
  mintPrice: bigint;
  creator: Address;
  treasury: Address;
  closeSlot: bigint;
  entropy: Uint8Array;
  generatorHash: Uint8Array;
}

export interface Collection extends CollectionHeader {
  slots: Slot[];
}

export type CollectionState = "open" | "closed" | "settled";

export const accountLength = (minted: number) => HEADER_LEN + minted * SLOT_LEN;

export const slotOffset = (id: number) => HEADER_LEN + id * SLOT_LEN;

const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

const key = (data: Uint8Array, off: number) => getAddressDecoder().decode(data.subarray(off, off + 32));

export function isCollectionAccount(data: Uint8Array): boolean {
  if (data.length < HEADER_LEN || data[O.tag] !== COLLECTION_TAG || data[O.version] !== LAYOUT_VERSION) return false;
  return data.length === accountLength(view(data).getUint16(O.minted, true));
}

export function decodeHeader(data: Uint8Array): CollectionHeader {
  if (data.length < HEADER_LEN || data[O.tag] !== COLLECTION_TAG || data[O.version] !== LAYOUT_VERSION) {
    throw new Error("not a GL-36 collection account");
  }
  const v = view(data);
  return {
    bump: data[O.bump],
    flags: data[O.flags],
    maxSupply: v.getUint16(O.maxSupply, true),
    minted: v.getUint16(O.minted, true),
    feeBps: v.getUint16(O.feeBps, true),
    nonce: v.getUint32(O.nonce, true),
    mintPrice: v.getBigUint64(O.mintPrice, true),
    creator: key(data, O.creator),
    treasury: key(data, O.treasury),
    closeSlot: v.getBigUint64(O.closeSlot, true),
    entropy: data.slice(O.entropy, O.entropy + 32),
    generatorHash: data.slice(O.generatorHash, O.generatorHash + 32),
  };
}

export function decodeSlot(bytes: Uint8Array, id: number): Slot {
  if (bytes.length < SLOT_LEN) throw new Error(`a slot is ${SLOT_LEN} bytes, got ${bytes.length}`);
  return {
    id,
    owner: key(bytes, SLOT_OFFSET.owner),
    price: view(bytes).getUint32(SLOT_OFFSET.price, true),
  };
}

export function decodeCollection(data: Uint8Array): Collection {
  const header = decodeHeader(data);
  if (data.length < accountLength(header.minted)) {
    throw new Error(`account holds ${data.length} bytes, ${accountLength(header.minted)} needed for ${header.minted} slots`);
  }
  const slots: Slot[] = [];
  for (let id = 0; id < header.minted; id++) {
    const o = slotOffset(id);
    slots.push(decodeSlot(data.subarray(o, o + SLOT_LEN), id));
  }
  return { ...header, slots };
}

export function collectionState(c: Pick<CollectionHeader, "flags">): CollectionState {
  if (c.flags & FLAG_SETTLED) return "settled";
  if (c.flags & FLAG_CLOSED) return "closed";
  return "open";
}

export const entropySlot = (c: Pick<CollectionHeader, "closeSlot">): bigint => c.closeSlot + SETTLE_DELAY;

export const listedSlots = (c: Pick<Collection, "slots">): Slot[] =>
  c.slots.filter((s) => s.price > 0).sort((a, b) => a.price - b.price || a.id - b.id);

export const slotsOwnedBy = (c: Pick<Collection, "slots">, owner: Address): Slot[] =>
  c.slots.filter((s) => s.owner === owner);
