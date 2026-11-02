# GL-36 protocol reference

Layout version 1 of program `gl36` 0.1.0. All integers are little-endian. Use this when decoding without the SDK, explaining bytes, or debugging a raw transaction.

## Contents

- [Collection account](#collection-account)
- [Slot](#slot)
- [Instructions](#instructions)
- [Errors](#errors)
- [Logs](#logs)
- [Limits](#limits)

## Collection account

A program-derived address with seeds `["col", creator, nonce as u32 LE]`. Its length is always `224 + minted × 36`; the program rejects an account where this doesn't hold.

| Offset | Size | Field | Type | Meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | `tag` | u8 | Always `0x01` |
| 1 | 1 | `version` | u8 | Layout version, `1` |
| 2 | 1 | `bump` | u8 | PDA bump |
| 3 | 1 | `flags` | u8 | bit 0 settled, bit 1 closed |
| 4 | 2 | `max_supply` | u16 | Lowered to `minted` when the creator closes the mint early |
| 6 | 2 | `minted` | u16 | Number of slots after the header |
| 8 | 2 | `fee_bps` | u16 | Market fee, at most 1,000 |
| 10 | 2 | — | | Reserved |
| 12 | 4 | `nonce` | u32 | Third PDA seed |
| 16 | 8 | `mint_price` | u64 | Lamports per token, to the creator |
| 24 | 32 | `creator` | pubkey | Receives mint proceeds; signs `close` and `withdraw_excess` |
| 56 | 32 | `treasury` | pubkey | Receives the market fee |
| 88 | 8 | `close_slot` | u64 | Slot in which the mint closed or was re-armed; zero while open |
| 96 | 56 | — | | Reserved |
| 152 | 32 | `entropy` | bytes | Hash of the first slot at or after `close_slot + 32`; zero until `settle` |
| 184 | 32 | `generator_hash` | bytes | sha256 of the generator |
| 216 | 8 | — | | Reserved |

States never go backwards: open (`flags = 0`) → closed (`0b10`, by selling out or by `close`) → settled (`0b11`, by `settle`).

## Slot

Slot `id` is at byte `224 + id × 36`.

| Offset | Size | Field | Type |
| ---: | ---: | --- | --- |
| 0 | 32 | `owner` | pubkey |
| 32 | 4 | `price` | u32, units of 1,000 lamports, 0 = not listed |

## Instructions

Data starts with a one-byte tag, then the arguments. Accounts in the order shown; W writable, S signer.

| Tag | Instruction | Data after the tag | Accounts |
| ---: | --- | --- | --- |
| 0 | `init` | nonce u32, max_supply u16, fee_bps u16, mint_price u64, generator_hash [32] | creator WS, collection W, treasury, System Program |
| 1 | `mint` | count u8 (1–10) | minter WS, collection W, creator W, System Program |
| 2 | `transfer` | id u16 | owner S, collection W, new owner |
| 3 | `list` | id u16, price u32 (0 delists) | owner S, collection W |
| 4 | `buy` | id u16, max_price u32 | buyer WS, collection W, seller W, treasury W, System Program |
| 5 | `close` | — | creator S, collection W |
| 6 | `withdraw_excess` | — | creator WS, collection W |
| 7 | `settle` | — | collection W, SlotHashes sysvar |

SlotHashes sysvar: `SysvarS1otHashes111111111111111111111111111`. System Program: `11111111111111111111111111111111`.

Behaviour worth knowing:

- `mint` transfers `max(0, rent_min(new_len) − lamports)` from the minter to the collection, then `mint_price × count` to the creator, then appends slots owned by the minter. The mint that reaches `max_supply` records the current slot as `close_slot` and sets closed.
- `buy` checks, in order: buyer ≠ seller, seller still owns the slot, treasury matches, the slot is listed, price ≤ `max_price`. It pays `price × 1,000 − fee` to the seller and `fee = price × 1,000 × fee_bps / 10,000` to the treasury, then sets the owner to the buyer and the price to 0.
- `transfer` sets the new owner and the price to 0; transferring to yourself fails.
- `close` (creator only, open mint only) lowers `max_supply` to `minted`, records `close_slot` and sets closed.
- `settle` (anyone, closed mint only) finds the first slot at or after `close_slot + 32` in SlotHashes, writes its hash as `entropy` and sets settled. Before that slot it fails with `TooEarly`. If the slot has already left the sysvar's 512 entries it re-arms: `close_slot` becomes the current slot, it logs `rearm` and succeeds; call it again 32 slots later.
- The seed of token `id` is `sha256(domain ‖ collection ‖ entropy ‖ id u16 LE)`; there is no creator secret.
- `withdraw_excess` moves `lamports − rent_min(len)` to the creator by editing lamports directly; with nothing to withdraw it moves zero.

## Errors

Returned as `ProgramError::Custom(code)`, shown as `custom program error: 0x…`.

| Code | Hex | Name | When |
| ---: | ---: | --- | --- |
| 1 | `0x1` | `SoldOut` | `minted + count` would exceed `max_supply` |
| 2 | `0x2` | `BadBatch` | `count` is 0 or above 10 |
| 3 | `0x3` | `NotOwner` | Signer doesn't own the slot (`transfer`, `list`) |
| 4 | `0x4` | `NotListed` | `buy` on a slot priced 0 |
| 5 | `0x5` | `PriceAboveMax` | Ask is above the buyer's `max_price` |
| 6 | `0x6` | `SellerMismatch` | Seller passed to `buy` no longer owns the slot |
| 7 | `0x7` | `SelfBuy` | Buyer and seller are the same |
| 8 | `0x8` | `NotClosed` | `settle` while the mint is open |
| 9 | `0x9` | `AlreadySettled` | `settle` twice |
| 10 | `0xa` | `MintClosed` | `mint` or `close` after the mint closed |
| 11 | `0xb` | `BadFee` | `fee_bps` above 1,000 at `init` |
| 12 | `0xc` | `BadSupply` | `max_supply` 0 at `init` |
| 13 | `0xd` | `WrongCreator` | Creator account doesn't match the header |
| 14 | `0xe` | `WrongTreasury` | Treasury account doesn't match the header |
| 15 | `0xf` | `BadId` | `id ≥ minted` |
| 16 | `0x10` | `SameOwner` | `transfer` to the current owner |
| 17 | `0x11` | `BadSysvar` | SlotHashes account passed to `settle` is wrong |
| 18 | `0x12` | `TooEarly` | `settle` before slot `close_slot + 32` has passed |

Built-in errors: `InvalidInstructionData` (unknown tag or wrong data length), `NotEnoughAccountKeys`, `MissingRequiredSignature`, `InvalidAccountOwner` (collection not owned by the program), `Immutable` (collection not writable), `InvalidAccountData` (wrong tag, version or length), `InvalidSeeds` (`init` with the wrong PDA), `ArithmeticOverflow` (`mint_price × count` doesn't fit in a u64). Insufficient funds come from the System Program's transfer CPIs, also as custom `0x1`; tell them apart by which program's `failed:` line appears first in the logs.

## Logs

One `Program log:` line per successful instruction:

| Instruction | Line |
| --- | --- |
| `init` | `init <max_supply>` |
| `mint` | `mint <first_id> <count>` |
| `transfer` | `xfer <id>` |
| `list` | `list <id> <price>` |
| `buy` | `buy <id> <price>` |
| `close` | `close <minted>` |
| `settle` | `settle`, or `rearm` when it re-arms |
| `withdraw_excess` | `withdraw <lamports>` |

Only attribute a line to GL-36 when it appears between `Program <GL-36 id> invoke [n]` and that program's `success`, with no other program's frame open in between.

## Limits

| Limit | Value |
| --- | ---: |
| Tokens per collection | 65,535 (u16) |
| Largest account | 2,359,484 bytes |
| Tokens per `mint` instruction | 10 |
| Market fee | 0–1,000 bps |
| Price unit | 1,000 lamports |
| Highest ask | 4,294,967,295 units ≈ 4,294.97 SOL |
| Rent per token | 36 bytes × the cluster rate (182,880 lamports at 5,080/byte) |
| Compute | ≈3,000 CU per mint or buy, ≈400 per list or transfer |
