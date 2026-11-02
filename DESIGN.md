# Design

GL-36 is the technology: an NFT standard on Solana where one token takes 36 bytes. GENLOSS (generation loss) is the first mint on it. The mint lives at `genloss.gl36.org` (`collections/genloss/site/`), the technology docs at `gl36.org` (`docs/`). The program crate is `gl36`; the GENLOSS art generator is `collections/genloss/generator/genloss-gen.js`. Shared code sits at the top level; each mint is a project under `collections/` (see section 8).

A collection of up to 65,535 tokens is one account holding an array of slots. Art is generated from a seed in the browser, and the market is part of the program. There is no backend, no indexer and no Merkle tree.

## 1. Collection account

The collection is a PDA at `["col", creator, nonce_u32_le]`, owned by the program. The nonce lets one creator deploy any number of collections without redeploying the program.

Header, 224 bytes, little-endian:

| Offset | Size | Field | Meaning |
|---|---|---|---|
| 0 | 1 | `tag` | `0x01`, marks a collection account |
| 1 | 1 | `version` | `1` |
| 2 | 1 | `bump` | PDA bump |
| 3 | 1 | `flags` | bit 0: settled (entropy set); bit 1: mint closed |
| 4 | 2 | `max_supply` | u16; `close` lowers it to `minted` |
| 6 | 2 | `minted` | u16 |
| 8 | 2 | `fee_bps` | platform fee, at most 1000 (10%) |
| 10 | 2 | | reserved |
| 12 | 4 | `nonce` | u32 |
| 16 | 8 | `mint_price` | lamports, may be 0 |
| 24 | 32 | `creator` | receives the mint price; the only signer allowed to `close` and `withdraw_excess` |
| 56 | 32 | `treasury` | receives the platform fee |
| 88 | 8 | `close_slot` | u64, the slot in which the mint closed or `settle` re-armed; 0 while open |
| 96 | 56 | | reserved |
| 152 | 32 | `entropy` | hash of the first slot at or after `close_slot + 32`, written by `settle` |
| 184 | 32 | `generator_hash` | sha256 of the generator file |
| 216 | 8 | | reserved |

Slots start at byte 224; `slot[id]` is 36 bytes at `224 + id * 36`:

| Offset | Size | Field |
|---|---|---|
| 0 | 32 | `owner` |
| 32 | 4 | `price`: u32 in units of 1,000 lamports; `0` means not listed; the maximum is about 4,294 SOL |

The account is created at header size. Each mint grows it by `count * 36` bytes and the minter pays the rent difference, so the account is always exactly `224 + minted * 36` bytes. The runtime caps growth at 10,240 bytes per instruction; batches are capped at 10.

### Art seed

```
art_seed(id) = sha256("genloss/v1" ‖ collection ‖ entropy ‖ id_u16_le)
```

- There is no creator secret. The mint closes on the last mint at sell-out or when the creator calls `close`; either records `close_slot`.
- `settle`, which anyone can send, takes the hash of the first slot at or after `close_slot + 32` from SlotHashes. That slot doesn't exist when the mint closes, so neither the last minter nor the creator can steer the art. The only influence left is the leader of that slot, who would have to build and discard blocks within 400 ms.
- SlotHashes holds 512 slots. If `settle` comes after the target slot has dropped out, it re-arms: `close_slot` moves to the current slot and the next `settle` 32 slots later fixes the entropy. Re-arming only helps someone who already knows the old result and could keep everyone else from settling for three minutes, so front ends settle as soon as they see a closed collection.
- Until `settle`, the site shows static noise for every piece.

## 2. Instructions

The first data byte is the instruction tag; arguments follow, little-endian. W = writable, S = signer.

