import { AccountRole, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import { MAX_FEE_BPS, MAX_MINT_BATCH, MAX_PRICE, MAX_SUPPLY, SLOT_HASHES, SYSTEM_PROGRAM } from "./constants.ts";

export const INSTRUCTION = {
  init: 0,
  mint: 1,
  transfer: 2,
  list: 3,
  buy: 4,
  reveal: 5,
  withdrawExcess: 6,
} as const;

export interface InitArgs {
  nonce: number;
  maxSupply: number;
  feeBps: number;
  mintPrice: bigint;
  provenance: Uint8Array;
  generatorHash: Uint8Array;
}

class Writer {
  buf: Uint8Array;
  view: DataView;
  off = 0;
  constructor(len: number) {
    this.buf = new Uint8Array(len);
    this.view = new DataView(this.buf.buffer);
  }
  u8(v: number) {
    this.view.setUint8(this.off, v);
    this.off += 1;
    return this;
  }
  u16(v: number) {
    this.view.setUint16(this.off, v, true);
    this.off += 2;
    return this;
  }
  u32(v: number) {
    this.view.setUint32(this.off, v, true);
    this.off += 4;
    return this;
  }
  u64(v: bigint) {
    this.view.setBigUint64(this.off, v, true);
    this.off += 8;
    return this;
  }
  bytes(b: Uint8Array) {
    this.buf.set(b, this.off);
    this.off += b.length;
    return this;
  }
}

function int(name: string, v: number, min: number, max: number) {
  if (!Number.isInteger(v) || v < min || v > max) throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${v}`);
}

function bytes32(name: string, b: Uint8Array) {
  if (b.length !== 32) throw new RangeError(`${name} must be 32 bytes, got ${b.length}`);
}

const signer = (s: TransactionSigner, writable: boolean) => ({
  address: s.address,
  role: writable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER,
  signer: s,
});
const w = (address: Address) => ({ address, role: AccountRole.WRITABLE });
const r = (address: Address) => ({ address, role: AccountRole.READONLY });

export function initIx(
  programId: Address,
  creator: TransactionSigner,
  collection: Address,
  treasury: Address,
  a: InitArgs,
): Instruction {
  int("nonce", a.nonce, 0, 0xffff_ffff);
  int("maxSupply", a.maxSupply, 1, MAX_SUPPLY);
  int("feeBps", a.feeBps, 0, MAX_FEE_BPS);
  if (a.mintPrice < 0n || a.mintPrice > 0xffff_ffff_ffff_ffffn) throw new RangeError(`mintPrice must be a u64, got ${a.mintPrice}`);
  bytes32("provenance", a.provenance);
  bytes32("generatorHash", a.generatorHash);
  const data = new Writer(81)
    .u8(INSTRUCTION.init)
    .u32(a.nonce)
    .u16(a.maxSupply)
    .u16(a.feeBps)
    .u64(a.mintPrice)
    .bytes(a.provenance)
    .bytes(a.generatorHash).buf;
  return {
    programAddress: programId,
    accounts: [signer(creator, true), w(collection), r(treasury), r(SYSTEM_PROGRAM)],
    data,
  };
}

export function mintIx(
  programId: Address,
  minter: TransactionSigner,
  collection: Address,
  creator: Address,
  count: number,
): Instruction {
  int("count", count, 1, MAX_MINT_BATCH);
  return {
    programAddress: programId,
    accounts: [signer(minter, true), w(collection), w(creator), r(SLOT_HASHES), r(SYSTEM_PROGRAM)],
    data: new Writer(2).u8(INSTRUCTION.mint).u8(count).buf,
  };
}

export function transferIx(
  programId: Address,
  owner: TransactionSigner,
  collection: Address,
  newOwner: Address,
  id: number,
): Instruction {
  int("id", id, 0, MAX_SUPPLY - 1);
  return {
    programAddress: programId,
    accounts: [signer(owner, false), w(collection), r(newOwner)],
    data: new Writer(3).u8(INSTRUCTION.transfer).u16(id).buf,
  };
}

export function listIx(
  programId: Address,
  owner: TransactionSigner,
  collection: Address,
  id: number,
  price: number,
): Instruction {
  int("id", id, 0, MAX_SUPPLY - 1);
  int("price", price, 0, MAX_PRICE);
  return {
    programAddress: programId,
    accounts: [signer(owner, false), w(collection)],
    data: new Writer(7).u8(INSTRUCTION.list).u16(id).u32(price).buf,
  };
}

export function buyIx(
  programId: Address,
  buyer: TransactionSigner,
  collection: Address,
  seller: Address,
  treasury: Address,
  id: number,
  maxPrice: number,
): Instruction {
  int("id", id, 0, MAX_SUPPLY - 1);
  int("maxPrice", maxPrice, 1, MAX_PRICE);
  return {
    programAddress: programId,
    accounts: [signer(buyer, true), w(collection), w(seller), w(treasury), r(SYSTEM_PROGRAM)],
    data: new Writer(7).u8(INSTRUCTION.buy).u16(id).u32(maxPrice).buf,
  };
}

export function revealIx(
  programId: Address,
  creator: TransactionSigner,
  collection: Address,
  secret: Uint8Array,
): Instruction {
  bytes32("secret", secret);
  return {
    programAddress: programId,
    accounts: [signer(creator, false), w(collection), r(SLOT_HASHES)],
    data: new Writer(33).u8(INSTRUCTION.reveal).bytes(secret).buf,
  };
}

export function withdrawExcessIx(programId: Address, creator: TransactionSigner, collection: Address): Instruction {
  return {
    programAddress: programId,
    accounts: [signer(creator, true), w(collection)],
    data: new Uint8Array([INSTRUCTION.withdrawExcess]),
  };
}
