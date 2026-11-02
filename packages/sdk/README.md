# @gl-36/sdk

TypeScript SDK for [GL-36](https://gl36.org), an NFT standard for Solana where a token takes 36 bytes: 32 for the owner and 4 for a listing price. A whole collection lives in one program-owned account, so one RPC call reads every token, owner and listing, and trading is built into the program.

Built on [`@solana/kit`](https://github.com/anza-xyz/kit). ESM with types, no other dependencies, Node 20.19+ and browsers.

> The program has not been audited.

```bash
npm install @gl-36/sdk @solana/kit
```

## Read a collection

```ts
import { address, createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, collectionState, fetchCollection, listedSlots, priceToSol } from "@gl-36/sdk";

const rpc = createSolanaRpc("https://api.mainnet-beta.solana.com");
const collection = address("<collection address>");
const fetched = await fetchCollection(rpc, collection, {
  programId: PROGRAM_ID.mainnet,
});
const col = fetched!.collection;

console.log(`${col.minted} of ${col.maxSupply} minted, ${collectionState(col)}`);
for (const slot of listedSlots(col)) console.log(slot.id, slot.owner, priceToSol(slot.price));
```

## Mint, list and buy

Builders return plain kit `Instruction`s for any transaction pipeline and any Wallet Standard signer.

```ts
import { buyIx, listIx, mintIx, parseProgramError, solToPrice } from "@gl-36/sdk";

const program = PROGRAM_ID.mainnet;
await send(me, [mintIx(program, me, collection, col.creator, 3)]);
await send(owner, [listIx(program, owner, collection, 7, solToPrice("0.25"))]);

const slot = col.slots[7];
try {
  await send(buyer, [buyIx(program, buyer, collection, slot.owner, col.treasury, 7, slot.price)]);
} catch (e) {
  if (parseProgramError(e, { programId: program })?.name === "SellerMismatch") {
    console.log("Sold or moved in the meantime");
  }
}
```

`buyIx` takes the seller and the price the buyer saw, so a stale listing fails instead of overpaying.

## API

| Area | Exports |
| --- | --- |
| Addresses | `PROGRAM_ID`, `SYSTEM_PROGRAM`, `SLOT_HASHES`, `findCollection` |
| Instructions | `initIx`, `mintIx`, `transferIx`, `listIx`, `buyIx`, `revealIx`, `withdrawExcessIx`, `INSTRUCTION` |
| RPC | `fetchCollection`, `fetchHeader`, `fetchSlot`, `findCollections`, `getLamportsPerByte` |
| Decoding | `decodeCollection`, `decodeHeader`, `decodeSlot`, `isCollectionAccount`, `collectionState`, `listedSlots`, `slotsOwnedBy` |
| Layout | `HEADER_LEN`, `SLOT_LEN`, `HEADER_OFFSET`, `SLOT_OFFSET`, `accountLength`, `slotOffset`, `rentExemptMinimum` |
| Logs and errors | `parseLogs`, `parseProgramError`, `ERR`, `errorName` |
| Prices | `solToPrice`, `priceToSol`, `priceToLamports`, `lamportsToPrice` |
| Provenance | `provenanceOf`, `tokenSeed` |

Builders throw a `RangeError` for arguments the program would refuse. Full reference: [gl36.org/docs/client](https://gl36.org/docs/client/).

## Development

From the repository root:

```bash
npm install
npm test
npm run build
```

`npm test` runs the unit tests and, if `program/target/deploy/gl36.so` is built, the LiteSVM tests against the real program.

## License

MIT
