import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Instruction, KeyPairSigner } from "@solana/kit";
import { findCollection, initIx, listIx, mintIx, revealIx } from "@gl36/sdk";
import { RPC_URL, balance, collectionState, loadKey, root, send, systemTransfer } from "./cluster.ts";

const generatorHash = createHash("sha256").update(readFileSync(root("generator/genloss-gen.js"))).digest();
const nonceFor = (base: number) => (base ^ generatorHash.readUInt32LE(0)) >>> 0;

function secretFor(name: string) {
  const p = root(`.keys/${name}.secret`);
  if (!existsSync(p)) writeFileSync(p, randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
  return Buffer.from(readFileSync(p, "utf8").trim(), "hex");
}

const PRICES = [5_000, 8_000, 12_000, 20_000, 33_000, 50_000, 88_000, 150_000, 420_000];

interface Spec {
  name: string;
  title: string;
  nonce: number;
  maxSupply: number;
  mintPrice: bigint;
  feeBps: number;
  mints: [KeyPairSigner, number][];
  listEvery: number;
  reveal: boolean;
  testnetOnly?: boolean;
}

async function main() {
  const [creator, treasury, alice, bob] = await Promise.all(
    ["deployer", "treasury", "alice", "bob"].map((k) => loadKey(`.keys/${k}.json`)),
  );
  const programId = (await loadKey("program/target/deploy/gl36-keypair.json")).address;
  console.log(`cluster ${RPC_URL}\nprogram ${programId}\n`);

  for (const [name, who] of [["alice", alice], ["bob", bob]] as const) {
    if ((await balance(who.address)) < 100_000_000n) {
      await send(`fund ${name}`, creator, [systemTransfer(creator, who.address, 100_000_000n)]);
    }
  }

  const specs: Spec[] = [
    {
      name: "showcase", title: "Showcase", nonce: nonceFor(0x53484f57), maxSupply: 64, mintPrice: 0n, feeBps: 200,
      mints: [[creator, 20], [alice, 24], [bob, 20]], listEvery: 3, reveal: true, testnetOnly: true,
    },
    {
      name: "genesis", title: "Genesis", nonce: nonceFor(0x47454e31), maxSupply: 5000, mintPrice: 10_000_000n, feeBps: 200,
      mints: [[alice, 6], [bob, 6]], listEvery: 4, reveal: false,
    },
  ];

  const out = [];
  for (const s of specs) {
    const [address] = await findCollection(programId, creator.address, s.nonce);
    const secret = secretFor(s.name);
    const provenance = createHash("sha256").update(secret).digest();
    let state = await collectionState(address);
    if (!state) {
      await send(`${s.name}: init`, creator, [
        initIx(programId, creator, address, treasury.address, {
          nonce: s.nonce, maxSupply: s.maxSupply, feeBps: s.feeBps, mintPrice: s.mintPrice, provenance, generatorHash,
        }),
      ]);
      state = await collectionState(address);
    }

    let done = state!.minted;
    for (const [who, count] of s.mints) {
      let left = Math.max(0, count - done);
      done = Math.max(0, done - count);
      while (left > 0) {
        const n = Math.min(10, left);
        await send(`${s.name}: mint x${n}`, who, [mintIx(programId, who, address, creator.address, n)]);
        left -= n;
      }
    }

    state = await collectionState(address);
    for (const who of [creator, alice, bob]) {
      const ixs: Instruction[] = [];
      for (const slot of state!.slots) {
        if (slot.id % s.listEvery !== 0 || slot.owner !== who.address || slot.price !== 0) continue;
        ixs.push(listIx(programId, who, address, slot.id, PRICES[(slot.id * 7) % PRICES.length]));
      }
      for (let i = 0; i < ixs.length; i += 8) await send(`${s.name}: list x${ixs.slice(i, i + 8).length}`, who, ixs.slice(i, i + 8));
    }

    if (s.reveal && !(state!.flags & 1)) await send(`${s.name}: reveal`, creator, [revealIx(programId, creator, address, secret)]);
    state = await collectionState(address);
    console.log(`${s.name}: ${address} minted ${state!.minted}/${state!.maxSupply} flags ${state!.flags}`);
    out.push({ id: s.name, title: s.title, address, maxSupply: s.maxSupply, mintPrice: s.mintPrice.toString(), ...(s.testnetOnly && { testnetOnly: true }) });
  }

  const cfgPath = root("web/src/data/devnet.json");
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify({
    cluster: "devnet",
    rpc: RPC_URL,
    programId,
    generatorHash: generatorHash.toString("hex"),
    collections: out,
  }, null, 2) + "\n");
  console.log(`\nwrote ${cfgPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
