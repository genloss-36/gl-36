import { after, before, describe, test } from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { FailedTransactionMetadata, LiteSVM, Rent, type TransactionMetadata } from "litesvm";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Encoder,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  ERR,
  FLAG_CLOSED,
  FLAG_SETTLED,
  HEADER_LEN,
  PRICE_UNIT,
  SLOT_LEN,
  buyIx,
  decodeCollection,
  findCollection,
  initIx,
  listIx,
  mintIx,
  closeIx,
  settleIx,
  entropySlot,
  transferIx,
  withdrawExcessIx,
  parseLogs,
  parseProgramError,
} from "../src/index.ts";

const PROGRAM_SO = fileURLToPath(new URL("../../../program/target/deploy/gl36.so", import.meta.url));
const SKIP = existsSync(PROGRAM_SO) ? false : "build the program first: cd program && cargo build-sbf";
const SOL = 1_000_000_000n;
const MINT_PRICE = 10_000_000n;
const FEE_BPS = 200;

const generatorHash = new Uint8Array(32).fill(7);

const cu = new Map<string, bigint[]>();

type Result = TransactionMetadata | FailedTransactionMetadata;

interface Ctx {
  svm: LiteSVM;
  programId: Address;
  creator: KeyPairSigner;
  treasury: KeyPairSigner;
  alice: KeyPairSigner;
  bob: KeyPairSigner;
  collection: Address;
}

async function send(svm: LiteSVM, payer: KeyPairSigner, ixs: Instruction[], label?: string) {
  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
    (m) => appendTransactionMessageInstructions(ixs, m),
    (m) => signTransactionMessageWithSigners(m),
  );
  const res: Result = svm.sendTransaction(tx);
  svm.expireBlockhash();
  if (label && !(res instanceof FailedTransactionMetadata)) {
    cu.set(label, [...(cu.get(label) ?? []), res.computeUnitsConsumed()]);
  }
  return res;
}

function ok(res: Result): TransactionMetadata {
  if (res instanceof FailedTransactionMetadata) {
    assert.fail(`tx failed: ${res.toString()}\n${res.meta().logs().join("\n")}`);
  }
  return res;
}

function fails(res: Result, code?: number): void {
  assert.ok(res instanceof FailedTransactionMetadata, "expected the transaction to fail");
  if (code !== undefined) {
    const logs = res.meta().logs().join("\n");
    assert.match(logs, new RegExp(`custom program error: 0x${code.toString(16)}\\b`), logs);
  }
}

async function setup(maxSupply: number, nonce = 0): Promise<Ctx> {
  const svm = new LiteSVM();
  const programId = (await generateKeyPairSigner()).address;
  svm.addProgramFromFile(programId, PROGRAM_SO);
  const [creator, treasury, alice, bob] = await Promise.all(
    [0, 1, 2, 3].map(() => generateKeyPairSigner()),
  );
  for (const s of [creator, treasury, alice, bob]) svm.airdrop(s.address, lamports(10n * SOL));
  const [collection] = await findCollection(programId, creator.address, nonce);
  ok(await send(svm, creator, [
    initIx(programId, creator, collection, treasury.address, {
      nonce, maxSupply, feeBps: FEE_BPS, mintPrice: MINT_PRICE, generatorHash,
    }),
  ], "init"));
  return { svm, programId, creator, treasury, alice, bob, collection };
}

function state(c: Ctx) {
  const acc = c.svm.getAccount(c.collection);
  assert.ok(acc.exists);
  return { ...decodeCollection(acc.data as Uint8Array), lamports: acc.lamports, len: acc.data.length };
}

const bal = (c: Ctx, a: Address) => c.svm.getBalance(a) ?? 0n;

function patched(ix: Instruction, offset: number, bytes: number[]): Instruction {
  const data = new Uint8Array(ix.data ?? []);
  data.set(bytes, offset);
  return { ...ix, data };
}

