import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { ORDER, docHref } from "../data/nav";

export const GET: APIRoute = async ({ site }) => {
  const url = (path: string) => (site ? new URL(path, site).href : path);
  const ids = new Set((await getCollection("docs")).map((e) => e.id));
  const paths = ["/", ...ORDER.filter((id) => ids.has(id)).map(docHref), "/inspector/"];
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...paths.map((p) => `  <url><loc>${url(p)}</loc></url>`),
    `</urlset>`,
  ].join("\n");
  return new Response(body + "\n", { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
