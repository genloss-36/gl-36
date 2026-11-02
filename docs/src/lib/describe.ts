import { PRICE_UNIT, type Collection } from "@gl36/sdk";
import type { Hover } from "./bytefield";
import { hex, int, isZero, short, sol } from "./format";

export function describe(h: Hover, col: Collection | null): string {
  if (h.kind === "free") return `Token ${int(h.id)} isn’t minted yet. Minting it adds this row.`;
  if (h.kind === "slot") {
    const s = col?.slots[h.id];
    if (!s) return `Token ${int(h.id)}`;
    const price = s.price ? `listed at ${sol(BigInt(s.price) * PRICE_UNIT)}\u00a0SOL` : "not listed";
    return `Token ${int(h.id)}, owned by ${short(s.owner)}, ${price}.`;
  }
  const f = h.field;
  const range = f.len === 1 ? `byte ${f.off}` : `bytes ${f.off}–${f.off + f.len - 1}`;
  return `Header ${range}: ${f.name}${col ? ` = ${value(f.name, col)}` : ""}`;
}

function value(name: string, c: Collection): string {
  const bytes = (b: Uint8Array) => (isZero(b) ? "zeros" : `${hex(b).slice(0, 12)}…`);
  switch (name) {
    case "tag":
      return "0x01";
    case "version":
      return "1";
    case "bump":
      return String(c.bump);
    case "flags":
      return `0b${c.flags.toString(2).padStart(2, "0")}`;
    case "max_supply":
      return int(c.maxSupply);
    case "minted":
      return int(c.minted);
    case "fee_bps":
      return `${c.feeBps} (${c.feeBps / 100}%)`;
    case "nonce":
      return String(c.nonce);
    case "mint_price":
      return `${sol(c.mintPrice)}\u00a0SOL`;
    case "creator":
      return short(c.creator);
    case "treasury":
      return short(c.treasury);
    case "provenance":
      return bytes(c.provenance);
    case "secret":
      return bytes(c.secret);
    case "entropy":
      return bytes(c.entropy);
    case "generator_hash":
      return bytes(c.generatorHash);
    default:
      return "zeros";
  }
}
