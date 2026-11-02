export type Traits = Record<string, string | number>;

export interface Gen {
  VERSION: string;
  SIZE: number;
  generate(seed: Uint8Array, onStage?: (rgb: Uint8Array, generation: number) => void): { size: number; rgb: Uint8Array; traits: Traits };
  traits(seed: Uint8Array): Traits;
  artSeed(collection: Uint8Array, secret: Uint8Array, entropy: Uint8Array, id: number): Uint8Array;
  previewSeed(id: number): Uint8Array;
  sha256(bytes: Uint8Array): Uint8Array;
  hex(bytes: Uint8Array): string;
  toRGBA(rgb: Uint8Array): Uint8ClampedArray;
}

export const GEN_URL = new URL(`${import.meta.env.BASE_URL.replace(/\/?$/, "/")}gen/genloss-gen.js`, location.href).href;

let mod: Promise<Gen> | undefined;
export const loadGen = () => (mod ??= import(/* @vite-ignore */ GEN_URL) as Promise<Gen>);

let digest: Promise<string> | undefined;
export function generatorHash() {
  return (digest ??= fetch(GEN_URL)
    .then((r) => r.arrayBuffer())
    .then((b) => crypto.subtle.digest("SHA-256", b))
    .then((h) => [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("")));
}
