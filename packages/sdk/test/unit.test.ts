import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AccountRole,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SolanaError,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import {
  ERR,
  FLAG_CLOSED,
  FLAG_REVEALED,
  HEADER_LEN,
  HEADER_OFFSET,
  INSTRUCTION,
  PROGRAM_ID,
  SLOT_HASHES,
  SLOT_LEN,
  SYSTEM_PROGRAM,
  accountLength,
  buyIx,
  collectionState,
  decodeCollection,
  decodeHeader,
  decodeSlot,
  errorName,
  findCollection,
  initIx,
  isCollectionAccount,
  lamportsToPrice,
  listIx,
  listedSlots,
  mintIx,
  parseLogs,
  parseProgramError,
  priceToLamports,
  priceToSol,
  provenanceOf,
  rentExemptMinimum,
  revealIx,
  slotOffset,
  slotsOwnedBy,
  solToPrice,
  tokenSeed,
  transferIx,
  withdrawExcessIx,
} from "../src/index.ts";

const PROGRAM = PROGRAM_ID.devnet;
const enc = getAddressEncoder();
const hex = (b: ArrayLike<number>) => Buffer.from(Uint8Array.from(b)).toString("hex");

interface Fixture {
  minted: number;
  maxSupply: number;
  flags: number;
  owners: Address[];
  prices: number[];
}

async function account(f: Fixture) {
  const creator = (await generateKeyPairSigner()).address;
  const treasury = (await generateKeyPairSigner()).address;
  const d = new Uint8Array(accountLength(f.minted));
  const v = new DataView(d.buffer);
  d[0] = 1;
  d[1] = 1;
  d[2] = 253;
  d[3] = f.flags;
  v.setUint16(4, f.maxSupply, true);
  v.setUint16(6, f.minted, true);
  v.setUint16(8, 200, true);
  v.setUint32(12, 77, true);
  v.setBigUint64(16, 10_000_000n, true);
  d.set(enc.encode(creator), 24);
  d.set(enc.encode(treasury), 56);
  d.fill(0xaa, 88, 120);
  d.fill(0xbb, 184, 216);
  for (let id = 0; id < f.minted; id++) {
    const o = slotOffset(id);
    d.set(enc.encode(f.owners[id % f.owners.length]), o);
    v.setUint32(o + 32, f.prices[id] ?? 0, true);
  }
  return { d, creator, treasury };
}

describe("account", () => {
  test("decodes the header and every slot", async () => {
    const a = (await generateKeyPairSigner()).address;
    const b = (await generateKeyPairSigner()).address;
    const { d, creator, treasury } = await account({ minted: 3, maxSupply: 5000, flags: 0, owners: [a, b], prices: [0, 250_000, 5] });
    const col = decodeCollection(d);
    assert.equal(col.bump, 253);
    assert.equal(col.maxSupply, 5000);
    assert.equal(col.minted, 3);
    assert.equal(col.feeBps, 200);
    assert.equal(col.nonce, 77);
    assert.equal(col.mintPrice, 10_000_000n);
    assert.equal(col.creator, creator);
    assert.equal(col.treasury, treasury);
    assert.equal(hex(col.provenance), "aa".repeat(32));
    assert.equal(hex(col.secret), "00".repeat(32));
    assert.equal(hex(col.generatorHash), "bb".repeat(32));
    assert.deepEqual(col.slots, [
      { id: 0, owner: a, price: 0 },
      { id: 1, owner: b, price: 250_000 },
      { id: 2, owner: a, price: 5 },
    ]);
    const { slots: _, ...header } = col;
    assert.deepEqual(decodeHeader(d), header);
    assert.deepEqual(decodeHeader(d.slice(0, HEADER_LEN)), header);
    assert.deepEqual(decodeSlot(d.subarray(slotOffset(1), slotOffset(2)), 1), col.slots[1]);
    assert.deepEqual(listedSlots(col).map((s) => s.id), [2, 1]);
    assert.deepEqual(slotsOwnedBy(col, a).map((s) => s.id), [0, 2]);
  });

  test("validates the layout", async () => {
    const { d } = await account({ minted: 2, maxSupply: 10, flags: 0, owners: [SYSTEM_PROGRAM], prices: [] });
    assert.equal(isCollectionAccount(d), true);
    assert.equal(isCollectionAccount(d.subarray(0, d.length - 1)), false);
    const wrongTag = d.slice();
    wrongTag[0] = 2;
    assert.equal(isCollectionAccount(wrongTag), false);
    assert.throws(() => decodeHeader(wrongTag), /not a GL-36 collection account/);
    assert.throws(() => decodeHeader(new Uint8Array(100)), /not a GL-36 collection account/);
    assert.throws(() => decodeCollection(d.subarray(0, HEADER_LEN + SLOT_LEN)), /2 slots/);
    assert.throws(() => decodeSlot(new Uint8Array(10), 0), /36 bytes/);
  });

  test("sizes, offsets and states", () => {
    assert.equal(accountLength(0), 224);
    assert.equal(accountLength(65_535), 2_359_484);
    assert.equal(slotOffset(7), 224 + 7 * 36);
    assert.equal(HEADER_OFFSET.generatorHash + 32, 216);
    assert.equal(collectionState({ flags: 0 }), "open");
    assert.equal(collectionState({ flags: FLAG_CLOSED }), "closed");
    assert.equal(collectionState({ flags: FLAG_CLOSED | FLAG_REVEALED }), "revealed");
    assert.equal(rentExemptMinimum(36, 5_080n), 164n * 5_080n);
  });
});