| # | Instruction | Arguments | Accounts | Effect |
|---|---|---|---|---|
| 0 | `init` | nonce u32, max_supply u16, fee_bps u16, mint_price u64, generator_hash [32] | creator WS, collection W, treasury, system | Checks the PDA, then creates the account at header size. Lamports already sent to the address are kept and topped up to the rent minimum, so a deposit can't block `init`. |
| 1 | `mint` | count u8 (1..=10) | minter WS, collection W, creator W, system | Grows the account, takes `rent_min(new_len) − lamports` and `mint_price * count` from the minter, writes the slots. At `minted == max_supply` it records `close_slot` and closes the mint. |
| 2 | `transfer` | id u16 | owner S, collection W, new_owner | Sets `owner` and clears `price`. |
| 3 | `list` | id u16, price u32 | owner S, collection W | Sets the price; `0` delists. |
| 4 | `buy` | id u16, max_price u32 | buyer WS, collection W, seller W, treasury W, system | Requires `price > 0`, `owner == seller`, `price <= max_price`, `buyer != seller`. Pays the fee to the treasury and the rest to the seller, then sets `owner = buyer`, `price = 0`. |
| 5 | `close` | | creator S, collection W | Requires an open mint. Sets `max_supply = minted`, records `close_slot`, closes the mint. |
| 6 | `withdraw_excess` | | creator WS, collection W | Moves `lamports − rent_min(len)` to the creator. Needed after each rent cut. |
| 7 | `settle` | | collection W, SlotHashes | Requires a closed, unsettled mint and a slot past `close_slot + 32`. Writes that slot's hash (or the next produced one) as `entropy`; re-arms if it has left SlotHashes. |

Every instruction checks that the collection is owned by the program with the right `tag` and `version`; that `creator` and `treasury` match the header; that the SlotHashes address is the sysvar; signers and writability; `id < minted`. Arithmetic is checked. Each failure has its own `Custom(code)`, 1 to 18, listed in `program/src/error.rs` and exported by the SDK as `ERR`.

Events are logged for the site's history: `mint <first_id> <count>`, `list <id> <price>`, `buy <id> <price> <buyer>`, `xfer <id> <to>`, `close <minted>`, `settle`, `rearm`.

There are no royalties: they would cost an extra CPI and account in `buy`, and free `transfer` would route around them anyway. The platform fee is configurable, and `fee_bps = 0` turns it off. Bids and offers, mint pausing and allowlists are not in v1.

## 3. Costs

Rent is read from the `Rent` sysvar at the time of each operation. Under SIMD-0437 it is 5,080 lamports per byte now and is scheduled to fall to 696.

| | 5,080 lamports/byte | 696 lamports/byte |
|---|---|---|
| Collection header (creator) | ≈ 0.0018 SOL | ≈ 0.00025 SOL |
| One token, 36 bytes (minter) | 182,880 lamports ≈ 0.00018 SOL | 25,056 lamports |
| 5,000 tokens | ≈ 0.92 SOL, paid by minters | ≈ 0.126 SOL |
| Program, 21.8 KB | ≈ 0.11 SOL, refundable | ≈ 0.015 SOL |

Measured, instructions cost between about 400 compute units (`transfer`) and 3,300 (`init`, `mint` of 10).

## 4. GENLOSS generator

[`collections/genloss/generator/genloss-gen.js`](collections/genloss/generator/genloss-gen.js), version `genloss-gen/5`: abstract compositions destroyed by simulated JPEG. One dependency-free ES module that runs in Node and browsers. Its sha256 is the collection's `generator_hash`.

- **API.** `generate(seed, onStage?)` returns `{ size, rgb, traits }` with a 256×256×3 RGB buffer; `onStage` sees every JPEG generation. `traits(seed)` computes traits without rendering. `artSeed(collection, entropy, id)` and `previewSeed(id)` build seeds.
- **Canonical output** is `sha256(rgb)`. PNGs made through a canvas are for display only.
- **Pipeline.** The composition is drawn at 512×512. With an overlay, a second composition is blended in by `|a − b|` or `a ^ b`. The result is box-filtered to 256×256, then optionally "fried", then put through N JPEG generations. Some generations re-upload: downscale 2–3×, JPEG, bilinear upscale. Datamosh lands mid-way so later generations re-compress its edges.
- **JPEG.** The lossy part of JPEG is reproduced exactly: integer RGB → YCbCr as in libjpeg, chroma subsampling, 8×8 DCT with a literal matrix, quantisation with the Annex K tables and libjpeg quality scaling, inverse DCT. Entropy coding is lossless and skipped.
- **Glitch** corrupts quantised coefficients in some blocks: boosted high frequencies, a DC jump, a transposed block, a stray basis pattern, the previous block repeated, detail dropped.
- **Mosh.** Slices shifts horizontal bands, sometimes swapping channels. Shuffle duplicates 8, 16 or 32 px blocks. Smear stretches a row or column to the edge.
- **Chroma shift** moves the Cb and Cr planes in opposite directions.
- **Determinism.** Trigonometry comes from tables (the DCT matrix, a 256-entry Q14 sine); noise is integer value noise; square roots are integer. No canvas, `Math.sin/cos/exp/pow/log/sqrt/random`, fonts or `Intl` in any computation. All state is per call: every buffer that carries data between blocks is reset per plane.
- **PRNG.** sfc32, one stream per aspect: `sha256(seed ‖ "traits" | "composition" | "genloss" | "glitch" | …)`.
- **Verification.** [`collections/genloss/generator/vectors.json`](collections/genloss/generator/vectors.json) holds `sha256(rgb)` for preview ids 0–35; `npm run generator -w genloss -- 36` re-renders them twice. `collections/genloss/test/` checks that its seeds equal the SDK's `tokenSeed` with the `genloss/v1` domain and that the registry pins its hash.

