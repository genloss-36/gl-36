import { getAddressEncoder, type Address } from "@solana/kit";
import { MAX_SUPPLY } from "./constants.ts";

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const buf = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let off = 0;
  for (const p of parts) {
    buf.set(p, off);
    off += p.length;
  }
  return new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buf));
}

export function provenanceOf(secret: Uint8Array): Promise<Uint8Array> {
  if (secret.length !== 32) throw new RangeError(`secret must be 32 bytes, got ${secret.length}`);
  return sha256(secret);
}

export interface TokenSeedArgs {
  domain: string;
  collection: Address;
  secret: Uint8Array;
  entropy: Uint8Array;
  id: number;
}

export function tokenSeed({ domain, collection, secret, entropy, id }: TokenSeedArgs): Promise<Uint8Array> {
  if (!Number.isInteger(id) || id < 0 || id >= MAX_SUPPLY) throw new RangeError(`id must be a u16 below ${MAX_SUPPLY}, got ${id}`);
  const idLe = new Uint8Array([id & 0xff, id >> 8]);
  return sha256(
    new TextEncoder().encode(domain),
    new Uint8Array(getAddressEncoder().encode(collection)),
    secret,
    entropy,
    idLe,
  );
}
