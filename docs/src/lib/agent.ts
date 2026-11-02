import { FEATURED } from "./config";

const SITE = new URL(import.meta.env.SITE ?? "https://gl36.org");

export const SKILL_INSTALL = "npx skills add genloss-36/gl-36";

export const AGENT_PROMPT = [
  `Set up this project to build on GL-36, the Solana NFT standard where a whole collection is one account and each token is a 36-byte slot. Docs: ${new URL("/docs/", SITE).href}`,
  "",
  `1. Install the GL-36 agent skill: ${SKILL_INSTALL} -y`,
  "2. Read the SKILL.md it installed and follow it for all GL-36 work.",
  "3. Add @gl-36/sdk and @solana/kit with this project's package manager.",
  FEATURED
    ? `4. Check that it works: with the SDK, read the collection ${FEATURED.address} and tell me its state, how many tokens are minted and which are listed.`
    : "4. Check that it works: with the SDK, find the GL-36 collections on mainnet and tell me how many there are.",
  "",
  "Then ask me what I want to build.",
].join("\n");
