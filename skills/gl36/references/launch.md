# Launching a GL-36 collection

A collection is created by one `init` and nothing in it can be edited afterwards: supply (can only shrink, when the creator closes early), mint price, market fee, treasury and the generator hash. Walk the user through each decision before sending `init`, and simulate every transaction before sending it.

## 1. Freeze the generator

The generator is the code that turns a token's 32-byte seed into its content. Its sha256 goes into the header, and front ends compare the file they serve with it, so a single changed byte breaks verification for every token. Hash the exact file that will be served:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const generatorHash = createHash("sha256").update(readFileSync("generator.js")).digest();
```

To be verifiable a generator must be deterministic on every machine: no `Math.random`, time, network, fonts or `Intl`; no floating-point functions whose results differ between engines (`Math.sin`, `cos`, `exp`, `pow`, `log`, `sqrt`), use tables and integer math instead; no canvas or GPU in the computation, only to display finished pixels. Define a canonical output (for images, sha256 of the raw pixels) and publish test vectors for a few ids. Pick a seed domain such as `"myproject/v1"` and document it: front ends compute seeds with `tokenSeed({ domain, … })`.

## 2. Choose the parameters

| Parameter | Notes |
| --- | --- |
| `nonce` | Any u32 this creator hasn't used; it is the third PDA seed, so it picks the address. |
| `maxSupply` | 1–65,535. |
| `mintPrice` | Lamports per token as a `bigint`, paid to the creator. `0n` for a free mint. |
| `feeBps` | 0–1,000. Market fee on every sale, paid to `treasury`. There are no royalties. |
| `treasury` | Receives the fee; can be the creator's own address. Fund it with the rent-exempt minimum for an empty account (`getMinimumBalanceForRentExemption(0)`) before the first sale: until it holds that much, a sale whose fee is smaller fails with `InsufficientFundsForRent`. |

## 3. Initialize

```ts
import { PROGRAM_ID, findCollection, initIx } from "@gl-36/sdk";

const program = PROGRAM_ID.mainnet;
const nonce = 1;
const [collection] = await findCollection(program, creator.address, nonce);

await send(creator, [
  initIx(program, creator, collection, treasury, {
    nonce,
    maxSupply: 5_000,
    feeBps: 200,
    mintPrice: 10_000_000n,
    generatorHash,
  }),
]);
```

`init` creates the 224-byte header; the creator pays its rent (about 0.0018 SOL at 5,080 lamports per byte) and the network fee. Lamports someone sent to the address beforehand don't block it; `init` fails only if a collection already lives there, and then you pick another nonce.

## 4. Mint

The mint opens as soon as `init` lands. Anyone can call `mint` with 1–10 tokens per instruction. Front ends should show placeholders until the collection is settled.

## 5. Close and settle

The mint closes by itself when the last token is minted. To end it early, the creator calls `close`, which stops supply at the tokens minted so far:

```ts
import { closeIx, settleIx } from "@gl-36/sdk";

await send(creator, [closeIx(program, creator, collection)]);
```

At least 32 slots (about 13 seconds) after the close, anyone sends `settle`. It takes the hash of the first slot at or after `close_slot + 32` as the entropy; from then on every token's content can be computed.

```ts
await send(anyone, [settleIx(program, collection)]);
```

When the mint closes, that slot doesn't exist yet, so neither the last minter nor the creator can steer content to chosen ids, and there is no secret to keep. If nobody settles within about three minutes, the target slot leaves SlotHashes and `settle` re-arms (logs `rearm`); send it again 32 slots later. Have the front end or the launch script settle right after the close.

## 6. Withdraw surplus rent

Rent is read from the cluster at each operation. When Solana lowers it (SIMD-0437 steps from 5,080 down to 696 lamports per byte), the account holds more than it needs and the creator can take the difference out at any time:

```ts
import { withdrawExcessIx } from "@gl-36/sdk";

await send(creator, [withdrawExcessIx(program, creator, collection)]);
```

Tell the creator that this surplus includes rent minters paid for their slots, and that it all goes to the creator.

## Checklist before `init`

Generator final and hashed; nonce unused; treasury address correct and funded; fee and price as intended; a plan for who sends `settle`; every transaction simulated first.
