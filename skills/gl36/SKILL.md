---
name: gl36
description: Build on GL-36, the Solana NFT standard where a whole collection is one program-owned account and each token is a 36-byte slot (32-byte owner, 4-byte price), with the @gl-36/sdk TypeScript package on @solana/kit. Use this skill whenever the user mentions GL-36, gl36, @gl-36/sdk, gl36.org, GENLOSS, or the program GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb, or wants to read a GL-36 collection, show its tokens in a wallet, marketplace or bot, mint, list, delist, buy or transfer GL-36 tokens, track sales from logs, launch, close or settle a GL-36 collection, decode its account bytes, or explain a "custom program error" from it, even if they only paste a collection address or an error.
license: MIT
metadata:
  author: gl36
  version: "0.1.0"
---

# GL-36

GL-36 stores an NFT collection in a single Solana account. A token is not an SPL token: it has no mint, token or metadata account. It is a 36-byte slot in its collection's account, holding who owns it and what they ask for it. Listing, buying and transferring are instructions of the same program that mints, so trading needs no marketplace program, no escrow and no indexer.

Keep this model in mind, because it changes how integrations should be written:

- **One read gives everything.** `getAccountInfo` on the collection returns every owner and every listing. There is no indexer or DAS API to query, and none is needed.
- **A token is `(collection address, id)`.** Ids are 0 to `minted − 1`, in mint order, never reused.
- **Content is computed, not stored.** A collection pins the sha256 of its generator; content is generated off-chain from a seed once the collection is settled. There is no URI or JSON metadata to fetch.
- **No royalties.** A collection may set one market fee (0–10%) paid to its treasury on every sale.

Status: program `GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb` (`PROGRAM_ID.mainnet`) on Solana mainnet. It has not been audited; say so before a user puts real funds into it.

## Setup

```bash
npm install @gl-36/sdk @solana/kit
```

`@solana/kit` (8.5 or newer) is a peer dependency: the app and the SDK share one copy. The SDK is ESM with types, runs on Node 20.19+ and in browsers, and has no other dependencies. Prefer it over decoding bytes by hand; it validates the layout and the arguments the program would reject.

## Read a collection

```ts
import { address, createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, collectionState, fetchCollection, listedSlots, priceToSol, slotsOwnedBy } from "@gl-36/sdk";

const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
const fetched = await fetchCollection(rpc, address(collectionAddress), { programId: PROGRAM_ID.mainnet });
if (!fetched) throw new Error("No account at this address");
const col = fetched.collection;

collectionState(col);
listedSlots(col).map((s) => `${s.id}: ${priceToSol(s.price)} SOL`);
slotsOwnedBy(col, address(wallet));
```

Pass `programId` so the fetch throws on an account owned by another program instead of misreading it. `collectionState` is `"open"` (minting), `"closed"` (sold out or closed early, waiting for `settle`) or `"settled"` (content can be computed).

Other reads, all taking a kit `Rpc`:

| Need | Use |
| --- | --- |
| Header only (supply, price, creator…) for a large collection | `fetchHeader(rpc, address)`: 224 bytes via `dataSlice` |
| One token without downloading the account | `fetchSlot(rpc, address, id)`: 36 bytes, `null` if not minted |
| Every collection, or every collection of one creator | `findCollections(rpc, PROGRAM_ID.mainnet, { creator })` |
| Several known collections at once | `getMultipleAccounts` then `decodeCollection(bytes)` on each |
| Live updates | `accountSubscribe` on the collection, or poll `getAccountInfo` every few seconds |

## Send transactions

Every builder returns a plain kit `Instruction`, so it fits any kit pipeline and any Wallet Standard signer. A minimal sender:

```ts
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
});

async function send(payer: TransactionSigner, instructions: Instruction[]) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(tx);
  await sendAndConfirm(tx, { commitment: "confirmed" });
}
```

Several GL-36 instructions can share one transaction, including instructions on different collections; the transaction fails as a whole if any of them fails. After sending, read the collection again rather than predicting its new state.

## Mint, list, buy, transfer

```ts
import { PROGRAM_ID, buyIx, listIx, mintIx, solToPrice, transferIx } from "@gl-36/sdk";

const program = PROGRAM_ID.mainnet;
const collection = address(collectionAddress);

await send(minter, [mintIx(program, minter, collection, col.creator, 3)]);
await send(owner, [listIx(program, owner, collection, 7, solToPrice("0.25"))]);
await send(owner, [listIx(program, owner, collection, 7, 0)]);
await send(owner, [transferIx(program, owner, collection, recipient, 7)]);

const slot = col.slots[7];
await send(buyer, [buyIx(program, buyer, collection, slot.owner, col.treasury, 7, slot.price)]);
```

What these need to get right, and why:

