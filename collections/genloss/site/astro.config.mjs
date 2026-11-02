import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: process.env.SITE_URL || "https://genloss.gl36.org",
  integrations: [react()],
  vite: {
    resolve: {
      alias: { "@gl-36/sdk": fileURLToPath(new URL("../../../packages/sdk/src/index.ts", import.meta.url)) },
      dedupe: ["@solana/kit"],
    },
    server: { fs: { allow: ["../../.."] } },
    worker: { format: "es" },
  },
});
