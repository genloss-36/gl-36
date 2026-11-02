import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import { fileURLToPath } from "node:url";
import { xcodeDark, xcodeLight } from "./src/lib/code-themes.mjs";

const site = process.env.SITE_URL || "https://gl36.org";

export default defineConfig({
  site,
  trailingSlash: "always",
  devToolbar: { enabled: false },
  integrations: [mdx()],
  markdown: {
    shikiConfig: { themes: { light: xcodeLight, dark: xcodeDark }, defaultColor: false, wrap: false },
  },
  vite: {
    resolve: {
      alias: {
        "@gl-36/sdk": fileURLToPath(new URL("../packages/sdk/src/index.ts", import.meta.url)),
      },
      dedupe: ["@solana/kit"],
    },
    server: { fs: { allow: [".."] } },
  },
});
