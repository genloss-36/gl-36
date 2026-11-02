import { GEN_URL, type Traits } from "./generator";
import type { RenderRequest, RenderResponse } from "../workers/render";

const SIZE = 256;
type Pending = { resolve: (r: RenderResponse) => void; reject: (e: Error) => void };

const workers: Worker[] = [];
const busy: number[] = [];
const pending = new Map<number, Pending>();
const queue: { req: RenderRequest; transfer: Transferable[] }[] = [];
let nextId = 0;

function pool() {
  if (workers.length) return;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL("../workers/render.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<RenderResponse>) => {
      busy[i]--;
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.kind === "error") p?.reject(new Error(e.data.message));
      else p?.resolve(e.data);
      pump();
    };
    workers.push(w);
    busy.push(0);
  }
}

function pump() {
  while (queue.length) {
    const i = busy.indexOf(Math.min(...busy));
    if (busy[i] >= 2) return;
    const { req, transfer } = queue.shift()!;
    busy[i]++;
    workers[i].postMessage(req, transfer);
  }
}

function request(make: (id: number) => RenderRequest, priority = false): Promise<RenderResponse> {
  pool();
  return new Promise((resolve, reject) => {
    const req = make(++nextId);
    pending.set(req.id, { resolve, reject });
    const item = { req, transfer: [] as Transferable[] };
    if (priority) queue.unshift(item);
    else queue.push(item);
    pump();
  });
}

const toBitmap = (rgba: Uint8ClampedArray) => createImageBitmap(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE));

const cache = new Map<string, Promise<{ bitmap: ImageBitmap; traits: Traits; hash: string }>>();

export function renderPiece(key: string, seed: Uint8Array, priority = false) {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = request((id) => ({ id, kind: "piece", url: GEN_URL, seed }), priority).then(async (r) => {
    if (r.kind !== "piece") throw new Error("unexpected render response");
    return { bitmap: await toBitmap(r.rgba), traits: r.traits, hash: r.hash };
  });
  cache.set(key, p);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  p.catch(() => cache.delete(key));
  return p;
}

export interface Stage { generation: number; bitmap: ImageBitmap }

export async function renderStages(seed: Uint8Array, maxFrames = 32, priority = false) {
  const r = await request((id) => ({ id, kind: "stages", url: GEN_URL, seed, maxFrames }), priority);
  if (r.kind !== "stages") throw new Error("unexpected render response");
  const frames: Stage[] = await Promise.all(r.frames.map(async (f) => ({ generation: f.generation, bitmap: await toBitmap(f.rgba) })));
  return { frames, traits: r.traits };
}