describe("program on LiteSVM", { skip: SKIP }, () => {
  describe("init", () => {
    test("writes the header and rejects bad params", async () => {
      const c = await setup(5000);
      const s = state(c);
      assert.equal(s.len, HEADER_LEN);
      assert.equal(s.maxSupply, 5000);
      assert.equal(s.minted, 0);
      assert.equal(s.feeBps, FEE_BPS);
      assert.equal(s.mintPrice, MINT_PRICE);
      assert.equal(s.creator, c.creator.address);
      assert.equal(s.treasury, c.treasury.address);
      assert.equal(s.closeSlot, 0n);
      assert.deepEqual(s.generatorHash, generatorHash);
      assert.equal(s.lamports, c.svm.minimumBalanceForRentExemption(BigInt(HEADER_LEN)));

      const [col1] = await findCollection(c.programId, c.creator.address, 1);
      const base = { nonce: 1, maxSupply: 10, feeBps: 0, mintPrice: 0n, generatorHash };
      const valid = initIx(c.programId, c.creator, col1, c.treasury.address, base);
      fails(await send(c.svm, c.creator, [patched(valid, 7, [0xe9, 0x03])]), ERR.BadFee);
      fails(await send(c.svm, c.creator, [patched(valid, 5, [0, 0])]), ERR.BadSupply);
      fails(await send(c.svm, c.creator, [initIx(c.programId, c.creator, c.collection, c.treasury.address, base)]));
      fails(await send(c.svm, c.creator, [initIx(c.programId, c.creator, c.collection, c.treasury.address, { ...base, nonce: 0 })]));
    });

    test("can't be blocked by lamports sent to the address first", async () => {
      const c = await setup(10);
      const base = { maxSupply: 10, feeBps: 0, mintPrice: 0n, generatorHash };
      const min = c.svm.minimumBalanceForRentExemption(BigInt(HEADER_LEN));

      const [dust] = await findCollection(c.programId, c.creator.address, 1);
      c.svm.airdrop(dust, lamports(1_000_000n));
      ok(await send(c.svm, c.creator, [initIx(c.programId, c.creator, dust, c.treasury.address, { ...base, nonce: 1 })]));
      const s = state({ ...c, collection: dust });
      assert.equal(s.len, HEADER_LEN);
      assert.equal(s.lamports, min);
      assert.equal(s.creator, c.creator.address);
      const acc = c.svm.getAccount(dust);
      assert.ok(acc.exists);
      assert.equal(acc.programAddress, c.programId);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, dust, c.creator.address, 2)]));

      const [rich] = await findCollection(c.programId, c.creator.address, 2);
      c.svm.airdrop(rich, lamports(SOL));
      ok(await send(c.svm, c.creator, [initIx(c.programId, c.creator, rich, c.treasury.address, { ...base, nonce: 2 })]));
      assert.equal(state({ ...c, collection: rich }).lamports, SOL);
      const creatorBefore = bal(c, c.creator.address);
      ok(await send(c.svm, c.creator, [withdrawExcessIx(c.programId, c.creator, rich)]));
      assert.equal(bal(c, c.creator.address) - creatorBefore, SOL - min - 5_000n);
      fails(await send(c.svm, c.creator, [initIx(c.programId, c.creator, rich, c.treasury.address, { ...base, nonce: 2 })]));
    });
  });

  describe("mint", () => {
    test("grows the account, charges rent and price, records owners", async () => {
      const c = await setup(5000);
      const creatorBefore = bal(c, c.creator.address);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 3)], "mint x3"));
      ok(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 1)], "mint x1"));
      ok(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 10)], "mint x10"));
      const s = state(c);
      assert.equal(s.minted, 14);
      assert.equal(s.len, HEADER_LEN + 14 * SLOT_LEN);
      assert.equal(s.lamports, c.svm.minimumBalanceForRentExemption(BigInt(s.len)));
      assert.deepEqual(s.slots.map((x) => x.owner), [
        ...Array(3).fill(c.alice.address),
        ...Array(11).fill(c.bob.address),
      ]);
      assert.ok(s.slots.every((x) => x.price === 0));
      assert.equal(bal(c, c.creator.address) - creatorBefore, 14n * MINT_PRICE);
    });

    test("refuses a total price that overflows", async () => {
      const c = await setup(10);
      const [col] = await findCollection(c.programId, c.creator.address, 1);
      ok(await send(c.svm, c.creator, [
        initIx(c.programId, c.creator, col, c.treasury.address, {
          nonce: 1, maxSupply: 10, feeBps: 0, mintPrice: 2n ** 63n, generatorHash,
        }),
      ]));
      const creatorBefore = bal(c, c.creator.address);
      fails(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, col, c.creator.address, 2)]));
      assert.equal(state({ ...c, collection: col }).minted, 0);
      assert.equal(bal(c, c.creator.address), creatorBefore);
    });

    test("rejects bad batches and a wrong creator", async () => {
      const c = await setup(5000);
      const one = mintIx(c.programId, c.alice, c.collection, c.creator.address, 1);
      fails(await send(c.svm, c.alice, [patched(one, 1, [0])]), ERR.BadBatch);
      fails(await send(c.svm, c.alice, [patched(one, 1, [11])]), ERR.BadBatch);
      fails(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.bob.address, 1)]), ERR.WrongCreator);
    });

    test("sell-out closes minting and records the slot", async () => {
      const c = await setup(4);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 3)]));
      fails(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 2)]), ERR.SoldOut);
      c.svm.warpToSlot(500n);
      ok(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 1)], "mint x1 (sell-out)"));
      const s = state(c);
      assert.equal(s.minted, 4);
      assert.equal(s.flags, FLAG_CLOSED);
      assert.equal(s.closeSlot, 500n);
      assert.ok(s.entropy.every((b) => b === 0));
      fails(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 1)]), ERR.MintClosed);
    });
  });

  describe("market", () => {
    let c: Ctx;
    before(async () => {
      c = await setup(5000);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 2)]));
      ok(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 1)]));
    });

    test("list, delist and ownership checks", async () => {
      ok(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 0, 50_000)], "list"));
      assert.equal(state(c).slots[0].price, 50_000);
      fails(await send(c.svm, c.bob, [listIx(c.programId, c.bob, c.collection, 0, 1)]), ERR.NotOwner);
      fails(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 9, 1)]), ERR.BadId);
      ok(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 1, 7)]));
      ok(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 1, 0)], "delist"));
      assert.equal(state(c).slots[1].price, 0);
    });

    test("owner must actually sign", async () => {
      const ix = listIx(c.programId, c.alice, c.collection, 0, 1);
      const unsigned = { ...ix, accounts: [{ address: c.alice.address, role: AccountRole.READONLY }, ix.accounts![1]] };
      const res = await send(c.svm, c.bob, [unsigned]);
      fails(res);
      assert.match((res as FailedTransactionMetadata).meta().logs().join("\n"), /missing required signature/i);
    });

    test("buy rejects stale price, wrong seller/treasury, unlisted and self-buy", async () => {
      fails(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.alice.address, c.treasury.address, 0, 49_999)]), ERR.PriceAboveMax);
      fails(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.creator.address, c.treasury.address, 0, 50_000)]), ERR.SellerMismatch);
      fails(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.alice.address, c.creator.address, 0, 50_000)]), ERR.WrongTreasury);
      fails(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.alice.address, c.treasury.address, 1, 50_000)]), ERR.NotListed);
      fails(await send(c.svm, c.alice, [buyIx(c.programId, c.alice, c.collection, c.alice.address, c.treasury.address, 0, 50_000)]), ERR.SelfBuy);
    });

    test("buy pays seller and fee, moves ownership, clears the listing", async () => {
      const price = 50_000;
      const total = BigInt(price) * PRICE_UNIT;
      const fee = (total * BigInt(FEE_BPS)) / 10_000n;
      const [aliceBefore, treasuryBefore] = [bal(c, c.alice.address), bal(c, c.treasury.address)];
      ok(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.alice.address, c.treasury.address, 0, price)], "buy"));
      assert.equal(bal(c, c.alice.address) - aliceBefore, total - fee);
      assert.equal(bal(c, c.treasury.address) - treasuryBefore, fee);
      const s = state(c);
      assert.equal(s.slots[0].owner, c.bob.address);
      assert.equal(s.slots[0].price, 0);
      fails(await send(c.svm, c.creator, [buyIx(c.programId, c.creator, c.collection, c.alice.address, c.treasury.address, 0, price)]), ERR.SellerMismatch);
    });

    test("transfer moves ownership and clears the listing", async () => {
      ok(await send(c.svm, c.bob, [listIx(c.programId, c.bob, c.collection, 2, 10)]));
      fails(await send(c.svm, c.alice, [transferIx(c.programId, c.alice, c.collection, c.creator.address, 2)]), ERR.NotOwner);
      fails(await send(c.svm, c.bob, [transferIx(c.programId, c.bob, c.collection, c.bob.address, 2)]), ERR.SameOwner);
      ok(await send(c.svm, c.bob, [transferIx(c.programId, c.bob, c.collection, c.alice.address, 2)], "transfer"));
      const s = state(c);
      assert.equal(s.slots[2].owner, c.alice.address);
      assert.equal(s.slots[2].price, 0);
    });

    test("a foreign account is not accepted as a collection", async () => {
      fails(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.alice.address, 0, 1)]));
    });
  });

  describe("close and settle", () => {
    const slotHashes = (c: Ctx, entries: [bigint, string][]) =>
      c.svm.setSlotHashes(
        entries.map(([slot, hash]) => {
          const [entry] = c.svm.getSlotHashes();
          entry.slot = slot;
          entry.hash = hash;
          return entry;
        }),
      );
    const hashes = () => Promise.all([0, 1, 2].map(async () => (await generateKeyPairSigner()).address as string));
    const bytes = (hash: string) => new Uint8Array(getBase58Encoder().encode(hash));

    test("close ends the mint early, only for the creator", async () => {
      const c = await setup(5000);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 5)]));
      c.svm.warpToSlot(1_000n);
      fails(await send(c.svm, c.alice, [closeIx(c.programId, c.alice, c.collection)]), ERR.WrongCreator);
      const closed = ok(await send(c.svm, c.creator, [closeIx(c.programId, c.creator, c.collection)], "close"));
      assert.deepEqual(parseLogs(closed.logs(), c.programId), [{ type: "close", minted: 5 }]);
      const s = state(c);
      assert.equal(s.flags, FLAG_CLOSED);
      assert.equal(s.maxSupply, 5);
      assert.equal(s.closeSlot, 1_000n);
      assert.equal(entropySlot(s), 1_032n);
      fails(await send(c.svm, c.creator, [closeIx(c.programId, c.creator, c.collection)]), ERR.MintClosed);
      fails(await send(c.svm, c.bob, [mintIx(c.programId, c.bob, c.collection, c.creator.address, 1)]), ERR.MintClosed);
    });

    test("settle takes the first slot hash from close + 32 on, from anyone, once", async () => {
      const c = await setup(5000);
      const [h1, h2, h3] = await hashes();
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 3)]));
      fails(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)]), ERR.NotClosed);
      c.svm.warpToSlot(2_000n);
      ok(await send(c.svm, c.creator, [closeIx(c.programId, c.creator, c.collection)]));

      slotHashes(c, [[2_031n, h1], [2_020n, h2]]);
      fails(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)]), ERR.TooEarly);

      slotHashes(c, [[2_040n, h1], [2_034n, h2], [2_031n, h3]]);
      const settled = ok(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)], "settle"));
      assert.deepEqual(parseLogs(settled.logs(), c.programId), [{ type: "settle" }]);
      const s = state(c);
      assert.equal(s.flags, FLAG_CLOSED | FLAG_SETTLED);
      assert.deepEqual(s.entropy, bytes(h2));
      fails(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)]), ERR.AlreadySettled);
    });

    test("re-arms when the target slot has left SlotHashes", async () => {
      const c = await setup(10);
      const [h1, h2, h3] = await hashes();
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 2)]));
      c.svm.warpToSlot(3_000n);
      ok(await send(c.svm, c.creator, [closeIx(c.programId, c.creator, c.collection)]));

      c.svm.warpToSlot(9_000n);
      slotHashes(c, Array.from({ length: 512 }, (_, i): [bigint, string] => [9_000n - BigInt(i), h1]));
      const rearmed = ok(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)]));
      assert.deepEqual(parseLogs(rearmed.logs(), c.programId), [{ type: "rearm" }]);
      assert.equal(state(c).closeSlot, 9_000n);
      assert.equal(state(c).flags, FLAG_CLOSED);

      slotHashes(c, [[9_040n, h1], [9_033n, h2], [9_031n, h3]]);
      ok(await send(c.svm, c.bob, [settleIx(c.programId, c.collection)]));
      assert.deepEqual(state(c).entropy, bytes(h2));
    });
  });

  describe("withdraw_excess", () => {
    test("returns lamports freed by a rent cut, only to the creator", async () => {
      const c = await setup(5000);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 10)]));
      const before = state(c);
      ok(await send(c.svm, c.creator, [withdrawExcessIx(c.programId, c.creator, c.collection)]));
      assert.equal(state(c).lamports, before.lamports);

      c.svm.setRent(new Rent(2575n, 1, 0));
      fails(await send(c.svm, c.alice, [withdrawExcessIx(c.programId, c.alice, c.collection)]), ERR.WrongCreator);
      const creatorBefore = bal(c, c.creator.address);
      ok(await send(c.svm, c.creator, [withdrawExcessIx(c.programId, c.creator, c.collection)], "withdraw_excess"));
      const after = state(c);
      const min = c.svm.minimumBalanceForRentExemption(BigInt(after.len));
      assert.equal(after.lamports, min);
      assert.equal(bal(c, c.creator.address) - creatorBefore, before.lamports - min - 5_000n);

      const aliceBefore = bal(c, c.alice.address);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 1)]));
      assert.equal(aliceBefore - bal(c, c.alice.address), BigInt(SLOT_LEN) * 2575n + MINT_PRICE + 5_000n);
    });
  });

  describe("sdk helpers on real transactions", () => {
    test("parseLogs reads mint, list and buy events", async () => {
      const c = await setup(10);
      const minted = ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 2)]));
      assert.deepEqual(parseLogs(minted.logs(), c.programId), [{ type: "mint", firstId: 0, count: 2 }]);
      const listed = ok(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 1, 50_000)]));
      assert.deepEqual(parseLogs(listed.logs(), c.programId), [{ type: "list", id: 1, price: 50_000 }]);
      const bought = ok(await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.alice.address, c.treasury.address, 1, 50_000)]));
      assert.deepEqual(parseLogs(bought.logs(), c.programId), [{ type: "buy", id: 1, price: 50_000 }]);
      assert.deepEqual(parseLogs(bought.logs(), c.treasury.address), []);
    });

    test("parseProgramError names program errors and leaves system errors unnamed", async () => {
      const c = await setup(10);
      ok(await send(c.svm, c.alice, [mintIx(c.programId, c.alice, c.collection, c.creator.address, 1)]));
      ok(await send(c.svm, c.alice, [listIx(c.programId, c.alice, c.collection, 0, 50_000)]));
      const stale = await send(c.svm, c.bob, [buyIx(c.programId, c.bob, c.collection, c.creator.address, c.treasury.address, 0, 50_000)]);
      assert.ok(stale instanceof FailedTransactionMetadata);
      const err = parseProgramError(stale.meta().logs(), { programId: c.programId });
      assert.equal(err?.name, "SellerMismatch");
      assert.equal(err?.program, c.programId);

      const poor = await generateKeyPairSigner();
      c.svm.airdrop(poor.address, lamports(1_000_000n));
      const broke = await send(c.svm, poor, [mintIx(c.programId, poor, c.collection, c.creator.address, 1)]);
      assert.ok(broke instanceof FailedTransactionMetadata);
      const sys = parseProgramError(broke.meta().logs(), { programId: c.programId });
      assert.equal(sys?.program, "11111111111111111111111111111111");
      assert.equal(sys?.name, undefined);
    });
  });
});

after(() => {
  if (!cu.size) return;
  const rows = [...cu].map(([k, v]) => `  ${k.padEnd(22)} ${v.map(String).join(", ")}`);
  console.log(`\nCompute units:\n${rows.join("\n")}`);
});
