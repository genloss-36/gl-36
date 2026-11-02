# Launching a GL-36 collection

A collection is created by one `init` and nothing in it can be edited afterwards: supply (can only shrink, at reveal), mint price, market fee, treasury, the generator hash and the commitment to a secret. Walk the user through each decision before sending `init`, and simulate every transaction before sending it.

## 1. Freeze the generator

The generator is the code that turns a token's 32-byte seed into its content. Its sha256 goes into the header, and front ends compare the file they serve with it, so a single changed byte breaks verification for every token. Hash the exact file that will be served:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const generatorHash = createHash("sha256").update(readFileSync("generator.js")).digest();
```

To be verifiable a generator must be deterministic on every machine: no `Math.random`, time, network, fonts or `Intl`; no floating-point functions whose results differ between engines (`Math.sin`, `cos`, `exp`, `pow`, `log`, `sqrt`), use tables and integer math instead; no canvas or GPU in the computation, only to display finished pixels. Define a canonical output (for images, sha256 of the raw pixels) and publish test vectors for a few ids. Pick a seed domain such as `"myproject/v1"` and document it: front ends compute seeds with `tokenSeed({ domain, … })`.

## 2. Commit to a secret

```ts
import { randomBytes } from "node:crypto";
import { provenanceOf } from "@gl36/sdk";

const secret = new Uint8Array(randomBytes(32));
const provenance = await provenanceOf(secret);
```

Store `secret` offline, like a private key. It is needed once, for `reveal`, and the program accepts only its exact preimage: if it is lost the collection can never be revealed; if it leaks before the mint closes, anyone can compute content in advance and pick tokens.

## 3. Choose the parameters

| Parameter | Notes |
| --- | --- |
| `nonce` | Any u32 this creator hasn't used; it is the third PDA seed, so it picks the address. |
| `maxSupply` | 1–65,535. |
| `mintPrice` | Lamports per token as a `bigint`, paid to the creator. `0n` for a free mint. |
| `feeBps` | 0–1,000. Market fee on every sale, paid to `treasury`. There are no royalties. |
| `treasury` | Receives the fee; can be the creator's own address. |

## 4. Initialize

```ts
import { PROGRAM_ID, findCollection, initIx } from "@gl36/sdk";

const program = PROGRAM_ID.mainnet;
const nonce = 1;
const [collection] = await findCollection(program, creator.address, nonce);

await send(creator, [
  initIx(program, creator, collection, treasury, {
    nonce,
    maxSupply: 5_000,
    feeBps: 200,
    mintPrice: 10_000_000n,
    provenance,
    generatorHash,
  }),
]);
```

`init` creates the 224-byte header; the creator pays its rent (about 0.0018 SOL at 5,080 lamports per byte) and the network fee. If an account already exists at that address, pick another nonce.

## 5. Mint

The mint opens as soon as `init` lands. Anyone can call `mint` with 1–10 tokens per instruction. Front ends should show placeholders until reveal.

## 6. Close and reveal

The mint closes by itself when the last token is minted. To end it early, call `reveal` while it is still open: that closes it at the current supply and reveals in the same step.

```ts
import { revealIx } from "@gl36/sdk";

await send(creator, [revealIx(program, creator, collection, secret)]);
```

The entropy is the latest slot hash at the moment the mint closes, unknown to the creator when they committed to the secret, so neither collectors nor the creator can steer content to chosen ids.

## 7. Withdraw surplus rent

Rent is read from the cluster at each operation. When Solana lowers it (SIMD-0437 steps from 5,080 down to 696 lamports per byte), the account holds more than it needs and the creator can take the difference out at any time:

```ts
import { withdrawExcessIx } from "@gl36/sdk";

await send(creator, [withdrawExcessIx(program, creator, collection)]);
```

Tell the creator that this surplus includes rent minters paid for their slots, and that it all goes to the creator.

## Checklist before `init`

Generator final and hashed; secret generated and stored offline; nonce unused; treasury address correct; fee and price as intended; every transaction simulated first.
