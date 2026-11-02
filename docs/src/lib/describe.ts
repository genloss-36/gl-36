import { PRICE_UNIT, type Collection } from "@gl-36/sdk";
import type { Hover } from "./bytefield";
import { hex, int, isZero, short, sol } from "./format";

export interface Part {
  k?: string;
  v: string;
  code?: boolean;
}

export function describe(h: Hover, col: Collection | null): Part[] {
  if (h.kind === "free") return [{ k: "slot", v: int(h.id) }, { v: "not minted" }];
  if (h.kind === "slot") {
    const s = col?.slots[h.id];
    const id = { k: "slot", v: int(h.id) };
    if (!s) return [id];
    const price = s.price ? `${sol(BigInt(s.price) * PRICE_UNIT)}\u00a0SOL` : "not listed";
    return [id, { k: "owner", v: short(s.owner), code: true }, { k: "price", v: price }];
  }
  const f = h.field;
  const range = f.len === 1 ? { k: "byte", v: String(f.off) } : { k: "bytes", v: `${f.off}–${f.off + f.len - 1}` };
  return col ? [range, { k: f.name, v: value(f.name, col), code: CODE.has(f.name) }] : [range, { v: f.name }];
}

const CODE = new Set(["creator", "treasury", "entropy", "generator_hash"]);

export function render(el: HTMLElement, parts: Part[]) {
  el.replaceChildren(
    ...parts.map((p) => {
      const part = document.createElement("span");
      part.className = "part";
      if (p.k) {
        const k = document.createElement("span");
        k.className = "k";
        k.textContent = p.k;
        part.append(k);
      }
      const v = document.createElement(p.code ? "code" : "span");
      v.className = "v";
      v.textContent = p.v;
      part.append(v);
      return part;
    }),
  );
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
    case "close_slot":
      return c.closeSlot ? int(c.closeSlot) : "0 (open)";
    case "entropy":
      return bytes(c.entropy);
    case "generator_hash":
      return bytes(c.generatorHash);
    default:
      return "zeros";
  }
}
