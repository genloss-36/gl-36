export interface Field {
  name: string;
  off: number;
  len: number;
  type: string;
  note: string;
}

export const HEADER: Field[] = [
  { name: "tag", off: 0, len: 1, type: "u8", note: "Always 0x01: marks a collection account." },
  { name: "version", off: 1, len: 1, type: "u8", note: "Layout version, currently 1." },
  { name: "bump", off: 2, len: 1, type: "u8", note: "Bump of the collection PDA." },
  { name: "flags", off: 3, len: 1, type: "u8", note: "bit 0 revealed, bit 1 closed (entropy set)." },
  { name: "max_supply", off: 4, len: 2, type: "u16", note: "Lowered to minted when reveal closes the mint." },
  { name: "minted", off: 6, len: 2, type: "u16", note: "Number of slots that follow the header." },
  { name: "fee_bps", off: 8, len: 2, type: "u16", note: "Market fee in basis points, at most 1000." },
  { name: "reserved", off: 10, len: 2, type: "—", note: "Zero." },
  { name: "nonce", off: 12, len: 4, type: "u32", note: "Third PDA seed; lets one creator run many collections." },
  { name: "mint_price", off: 16, len: 8, type: "u64", note: "Lamports per token paid to the creator. May be 0." },
  { name: "creator", off: 24, len: 32, type: "Address", note: "Receives mint proceeds; signs reveal and withdraw_excess." },
  { name: "treasury", off: 56, len: 32, type: "Address", note: "Receives the market fee." },
  { name: "provenance", off: 88, len: 32, type: "[u8; 32]", note: "sha256(secret), fixed at init." },
  { name: "secret", off: 120, len: 32, type: "[u8; 32]", note: "Zero until reveal." },
  { name: "entropy", off: 152, len: 32, type: "[u8; 32]", note: "Latest SlotHashes entry when the mint closes." },
  { name: "generator_hash", off: 184, len: 32, type: "[u8; 32]", note: "sha256 of the generator bundle." },
  { name: "reserved", off: 216, len: 8, type: "—", note: "Zero." },
];

export const SLOT: Field[] = [
  { name: "owner", off: 0, len: 32, type: "Address", note: "Current owner of the token." },
  { name: "price", off: 32, len: 4, type: "u32", note: "Ask in units of 1,000 lamports. 0 means not listed." },
];

export const HEADER_LEN = 224;
export const SLOT_LEN = 36;

export function headerField(offset: number): Field | undefined {
  return HEADER.find((f) => offset >= f.off && offset < f.off + f.len);
}