describe("instructions", () => {
  test("encode the documented data layouts and account metas", async () => {
    const creator = await generateKeyPairSigner();
    const other = (await generateKeyPairSigner()).address;
    const collection = (await generateKeyPairSigner()).address;
    const provenance = new Uint8Array(32).fill(1);
    const generatorHash = new Uint8Array(32).fill(2);

    const init = initIx(PROGRAM, creator, collection, other, { nonce: 0x01020304, maxSupply: 5000, feeBps: 200, mintPrice: 10_000_000n, provenance, generatorHash });
    assert.equal(init.data?.length, 81);
    assert.equal(hex(init.data!.subarray(0, 17)), "00" + "04030201" + "8813" + "c800" + "8096980000000000");
    assert.deepEqual(init.accounts?.map((a) => a.role), [AccountRole.WRITABLE_SIGNER, AccountRole.WRITABLE, AccountRole.READONLY, AccountRole.READONLY]);
    assert.equal(init.accounts?.[3].address, SYSTEM_PROGRAM);

    const mint = mintIx(PROGRAM, creator, collection, other, 10);
    assert.equal(hex(mint.data!), "010a");
    assert.deepEqual(mint.accounts?.map((a) => a.address), [creator.address, collection, other, SLOT_HASHES, SYSTEM_PROGRAM]);

    assert.equal(hex(transferIx(PROGRAM, creator, collection, other, 258).data!), "020201");
    assert.equal(hex(listIx(PROGRAM, creator, collection, 7, 250_000).data!), "030700" + "90d00300");
    assert.equal(hex(buyIx(PROGRAM, creator, collection, other, other, 7, 250_000).data!), "040700" + "90d00300");
    assert.equal(hex(revealIx(PROGRAM, creator, collection, provenance).data!), "05" + "01".repeat(32));
    assert.equal(hex(withdrawExcessIx(PROGRAM, creator, collection).data!), "06");
    assert.equal(INSTRUCTION.withdrawExcess, 6);
  });

  test("reject arguments the program would refuse", async () => {
    const s = await generateKeyPairSigner();
    const c = s.address;
    const base = { nonce: 0, maxSupply: 10, feeBps: 0, mintPrice: 0n, provenance: new Uint8Array(32), generatorHash: new Uint8Array(32) };
    assert.throws(() => initIx(PROGRAM, s, c, c, { ...base, feeBps: 1001 }), RangeError);
    assert.throws(() => initIx(PROGRAM, s, c, c, { ...base, maxSupply: 0 }), RangeError);
    assert.throws(() => initIx(PROGRAM, s, c, c, { ...base, provenance: new Uint8Array(31) }), RangeError);
    assert.throws(() => mintIx(PROGRAM, s, c, c, 0), RangeError);
    assert.throws(() => mintIx(PROGRAM, s, c, c, 11), RangeError);
    assert.throws(() => listIx(PROGRAM, s, c, 0, 2 ** 32), RangeError);
    assert.throws(() => buyIx(PROGRAM, s, c, c, c, 0, 0), RangeError);
    assert.throws(() => transferIx(PROGRAM, s, c, c, 1.5), RangeError);
    assert.throws(() => revealIx(PROGRAM, s, c, new Uint8Array(16)), RangeError);
  });
});

describe("pda", () => {
  test("derives the collection address from creator and nonce", async () => {
    const creator = (await generateKeyPairSigner()).address;
    const nonce = new Uint8Array([5, 0, 0, 0]);
    const expected = await getProgramDerivedAddress({ programAddress: PROGRAM, seeds: [new TextEncoder().encode("col"), enc.encode(creator), nonce] });
    assert.deepEqual(await findCollection(PROGRAM, creator, 5), [expected[0], expected[1]]);
    await assert.rejects(() => findCollection(PROGRAM, creator, -1), RangeError);
  });
});

