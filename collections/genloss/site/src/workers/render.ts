/// <reference lib="webworker" />
import type { Gen } from "../lib/generator";

let gen: Promise<Gen> | undefined;

export type RenderRequest =
  | { id: number; kind: "piece"; url: string; seed: Uint8Array }
  | { id: number; kind: "stages"; url: string; seed: Uint8Array; maxFrames: number };

export type RenderResponse =
  | { id: number; kind: "piece"; rgba: Uint8ClampedArray; traits: Record<string, string | number>; hash: string }
  | { id: number; kind: "stages"; frames: { generation: number; rgba: Uint8ClampedArray }[]; traits: Record<string, string | number> }
  | { id: number; kind: "error"; message: string };

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const req = e.data;
  try {
    gen ??= import(/* @vite-ignore */ req.url) as Promise<Gen>;
    const g = await gen;
    if (req.kind === "piece") {
      const out = g.generate(req.seed);
      const rgba = g.toRGBA(out.rgb);
      (self as unknown as Worker).postMessage({ id: req.id, kind: "piece", rgba, traits: out.traits, hash: g.hex(g.sha256(out.rgb)) } satisfies RenderResponse, [rgba.buffer]);
      return;
    }
    const all: { generation: number; rgb: Uint8Array }[] = [];
    const out = g.generate(req.seed, (rgb, generation) => all.push({ generation, rgb: rgb.slice() }));
    const n = Math.min(req.maxFrames, all.length);
    const picked = n <= 1 ? all.slice(-1) : Array.from({ length: n }, (_, i) => all[Math.round((i * (all.length - 1)) / (n - 1))]);
    const frames = picked.map((f) => ({ generation: f.generation, rgba: g.toRGBA(f.rgb) }));
    (self as unknown as Worker).postMessage(
      { id: req.id, kind: "stages", frames, traits: out.traits } satisfies RenderResponse,
      frames.map((f) => f.rgba.buffer),
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, kind: "error", message: String(err) } satisfies RenderResponse);
  }
};
