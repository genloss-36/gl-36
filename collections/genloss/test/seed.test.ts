import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import { tokenSeed } from "@gl36/sdk";
import devnet from "@gl36/deployments/devnet.json" with { type: "json" };
import { artSeed, hex } from "../generator/genloss-gen.js";

test("the generator derives seeds exactly as the SDK's tokenSeed with the genloss/v1 domain", async () => {
  const collection = (await generateKeyPairSigner()).address;
  const bytes = new Uint8Array(getAddressEncoder().encode(collection));
  for (const id of [0, 1, 255, 256, 4999]) {
    const secret = new Uint8Array(32).fill(id & 0xff);
    const entropy = new Uint8Array(32).fill(7);
    const sdk = await tokenSeed({ domain: "genloss/v1", collection, secret, entropy, id });
    assert.equal(hex(artSeed(bytes, secret, entropy, id)), hex(sdk));
  }
});

test("the registry records the hash of the generator in this folder", () => {
  const file = readFileSync(new URL("../generator/genloss-gen.js", import.meta.url));
  const sha = createHash("sha256").update(file).digest("hex");
  assert.equal(devnet.projects.genloss.generatorHash, sha);
  assert.ok(devnet.collections.some((c) => c.project === "genloss"));
});