describe("price", () => {
  test("converts between SOL, lamports and price units", () => {
    assert.equal(solToPrice("0.25"), 250_000);
    assert.equal(solToPrice("1,5"), 1_500_000);
    assert.equal(solToPrice(".000001"), 1);
    assert.equal(solToPrice(0.42), 420_000);
    assert.equal(priceToSol(250_000), "0.25");
    assert.equal(priceToSol(4_294_967_295), "4294.967295");
    assert.equal(priceToSol(0), "0");
    assert.equal(priceToLamports(250_000), 250_000_000n);
    assert.equal(lamportsToPrice(250_000_000n), 250_000);
    assert.throws(() => solToPrice("0.0000001"), RangeError);
    assert.throws(() => solToPrice("5000"), RangeError);
    assert.throws(() => solToPrice("abc"), RangeError);
    assert.throws(() => lamportsToPrice(1_500n), RangeError);
  });
});

describe("logs", () => {
  test("reads events only from the GL-36 program's own frames", () => {
    const logs = [
      `Program ${PROGRAM} invoke [1]`,
      "Program 11111111111111111111111111111111 invoke [2]",
      "Program log: buy 9 9",
      "Program 11111111111111111111111111111111 success",
      "Program log: buy 7 250000",
      `Program ${PROGRAM} consumed 2901 of 200000 compute units`,
      `Program ${PROGRAM} success`,
      `Program ${PROGRAM} invoke [1]`,
      "Program log: mint 12 3",
      `Program ${PROGRAM} success`,
      `Program ${PROGRAM} invoke [1]`,
      "Program log: withdraw 18446744073709551615",
      "Program log: xfer 4",
      "Program log: list 4 0",
      "Program log: reveal",
      "Program log: init 5000",
      "Program log: something else 1",
      `Program ${PROGRAM} success`,
      "Program log: buy 1 1",
    ];
    assert.deepEqual(parseLogs(logs, PROGRAM), [
      { type: "buy", id: 7, price: 250_000 },
      { type: "mint", firstId: 12, count: 3 },
      { type: "withdraw", lamports: 18446744073709551615n },
      { type: "transfer", id: 4 },
      { type: "list", id: 4, price: 0 },
      { type: "reveal" },
      { type: "init", maxSupply: 5000 },
    ]);
  });
});

describe("errors", () => {
  test("parses program errors from logs, kit errors and messages", () => {
    assert.equal(errorName(ERR.SellerMismatch), "SellerMismatch");
    assert.equal(errorName(99), undefined);

    const fromLogs = parseProgramError([`Program ${PROGRAM} invoke [1]`, `Program ${PROGRAM} failed: custom program error: 0x6`], { programId: PROGRAM });
    assert.deepEqual(fromLogs, { code: 6, name: "SellerMismatch", program: PROGRAM });

    const system = parseProgramError(
      [
        `Program ${PROGRAM} invoke [1]`,
        "Program 11111111111111111111111111111111 invoke [2]",
        "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
        `Program ${PROGRAM} failed: custom program error: 0x1`,
      ],
      { programId: PROGRAM },
    );
    assert.equal(system?.name, undefined);
    assert.equal(system?.program, SYSTEM_PROGRAM);

    const kit = new SolanaError(SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM, { code: 4, index: 1 });
    assert.deepEqual(parseProgramError(new Error("send failed", { cause: kit })), { code: 4, name: "NotListed", instructionIndex: 1 });

    assert.deepEqual(parseProgramError(new Error("Transaction simulation failed: custom program error: 0x10")), { code: 16, name: "SameOwner" });
    assert.equal(parseProgramError(new Error("blockhash not found")), null);
  });
});

describe("seed", () => {
  test("matches sha256(domain ‖ collection ‖ secret ‖ entropy ‖ id) and the GENLOSS generator", async () => {
    const collection = (await generateKeyPairSigner()).address;
    const secret = new Uint8Array(32).fill(3);
    const entropy = new Uint8Array(32).fill(4);
    const seed = await tokenSeed({ domain: "genloss/v1", collection, secret, entropy, id: 300 });
    const expected = createHash("sha256")
      .update("genloss/v1")
      .update(new Uint8Array(enc.encode(collection)))
      .update(secret)
      .update(entropy)
      .update(Buffer.from([300 & 0xff, 300 >> 8]))
      .digest();
    assert.equal(hex(seed), expected.toString("hex"));

    const gen = await import(new URL("../../../generator/genloss-gen.js", import.meta.url).href);
    assert.equal(hex(seed), hex(gen.artSeed(new Uint8Array(enc.encode(collection)), secret, entropy, 300)));

    assert.equal(hex(await provenanceOf(secret)), createHash("sha256").update(secret).digest("hex"));
    await assert.rejects(async () => provenanceOf(new Uint8Array(3)), RangeError);
  });
});
