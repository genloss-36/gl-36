import { writeFileSync } from "node:fs";
const [gen, out, mode, a, b] = process.argv.slice(2);
const g = await import(gen);
const meta = [];
if (mode === "range") {
  for (let id = Number(a); id < Number(b); id++) {
    const r = g.generate(g.previewSeed(id));
    writeFileSync(`${out}/final-${id}.rgb`, r.rgb);
    meta.push({ id, ...r.traits });
  }
} else {
  const id = Number(a);
  const r = g.generate(g.previewSeed(id), (rgb, n) => writeFileSync(`${out}/stage-${id}-${n}.rgb`, rgb));
  meta.push({ id, ...r.traits });
}
writeFileSync(`${out}/meta-${mode}.json`, JSON.stringify(meta, null, 1));
