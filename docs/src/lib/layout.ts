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
  { name: "flags", off: 3, len: 1, type: "u8", note: "bit 0 settled (entropy set), bit 1 closed." },
  { name: "max_supply", off: 4, len: 2, type: "u16", note: "Lowered to minted when the creator closes the mint early." },
  { name: "minted", off: 6, len: 2, type: "u16", note: "Number of slots that follow the header." },
  { name: "fee_bps", off: 8, len: 2, type: "u16", note: "Market fee in basis points, at most 1000." },
  { name: "reserved", off: 10, len: 2, type: "—", note: "Zero." },
  { name: "nonce", off: 12, len: 4, type: "u32", note: "Third PDA seed; lets one creator run many collections." },
  { name: "mint_price", off: 16, len: 8, type: "u64", note: "Lamports per token paid to the creator. May be 0." },
  { name: "creator", off: 24, len: 32, type: "Address", note: "Receives mint proceeds; signs close and withdraw_excess." },
  { name: "treasury", off: 56, len: 32, type: "Address", note: "Receives the market fee." },
  { name: "close_slot", off: 88, len: 8, type: "u64", note: "Slot in which the mint closed or was re-armed. Zero while open." },
  { name: "reserved", off: 96, len: 56, type: "—", note: "Zero." },
  { name: "entropy", off: 152, len: 32, type: "[u8; 32]", note: "Hash of the first slot at or after close_slot + 32. Zero until settle." },
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