- **Prices are `u32` units of 1,000 lamports**, not lamports and not SOL: 0.25 SOL is `250_000`. Convert with `solToPrice` / `priceToSol` (exact decimal math) or `priceToLamports` / `lamportsToPrice`. The smallest step is 0.000001 SOL; the ceiling is about 4,294.97 SOL. A price of `0` means "not listed", so `listIx(…, 0)` delists.
- **`buyIx` takes the seller and the price the buyer saw.** The program checks the slot is still owned by that seller and still priced at or below `maxPrice`. This is the protection against front-running and stale UIs: always pass the values you displayed, never re-read them right before signing to "make it work".
- **The market fee comes out of the price.** The buyer pays exactly the ask plus network fees; the seller gets the ask minus `feeBps / 10_000`.
- **`mint` takes 1 to 10 tokens per instruction.** The minter pays `mintPrice × count` to the creator plus the rent for 36 bytes per token (182,880 lamports each at today's rate). New ids are `minted … minted + count − 1` as read before the transaction.
- **A change of owner clears the listing.** Both `buy` and `transfer` reset the price to 0.
- **Builders validate.** They throw a `RangeError` for anything the program would refuse (count outside 1–10, fee above 1,000 bps, price outside u32, 32-byte fields of the wrong size), before anything is signed.

## Errors

```ts
import { PROGRAM_ID, parseProgramError } from "@gl-36/sdk";

try {
  await send(buyer, [buyIx(program, buyer, collection, slot.owner, col.treasury, 7, slot.price)]);
} catch (e) {
  const err = parseProgramError(e, { programId: PROGRAM_ID.mainnet });
  if (err?.name === "SellerMismatch" || err?.name === "PriceAboveMax") {
    refreshAndAskAgain();
  } else throw e;
}
```

`parseProgramError` finds the custom error in a kit `SolanaError`, its `cause` chain, simulation logs, a log array or a message. Always pass `programId`: the System Program's "insufficient funds" is also `0x1`, the same code as GL-36's `SoldOut`, and with `programId` the System error comes back with `name: undefined` and `program` set to the System Program instead of being misreported. The codes users hit most:

| Name | Code | Tell the user |
| --- | --- | --- |
| `SoldOut` | `0x1` | Fewer tokens are left than requested. |
| `MintClosed` | `0xa` | The mint is over. |
| `NotOwner` | `0x3` | Only the current owner can list or transfer this token. |
| `NotListed` | `0x4` | This token isn't for sale. |
| `PriceAboveMax` | `0x5` | The price went up; refresh and confirm the new price. |
| `SellerMismatch` | `0x6` | It was just sold or moved; refresh. |
| `SelfBuy` | `0x7` | You already own it. |
| `SameOwner` | `0x10` | It already belongs to that address. |

All 17 codes are in [references/protocol.md](references/protocol.md#errors).

## History and events

Each instruction logs one line. `parseLogs` turns a transaction's `logMessages` into typed events and ignores lines from any other program in the same transaction, so a CPI can't fake a sale:

```ts
import { PROGRAM_ID, parseLogs, priceToSol } from "@gl-36/sdk";

const sigs = await rpc.getSignaturesForAddress(collection, { limit: 50 }).send();
for (const { signature, err } of sigs) {
  if (err) continue;
  const tx = await rpc.getTransaction(signature, { maxSupportedTransactionVersion: 0, encoding: "json" }).send();
  for (const event of parseLogs(tx?.meta?.logMessages ?? [], PROGRAM_ID.mainnet)) {
    if (event.type === "buy") console.log(`#${event.id} sold for ${priceToSol(event.price)} SOL`);
  }
}
```

Event types: `init`, `mint` (`firstId`, `count`), `transfer` (`id`), `list` (`id`, `price`; `price: 0` is a delist), `buy` (`id`, `price`), `close` (`minted`), `settle`, `rearm`, `withdraw` (`lamports`). RPC nodes may prune old transactions; archive events if history must be permanent.

## Showing content

Until the collection is settled (`collectionState(col) !== "settled"`), content does not exist yet: show a placeholder, never a guess. A closed collection becomes settled when anyone sends `settleIx` at least 32 slots after `col.closeSlot`; a front end can offer that as a button. After that, a token's seed is

```ts
import { tokenSeed } from "@gl-36/sdk";

const seed = await tokenSeed({ domain, collection, entropy: col.entropy, id });
```

where `domain` is fixed by the collection's generator (for GENLOSS, `"genloss/v1"`). Run the collection's published generator on the seed, and check the generator file's sha256 against `col.generatorHash` before trusting its output.

## Launching a collection

Everything about a collection is fixed by one `init`: supply, mint price, market fee, treasury and the generator hash. Read [references/launch.md](references/launch.md) before writing a launch script: it covers the generator hash, choosing a nonce, `init`, funding the treasury, closing and settling the mint, and `withdraw_excess` after rent cuts.

## Without the SDK

For other languages, or to explain bytes to a user, the layout is in [references/protocol.md](references/protocol.md): the 224-byte header with every offset, the 36-byte slot, PDA seeds, instruction data layouts and account order, and the error table. All integers are little-endian; slot `id` starts at byte `224 + id × 36`, and a valid account is exactly `224 + minted × 36` bytes long.

## More

- Docs: https://gl36.org/docs/ (Quickstart, Collection account, Market, Rent and cost, TypeScript SDK)
- Inspector, to decode any collection in a browser: https://gl36.org/inspector/?address=…
