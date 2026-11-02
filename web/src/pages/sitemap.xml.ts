import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  const url = (path: string) => (site ? new URL(path, site).href : path);
  const pages: [string, string][] = [["en", base], ["zh-CN", `${base}zh/`]];
  const alternates = pages.map(([lang, path]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${url(path)}"/>`).join("");
  const body = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
    ...pages.map(([, path]) => `  <url><loc>${url(path)}</loc>${alternates}</url>`),
    `</urlset>`,
  ].join("\n");
  return new Response(body + "\n", { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
