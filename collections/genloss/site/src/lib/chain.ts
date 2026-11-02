import { address, createSolanaRpc, getAddressEncoder, mainnet, type Address } from "@solana/kit";
import { FLAG_REVEALED, decodeCollection } from "@gl36/sdk";
import { rpcUrl } from "./config";
import { $balance, $chain, $chainError, $collectionId, $wallet, collectionCfg } from "./store";
import { loadGen, type Traits } from "./generator";

const connect = (url: string) => createSolanaRpc(mainnet(url));
let cached: { url: string; rpc: ReturnType<typeof connect> } | undefined;
export function rpc() {
  const url = rpcUrl();
  if (cached?.url !== url) cached = { url, rpc: connect(url) };
  return cached.rpc;
}

function b64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let inflight: Promise<void> | null = null;

export function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const cfg = collectionCfg();
    if (cfg) {
      try {
        const { value } = await rpc().getAccountInfo(address(cfg.address), { encoding: "base64", commitment: "confirmed" }).send();
        if (!value) throw new Error("Collection account not found on this cluster");
        const col = decodeCollection(b64(value.data[0]));
        if ($collectionId.get() !== cfg.id) return;
        $chain.set({ cfgId: cfg.id, col, lamports: BigInt(value.lamports), revealed: (col.flags & FLAG_REVEALED) !== 0, fetchedAt: Date.now() });
        $chainError.set(null);
      } catch (e) {
        $chainError.set(e instanceof Error ? e.message : String(e));
      }
    }
    const w = $wallet.get();
    if (w) {
      try {
        $balance.set(BigInt((await rpc().getBalance(address(w.address), { commitment: "confirmed" }).send()).value));
      } catch {}
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

let timer: ReturnType<typeof setInterval> | undefined;
export function startPolling() {
  if (timer) return;
  refresh();
  timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 12_000);
  $collectionId.listen(() => { $chain.set(null); seeds.clear(); refresh(); });
  $wallet.listen(() => { $balance.set(null); refresh(); });
}

const seeds = new Map<string, Uint8Array>();

export async function seedFor(id: number): Promise<Uint8Array | null> {
  const s = $chain.get();
  if (!s || !s.revealed) return null;
  const key = `${s.cfgId}:${id}`;
  const hit = seeds.get(key);
  if (hit) return hit;
  const g = await loadGen();
  const addrBytes = new Uint8Array(getAddressEncoder().encode(address(collectionCfg()!.address)));
  const seed = g.artSeed(addrBytes, s.col.secret, s.col.entropy, id);
  seeds.set(key, seed);
  return seed;
}

export interface Rarity {
  traits: Traits[];
  counts: Map<string, number>;
  total: number;
}

let rarity: { key: string; p: Promise<Rarity | null> } | undefined;
export function rarityTable(): Promise<Rarity | null> {
  const s = $chain.get();
  if (!s || !s.revealed) return Promise.resolve(null);
  const key = `${s.cfgId}:${s.col.minted}`;
  if (rarity?.key === key) return rarity.p;
  const p = (async () => {
    const g = await loadGen();
    const traits: Traits[] = [];
    const counts = new Map<string, number>();
    for (let id = 0; id < s.col.minted; id++) {
      const t = g.traits((await seedFor(id))!);
      traits.push(t);
      for (const [k, v] of Object.entries(t)) counts.set(`${k}=${v}`, (counts.get(`${k}=${v}`) ?? 0) + 1);
    }
    return { traits, counts, total: s.col.minted };
  })();
  rarity = { key, p };
  return p;
}

export const asAddress = (a: string): Address => address(a);

let perByte: Promise<bigint> | undefined;
export function lamportsPerByte(): Promise<bigint> {
  return (perByte ??= rpc()
    .getMinimumBalanceForRentExemption(0n)
    .send()
    .then((v) => BigInt(v) / 128n)
    .catch((e) => {
      perByte = undefined;
      throw e;
    }));
}
