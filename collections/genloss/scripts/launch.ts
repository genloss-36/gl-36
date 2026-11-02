import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { findCollection, initIx } from "@gl-36/sdk";
import { PUBLIC_RPC, RPC_URL, balance, call, collectionState, loadKey, root, rpc, send, sol, systemTransfer } from "@gl-36/cluster";

const PROJECT = "genloss";
const generatorHash = createHash("sha256").update(readFileSync(new URL("../generator/genloss-gen.js", import.meta.url))).digest();
const nonceFor = (base: number) => (base ^ generatorHash.readUInt32LE(0)) >>> 0;

function secretFor(name: string) {
  const p = root(`.keys/${name}.secret`);
  if (!existsSync(p)) writeFileSync(p, randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
  return Buffer.from(readFileSync(p, "utf8").trim(), "hex");
}

const GENESIS = { name: "genesis", title: "Genesis", nonce: nonceFor(0x47454e31), maxSupply: 5000, mintPrice: 10_000_000n, feeBps: 200 };

async function main() {
  const [creator, treasury] = await Promise.all(["deployer", "treasury"].map((k) => loadKey(`.keys/${k}.json`)));
  const programId = (await loadKey("program/target/deploy/gl36-keypair.json")).address;
  console.log(`cluster ${RPC_URL}\nprogram ${programId}\ncreator ${creator.address} (${sol(await balance(creator.address))} SOL)\n`);

  const s = GENESIS;
  const [address] = await findCollection(programId, creator.address, s.nonce);
  const provenance = createHash("sha256").update(secretFor(s.name)).digest();
  if (!(await collectionState(address))) {
    await send(`${s.name}: init`, creator, [
      initIx(programId, creator, address, treasury.address, {
        nonce: s.nonce, maxSupply: s.maxSupply, feeBps: s.feeBps, mintPrice: s.mintPrice, provenance, generatorHash,
      }),
    ]);
  }
  const state = await collectionState(address);
  console.log(`${s.name}: ${address} minted ${state!.minted}/${state!.maxSupply} flags ${state!.flags}`);

  const floor = BigInt(await call(() => rpc.getMinimumBalanceForRentExemption(0n).send()));
  const held = await balance(treasury.address);
  if (held < floor) await send("treasury: fund", creator, [systemTransfer(creator, treasury.address, floor - held)]);
  console.log(`treasury ${treasury.address} (${sol(await balance(treasury.address))} SOL)`);

  const cfgPath = root("deployments/mainnet.json");
  const prev = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
  writeFileSync(cfgPath, JSON.stringify({
    cluster: "mainnet-beta",
    rpc: prev.rpc ?? PUBLIC_RPC,
    programId,
    projects: {
      ...prev.projects,
      [PROJECT]: { title: "GENLOSS", site: "https://genloss.gl36.org", generatorHash: generatorHash.toString("hex") },
    },
    collections: [
      ...(prev.collections ?? []).filter((c: { project?: string }) => c.project !== PROJECT),
      { id: s.name, project: PROJECT, title: s.title, address, maxSupply: s.maxSupply, mintPrice: s.mintPrice.toString() },
    ],
  }, null, 2) + "\n");
  console.log(`\nwrote ${cfgPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
