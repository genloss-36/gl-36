import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const ROOT = "../../../skills/gl36/";
const sources = import.meta.glob<string>("../../../skills/gl36/**/*.md", { query: "?raw", import: "default", eager: true });

export const SKILL_FILES: [string, string][] = Object.entries(sources)
  .map(([path, text]): [string, string] => [path.slice(ROOT.length), text])
  .sort(([a], [b]) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));

const skillMd = SKILL_FILES.find(([path]) => path === "SKILL.md")?.[1] ?? "";
const frontmatter = skillMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
const field = (key: string) => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";

export const SKILL_NAME = field("name");
export const SKILL_DESCRIPTION = field("description");

const encoder = new TextEncoder();

function header(path: string, size: number): Uint8Array {
  const h = new Uint8Array(512);
  const put = (offset: number, value: string) => h.set(encoder.encode(value), offset);
  const octal = (value: number, width: number) => value.toString(8).padStart(width - 1, "0");
  put(0, path);
  put(100, octal(0o644, 8));
  put(108, octal(0, 8));
  put(116, octal(0, 8));
  put(124, octal(size, 12));
  put(136, octal(0, 12));
  put(148, "        ");
  put(156, "0");
  put(257, "ustar\u000000");
  const sum = h.reduce((a, b) => a + b, 0);
  put(148, `${octal(sum, 7)}\u0000 `);
  return h;
}

function tar(files: [string, string][]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [path, text] of files) {
    const body = encoder.encode(text);
    parts.push(header(path, body.length), body, new Uint8Array((512 - (body.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export const SKILL_ARCHIVE = new Uint8Array(gzipSync(tar(SKILL_FILES), { level: 9 }));
export const SKILL_DIGEST = `sha256:${createHash("sha256").update(SKILL_ARCHIVE).digest("hex")}`;
