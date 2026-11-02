import { copyFileSync, mkdirSync } from "node:fs";

const src = new URL("../../generator/genloss-gen.js", import.meta.url);
const dst = new URL("../public/gen/genloss-gen.js", import.meta.url);
mkdirSync(new URL("./", dst), { recursive: true });
copyFileSync(src, dst);
console.log("generator synced → public/gen/genloss-gen.js");