| Trait | Values (weight) |
|---|---|
| Composition | DCT Basis 17%, Spectrum 16%, Bitwise 15%, Plasma 12%, Geometry 11%, Rings 8%, Waves 8%, Color Field 5%, Contours 4%, Grid 4% |
| Palette | Bauhaus, Rothko, Vapor, Solana, Acid, Earth, Ice, Candy, Ink, Mono, Noir (7–10% each) |
| Compression | Lossless 2%, Compressed 30%, Crushed 35%, Mangled 20%, Deep Fried 10%, Legendary 3% |
| Overlay (and its layer) | None 60%, Difference 25%, XOR 15% |
| Glitch | None 45%, Light 30%, Heavy 18%, Total 7% |
| Chroma | Aligned 75%, Shifted 25% |
| Mosh | None 55%, Slices 20%, Shuffle 15%, Smear 10% |

| Compression | Generations | Quality | Notes |
|---|---|---|---|
| Lossless | 0 | | the clean composition |
| Compressed | 1–2 | 10–20 | often a 2× re-upload |
| Crushed | 3–5 | 6–12 | 2–3× re-uploads |
| Mangled | 5–9 | 4–9 | light frying |
| Deep Fried | 6–10 | 4–8 | saturation, contrast, sharpening |
| Legendary | 40–60 | 1–3 | 4:1 chroma subsampling; only blocks remain |

## 5. GENLOSS mint site (`collections/genloss/site/`)

