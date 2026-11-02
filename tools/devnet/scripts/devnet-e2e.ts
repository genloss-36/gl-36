import { createHash, randomBytes } from "node:crypto";
import {
  buyIx,
  findCollection,
  initIx,
  listIx,
  mintIx,
  revealIx,
  transferIx,
  withdrawExcessIx,
} from "@gl36/sdk";
import { RPC_URL, balance, collectionState as stateOrNull, loadKey, rows, send, sol, systemTransfer } from "./cluster.ts";
import type { Address, Instruction } from "@solana/kit";

async function collectionState(a: Address) {
  const s = await stateOrNull(a);
  if (!s) throw new Error(`no account ${a}`);
  return s;
}

async function main() {
  const [creator, treasury, alice, bob] = await Promise.all(
    ["deployer", "treasury", "alice", "bob"].map((k) => loadKey(`.keys/${k}.json`)),
  );
  const programId = (await loadKey("program/target/deploy/gl36-keypair.json")).address;
  console.log(`cluster ${RPC_URL}\nprogram ${programId}\ncreator ${creator.address}\n`);

  const fund: Instruction[] = [];
  for (const [who, amount] of [[alice, 150_000_000n], [bob, 150_000_000n], [treasury, 2_000_000n]] as const) {
    if ((await balance(who.address)) < amount / 2n) fund.push(systemTransfer(creator, who.address, amount));
  }
  if (fund.length) await send("fund test wallets", creator, fund);

  const secret = randomBytes(32);
  const provenance = createHash("sha256").update(secret).digest();
  const generatorHash = new Uint8Array(32);
  const mintPrice = 10_000_000n;
  const nonce = Date.now() % 0xffff_ffff;

  const [colA] = await findCollection(programId, creator.address, nonce);
  await send("init (5000)", creator, [
    initIx(programId, creator, colA, treasury.address, { nonce, maxSupply: 5000, feeBps: 200, mintPrice, provenance, generatorHash }),
  ]);
  const aliceBefore = await balance(alice.address);
  await send("mint x1", alice, [mintIx(programId, alice, colA, creator.address, 1)]);
  const perMint = aliceBefore - (await balance(alice.address));
  await send("mint x10", alice, [mintIx(programId, alice, colA, creator.address, 10)]);
  await send("mint x3", bob, [mintIx(programId, bob, colA, creator.address, 3)]);
  await send("list", alice, [listIx(programId, alice, colA, 0, 20_000)]);
  await send("buy", bob, [buyIx(programId, bob, colA, alice.address, treasury.address, 0, 20_000)]);
  await send("transfer", bob, [transferIx(programId, bob, colA, alice.address, 11)]);
  await send("list + delist", alice, [listIx(programId, alice, colA, 2, 5_000), listIx(programId, alice, colA, 2, 0)]);
  await send("reveal (closes mint)", creator, [revealIx(programId, creator, colA, secret)]);
  await send("withdraw_excess", creator, [withdrawExcessIx(programId, creator, colA)]);
  const a = await collectionState(colA);

  const [colB] = await findCollection(programId, creator.address, nonce + 1);
  await send("init (3)", creator, [
    initIx(programId, creator, colB, treasury.address, { nonce: nonce + 1, maxSupply: 3, feeBps: 0, mintPrice: 0n, provenance, generatorHash }),
  ]);
  await send("mint x2", alice, [mintIx(programId, alice, colB, creator.address, 2)]);
  await send("mint x1 (sell-out)", bob, [mintIx(programId, bob, colB, creator.address, 1)]);
  const bSold = await collectionState(colB);
  await send("reveal (after sell-out)", creator, [revealIx(programId, creator, colB, secret)]);
  const b = await collectionState(colB);

  console.log(`\nCollection A ${colA}`);
  console.log(`  minted ${a.minted}/${a.maxSupply} flags ${a.flags} len ${a.len} B  rent ${sol(a.lamports)} SOL`);
  console.log(`  slot 0 owner ${a.slots[0].owner === bob.address ? "bob ✔" : a.slots[0].owner}, slot 11 owner ${a.slots[11].owner === alice.address ? "alice ✔" : a.slots[11].owner}`);
  console.log(`  one mint cost alice ${sol(perMint)} SOL (price ${sol(mintPrice)} + rent + fee)`);
  console.log(`Collection B ${colB}`);
  console.log(`  sold out → flags ${bSold.flags}, entropy set: ${bSold.entropy.some((x) => x !== 0)}; after reveal flags ${b.flags}`);

  const total = rows.reduce((s, r) => s + r.fee, 0n);
  console.log(`\nTotal tx fees: ${sol(total)} SOL over ${rows.length} transactions`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
