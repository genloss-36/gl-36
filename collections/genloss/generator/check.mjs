import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";
import { SIZE, VERSION, generate, hex, previewSeed, sha256 } from "./genloss-gen.js";

const listMode = process.argv[2] === "ids";
const count = listMode ? 0 : Number(process.argv[2] ?? 24);
const start = listMode ? 0 : Number(process.argv[3] ?? 0);
const ids = listMode
  ? process.argv[3].split(",").map(Number)
  : Array.from({ length: count }, (_, i) => start + i);
const sheetName = listMode ? (process.argv[4] ?? "picked") : String(start);
const here = (p) => new URL(p, import.meta.url);

for (let len = 0; len < 300; len++) {
  const msg = new Uint8Array(len).map((_, i) => (i * 31 + len) & 255);
  const want = createHash("sha256").update(msg).digest("hex");
  if (hex(sha256(msg)) !== want) throw new Error(`sha256 mismatch at len ${len}`);
}
console.log("sha256: ok (0..299 bytes)");

const vectors = [];
const images = [];
for (const id of ids) {
  const t0 = performance.now();
  const a = generate(previewSeed(id));
  const ms = performance.now() - t0;
  const b = generate(previewSeed(id));
  const h = hex(sha256(a.rgb));
  if (h !== hex(sha256(b.rgb))) throw new Error(`non-deterministic output for id ${id}`);
  vectors.push({ id, composition: a.traits.composition, compression: a.traits.compression, sha256: h });
  images.push(a.rgb);
  console.log(`#${String(id).padStart(3)} ${ms.toFixed(0).padStart(5)} ms  ${h.slice(0, 16)}  ${JSON.stringify(a.traits)}`);
}
if (!listMode) {
  writeFileSync(here("./vectors.json"), JSON.stringify({ version: VERSION, seed: "previewSeed(id)", hash: "sha256(rgb)", vectors }, null, 2) + "\n");
  console.log(`vectors.json: ${vectors.length} entries`);
}

const cols = 6, rows = Math.ceil(images.length / cols), gap = 4;
const W = cols * SIZE + (cols + 1) * gap, H = rows * SIZE + (rows + 1) * gap;
const raw = Buffer.alloc((W * 3 + 1) * H, 40);
for (let y = 0; y < H; y++) raw[y * (W * 3 + 1)] = 0;
images.forEach((rgb, n) => {
  const ox = gap + (n % cols) * (SIZE + gap), oy = gap + Math.floor(n / cols) * (SIZE + gap);
  for (let y = 0; y < SIZE; y++) {
    const row = (oy + y) * (W * 3 + 1) + 1 + ox * 3;
    raw.set(rgb.subarray(y * SIZE * 3, (y + 1) * SIZE * 3), row);
  }
});
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
]);
const out = here(`./sheet-${sheetName}.png`);
writeFileSync(out, png);
console.log(`contact sheet: ${out.pathname}`);