- **Stack.** Astro 7, static output, two pages: `/` in English and `/zh/` in Simplified Chinese. React islands, nanostores for shared state, @solana/kit for transactions.
- **Wallets.** Any Wallet Standard wallet: kit builds the transaction and the wallet signs and sends it through its own RPC (`solana:signAndSendTransaction`), so the site's RPC only reads and stays clear of the provider's `sendTransaction` limit. A wallet without that feature signs (`solana:signTransaction`) and the page sends.
- **Data.** No indexer: the whole collection is one `getAccountInfo`, polled every 12 seconds and after each transaction.
- **Art integrity.** The generator is not bundled. It is served byte for byte from `public/gen/genloss-gen.js` (copied by `predev` and `prebuild`), hashed by the page, compared with the collection's `generator_hash`, and the result is shown in the footer. Rendering runs in a pool of Web Workers.
- **Collections.** The site reads `@gl-36/deployments` and keeps only collections whose `project` is `genloss`. With none recorded yet, the mint panel and the gallery say the mint hasn't opened. Once a collection is closed but not settled, the mint panel offers "Reveal the art", which sends `settle` from the connected wallet.
- **Design language,** derived from JPEG:
  - warm ink (#ebe7e0) on black; only the art is in full colour. The Cb/Cr pair (blue #3d5afe, red #ff4930) appears only in motion: hover, focus and the hero;
  - Archivo Variable, its width axis used as "quality": headings sit at 68% width and resolve from a wider cut in 8 steps;
  - rectangular forms (2 px radius), an 8 px grid, block progress bars;
  - quantised motion: pieces load like progressive JPEG (8 → 16 → … → 256 px), panels open in steps, the cursor is a block snapping to the 8 px grid.
- **Live hero** ([`collections/genloss/site/src/gl/live-loss.ts`](collections/genloss/site/src/gl/live-loss.ts)): a WebGL2 feedback loop re-saves a piece as JPEG 30 times a second (YCbCr → 8×8 DCT → quantisation → inverse DCT, four separable passes). The cursor drags blocks like datamosh and lets the original show through; fast movement lowers the quality. Without WebGL2 and float textures it shows a still.
- **Decay story.** A piece sticks to the screen while scrolling steps through its generations.
- **Sound** ([`collections/genloss/site/src/audio/engine.ts`](collections/genloss/site/src/audio/engine.ts)): generative ambient in WebAudio, no samples, in the spirit of Selected Ambient Works. Each piece gets its own song. The composition picks one of six styles: beatless pads, a dark drone, a half-time drum machine, a pulse arpeggio over four on the floor, a music-box melody, or a slow broken beat. The seed picks tempo, key, chords, voicing, timbres, patterns and melody. The palette picks the mode, compression darkens the master, generations and mosh add tape wow, glitch makes it skip, chroma widens the stereo. Sound is on by default and starts with the first gesture; "Listen" in a piece's card hands the music to that piece with a tape-stop transition.
- **SEO and previews.** `collections/genloss/site/src/layouts/Base.astro` sets the title, description, canonical, hreflang (en, zh-CN, x-default), OpenGraph and Twitter cards; `robots.txt` and `sitemap.xml` are endpoints. Absolute URLs come from `https://genloss.gl36.org` or `SITE_URL`. The cards `public/og.png` and `og-zh.png` (1200×630) are drawn by `collections/genloss/site/scripts/og/`: mark and name, one title, two lines and a row of seven real pieces.
- **Accessibility.** Text contrast is at least 4.5:1; the piece card is a modal dialog that traps and restores focus; reduced motion stops every animation.

## 6. Docs site (`docs/`)

- **What it is.** The GL-36 technology site: rent savings, account layout, instructions, errors, the SDK, deployments. GENLOSS appears only under Deployments.
- **Stack.** Astro 7, static output, MDX pages (`docs/src/content/docs/*.mdx`, sidebar order in `docs/src/data/nav.ts`), no React: interaction is plain `<script>`. The decoder comes from the SDK source (`packages/sdk/src`) through the `@gl-36/sdk` alias, and addresses from the `@gl-36/deployments` registry, so the docs follow the last deploy of every project. The Deployments page lists each collection with its project and site.
- **Design.** Black and white, large sentence-case headings without full stops (system SF Pro Bold, −0.03em tracking, 0.94 leading), small 13–14 px UI, hairlines, 24 px card radius, an inverted footer. The mark (a 16-unit and a 5.66-unit square, 32 : 4 by area) has squircle corners drawn as Bézier paths, in the favicon and the OG card too. Dark theme by default with a remembered light toggle. Code uses Xcode Default colours in both themes (`docs/src/lib/code-themes.mjs`, Shiki with CSS variables).
- **Hero.** The live Genesis account fills the first screen as a raster: one cell per byte, dot size by byte value; the first rows are the header, then one row per token (32 owner bytes and 4 price bytes). Dots are muted (`--field-ink`) and fade towards the heading; the field under the cursor lights up and is decoded in a caption. On narrow screens cells stay at least 22 px and rows run off the right edge; below 960 px the caption moves under the heading. Offline, or before Genesis exists, it draws a plausible example.
- **Motion.** Critically damped springs (`--spring`, `--spring-slow`). One choreographed load scene; everything else answers input. Page transitions cross-fade with `@view-transition`. Reduced motion turns it all off.
- **Accessibility and SEO.** No axe-core violations on any page in either theme. Tables scroll in a focusable wrapper only when they overflow. The mobile menu moves focus in, makes the page `inert` and closes on Escape. Canonical, OpenGraph, Twitter cards and JSON-LD (WebSite; TechArticle and BreadcrumbList on doc pages); `sitemap.xml` and `robots.txt` endpoints; `noindex` on 404. Absolute URLs come from `https://gl36.org` or `SITE_URL`. `python3 docs/scripts/og.py` draws the OG card and touch icon from the live collection bytes.
- **Search.** ⌘K / Ctrl+K, `/` or the header button. `/search.json` is built at build time with one entry per section, so results jump to headings; code stays indexed, so `withdraw_excess` and `0x6` are found.
- **Inspector** (`/inspector/?address=…`): any collection address → summary, header, byte map and slot table, with a custom RPC saved locally.

## 7. SDK (`packages/sdk/`)

- **Package.** `@gl-36/sdk`, MIT, ESM with types, `@solana/kit` ^8.5 as the only (peer) dependency, `sideEffects: false`. Node 20.19+ and browsers.
- **Contents.** `PROGRAM_ID` per cluster and layout constants with field offsets; `findCollection`; the eight instruction builders, which throw a `RangeError` for arguments the program would refuse; `decodeCollection`, `decodeHeader`, `decodeSlot`, `isCollectionAccount`, `collectionState`, `entropySlot`, `listedSlots`, `slotsOwnedBy`; RPC reads `fetchCollection`, `fetchHeader` and `fetchSlot` (via `dataSlice`), `findCollections` (`getProgramAccounts` with `memcmp` on tag, version and creator) and `getLamportsPerByte`; `parseLogs`, which only accepts lines from the GL-36 program's own invoke frames; `parseProgramError`, which reads kit errors, their causes, simulation logs or messages and does not mistake a System Program error for a GL-36 one; exact SOL ↔ price-unit conversions; `tokenSeed` on WebCrypto.
- **Source and build.** Sources import each other with `.ts` extensions; `tsc` with `rewriteRelativeImportExtensions` emits `dist/` (JS, `.d.ts` and maps). The `exports` map has a `source` condition pointing at `src/index.ts`, so deploy scripts run from source with `node --conditions=source`, while the sites alias the source directly in Vite and TypeScript and dedupe kit.
- **Tests.** `npm test` at the root: unit tests (byte layouts, builders and validation, decoding, logs, errors, prices, PDA, seeds checked against the GENLOSS generator) and the LiteSVM suite against `program/target/deploy/gl36.so`, skipped when the program isn't built. `prepack` runs typecheck, tests and build; the tarball is about 21 kB.
- **Workspace.** The root `package.json` is one npm workspace for `packages/*`, `deployments`, `tools/*`, `docs` and `collections/*`, with one lockfile and one copy of kit and Astro.
- **Release.** 0.x tracks the mainnet program. Publishing needs the `gl36` npm organisation; `publishConfig` asks for public access and provenance.

- **Agent skill.** `skills/gl36/SKILL.md` (skills.sh layout) teaches coding agents to integrate GL-36 through the SDK: the account model, reads, transactions, price units, the `buy` guard, errors, logs, content, close and settle; `references/protocol.md` has the byte layout, instruction layouts and errors, `references/launch.md` the launch walkthrough. Every TypeScript example in it is type-checked against the published SDK types, and the read examples were run against a live cluster. The docs site serves the same folder at `/.well-known/agent-skills/` (discovery schema 0.2.0: an `index.json` and a reproducible `gl36.tar.gz` with its sha256), so `npx skills add https://gl36.org` installs it without a Git host, and the landing page and Quickstart offer a copy-paste prompt that has an agent install the skill and the SDK.

## 8. Projects and deployments

- **Layout.** Shared: `program/`, `packages/sdk/` (`@gl-36/sdk`), `docs/`, `deployments/` (`@gl-36/deployments`), `tools/cluster/` (`@gl-36/cluster`: keys, RPC and send-and-confirm helpers). Per mint: `collections/<name>/`, one workspace package named after the project, holding its generator, its site (`site/`, run with `astro --root site`), its deploy script and tests.
- **Registry.** `deployments/mainnet.json` has `cluster`, `rpc`, `programId`, `projects` (title, site and generator hash per project) and `collections` (id, project, title, address, supply, mint price). A project's deploy script rewrites only its own entries and keeps the rest.
- **GENLOSS deploy.** `collections/genloss/scripts/launch.ts` (`npm run launch -w genloss`) creates Genesis (5,000 supply, 0.01 SOL mint) if it doesn't exist, funds the treasury up to the rent-exempt minimum so that small sales can pay their fee, and records the collection in the registry. It keeps the registry's public RPC, so a private `RPC_URL` never lands in the repository. Collection nonces are derived from the generator's hash, so after a generator change a new run creates a collection whose `generator_hash` matches.

## Sources

- Rent: [solana.com/upgrades/reduced-rent](https://solana.com/upgrades/reduced-rent), [SIMD-0437 step 2](https://solanacompass.com/news/simd-0437-step-2-goes-live-on-solana-mainnet-rent-drops-to-5080-lamports-per-byte), [Chainstack: reclaiming excess rent](https://docs.chainstack.com/docs/solana-rent-reduction-reclaim-excess-rent)
- Limits: [100M CU blocks](https://solana.com/upgrades/100m-cu-blocks), [larger transactions](https://solana.com/upgrades/larger-transaction-sizes)
- Toolchain: [Anza CLI install](https://docs.anza.xyz/cli/install), [Pinocchio](https://github.com/anza-xyz/pinocchio), [pinocchio-system](https://docs.rs/pinocchio-system/latest/pinocchio_system/), [sol_sha256](https://docs.rs/solana-define-syscall/latest/solana_define_syscall/definitions/fn.sol_sha256.html)
- Testing: [LiteSVM for TypeScript](https://solana.com/docs/tools/litesvm/typescript/getting-started)
