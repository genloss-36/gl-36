import type { APIRoute } from "astro";
import { getCollection, render } from "astro:content";
import { ORDER, docHref, groupOf } from "../data/nav";

export interface Record {
  p: string;
  g: string;
  h: string;
  u: string;
  x: string;
}

function plain(md: string): string {
  const keep = (c: string) => c.replace(/</g, "\u0001").replace(/>/g, "\u0002");
  return md
    .replace(/^import .*$/gm, "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, c: string) => keep(c))
    .replace(/`([^`\n]*)`/g, (_, c: string) => keep(c))
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\|?\s*:?-{3,}.*$/gm, "")
    .replace(/\*\*|`|\|/g, " ")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\u0001/g, "<")
    .replace(/\u0002/g, ">")
    .trim();
}

export const GET: APIRoute = async () => {
  const entries = new Map((await getCollection("docs")).map((e) => [e.id, e]));
  const records: Record[] = [];

  for (const id of ORDER) {
    const entry = entries.get(id);
    if (!entry) continue;
    const { headings } = await render(entry);
    const slugs = headings.filter((h) => h.depth === 2 || h.depth === 3);
    const page = entry.data.title;
    const g = groupOf(id);
    const href = docHref(id);

    let section = { h: "", u: href, lines: [entry.data.description] };
    const flush = () => records.push({ p: page, g, h: section.h, u: section.u, x: plain(section.lines.join("\n")) });
    let fence = false;
    let next = 0;
    for (const line of (entry.body ?? "").split("\n")) {
      if (line.startsWith("```")) fence = !fence;
      const m = !fence && /^(#{2,3})\s+(.+)$/.exec(line);
      if (m) {
        flush();
        const slug = slugs[next++]?.slug ?? "";
        section = { h: m[2].trim(), u: slug ? `${href}#${slug}` : href, lines: [] };
      } else {
        section.lines.push(line);
      }
    }
    flush();
  }

  records.push({
    p: "Inspector",
    g: "Tools",
    h: "",
    u: "/inspector/",
    x: "Decode any GL-36 collection account: header, byte map and every slot, owner and price, read live with one getAccountInfo.",
  });

  return new Response(JSON.stringify(records), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
