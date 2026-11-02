import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";

export async function findCollection(programId: Address, creator: Address, nonce: number): Promise<[Address, number]> {
  if (!Number.isInteger(nonce) || nonce < 0 || nonce > 0xffff_ffff) {
    throw new RangeError(`nonce must be a u32, got ${nonce}`);
  }
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, nonce, true);
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [new TextEncoder().encode("col"), getAddressEncoder().encode(creator), n],
  });
  return [pda, bump];
}
