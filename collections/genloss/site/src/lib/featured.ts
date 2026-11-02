import { $chain } from "./store";
import { rarityTable, seedFor } from "./chain";
import { loadGen } from "./generator";

export interface Featured {
  seed: Uint8Array;
  id: number | null;
}

const MIN_GENERATIONS = 6;

export async function dramaticFeatured(): Promise<Featured> {
  const s = $chain.get();
  const table = s?.revealed ? await rarityTable() : null;
  if (table && s) {
    const ids = table.traits.map((t, id) => ({ t, id })).filter((x) => Number(x.t.generations) >= MIN_GENERATIONS).map((x) => x.id);
    const pool = ids.length ? ids : table.traits.map((_, id) => id);
    const id = pool[Math.floor(Math.random() * pool.length)];
    const seed = await seedFor(id);
    if (seed) return { seed, id };
  }
  const g = await loadGen();
  for (let i = 0; i < 200; i++) {
    const seed = g.previewSeed(1000 + Math.floor(Math.random() * 60000));
    if (Number(g.traits(seed).generations) >= MIN_GENERATIONS) return { seed, id: null };
  }
  return { seed: g.previewSeed(1000), id: null };
}
