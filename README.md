# GL-36

GL-36 is an NFT standard for Solana where a token takes 36 bytes: 32 for the owner and 4 for a listing price. A whole collection lives in one program-owned account, so there are no mint, token or metadata accounts per NFT, no indexer, and trading is built into the program.

GENLOSS is the first mint on GL-36: 5,000 generative images, each saved as JPEG over and over until it fell apart. The art is not stored anywhere. Every browser draws it from an on-chain seed with a deterministic generator whose hash is pinned in the collection account.

- Mint: [genloss.gl36.org](https://genloss.gl36.org)
- Docs: [gl36.org](https://gl36.org)
- SDK: [`@gl36/sdk`](packages/sdk) on npm

> The program is unaudited and deployed on devnet only. Do not use it with real funds. See [SECURITY.md](SECURITY.md).

## Repository

| Path | What it is |
|---|---|
| [`program/`](program) | The on-chain program, Rust with [Pinocchio](https://github.com/anza-xyz/pinocchio) 0.12, built to `gl36.so` (sBPF v3) |
| [`packages/sdk/`](packages/sdk) | `@gl36/sdk`: instruction builders, account decoding, RPC reads, logs and errors on [@solana/kit](https://github.com/anza-xyz/kit), with unit and LiteSVM tests |
| [`devnet/`](devnet) | Scripts that deploy demo collections and run every instruction on a live cluster |
| [`generator/`](generator) | `genloss-gen.js`, the deterministic GENLOSS art generator, with test vectors and a preview page |
| [`web/`](web) | The GENLOSS mint site: Astro + React islands, English and Chinese |
| [`docs/`](docs) | The GL-36 docs site at gl36.org: Astro + MDX, with an account inspector |
| [`DESIGN.md`](DESIGN.md) | Account layout, instructions, generator, and how both sites are built |

## How it works

A collection is a PDA at `["col", creator, nonce_u32_le]`. It starts as a 224-byte header and grows by 36 bytes per minted token, so the minter pays rent only for their own slot. Token `id` lives at offset `224 + id * 36`.

| Instruction | What it does |
|---|---|
| `init` | Creates the collection: supply, mint price, platform fee, provenance hash, generator hash |
| `mint` | Mints 1 to 10 tokens, growing the account and paying the creator |
| `transfer` | Moves a token and clears its listing |
| `list` | Sets or clears a price |
| `buy` | Pays the seller and the platform fee, then moves the token |
| `reveal` | Publishes the creator's secret; closes the mint if it is still open |
| `withdraw_excess` | Returns rent above the minimum to the creator after a rent cut |

Each piece's art seed is `sha256("genloss/v1" ‖ collection ‖ secret ‖ entropy ‖ id)`. The creator commits to `secret` before minting, and `entropy` comes from SlotHashes when the mint closes, so nobody can pick rare pieces in advance. There are no royalties.

## Getting started

Requirements: Node 24 or newer (tests and scripts run `.ts` files directly), and for the program, Rust with the [Agave CLI](https://docs.anza.xyz/cli/install) 4.x (`cargo build-sbf`). The root is an npm workspace for `packages/sdk` and `devnet/`; `web/` and `docs/` install on their own.

```bash
cd program && cargo build-sbf
```

```bash
npm install && npm test
```

The SDK's tests cover the byte layouts, builders, log and error parsing, prices and seeds, then load `program/target/deploy/gl36.so` into LiteSVM for the normal flows and the attacks: stale prices, wrong sellers, creators or treasuries, missing signatures, a foreign account passed as the collection, wrong reveal secrets, and withdrawals by anyone but the creator. Without a built program the LiteSVM part is skipped. `npm run build` compiles the package to `packages/sdk/dist`.

```bash
node generator/check.mjs 36
```

This checks the generator's SHA-256, renders ids 0 to 35 twice to prove determinism, and rewrites `generator/vectors.json`; a diff there means the art changed. To browse pieces, serve the folder and open `preview.html`:

```bash
python3 -m http.server 4173 --directory generator
```

### Mint site

```bash
cd web && npm install && npm run dev
```

`predev` and `prebuild` copy the generator byte for byte to `public/gen/`. The page hashes that file and compares it with the collection's on-chain `generator_hash`. Builds use `https://genloss.gl36.org` for canonical and OpenGraph URLs; set `SITE_URL` to build for another origin.

### Docs site

```bash
cd docs && npm install && npm run dev
```

The docs read the program and collection addresses from `web/src/data/devnet.json`, so they follow whatever the seeding script last deployed.

## Devnet

Program: [`GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb`](https://explorer.solana.com/address/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb?cluster=devnet). Collection addresses are in [`web/src/data/devnet.json`](web/src/data/devnet.json).

To run your own deployment, put keypairs in `.keys/` (`deployer.json`, `treasury.json`, `alice.json`, `bob.json`; the folder is git-ignored), deploy `gl36.so` with its keypair from `program/target/deploy/`, then:

```bash
npm run seed -w devnet
```

It creates a 64-piece revealed Showcase and a 5,000-piece Genesis mint, and writes their addresses to `web/src/data/devnet.json`. Collections are tied to the generator's hash, so running it after a generator change creates fresh ones. `npm run e2e -w devnet` runs every instruction on the cluster and reports compute units and fees. Set `RPC_URL` to use another endpoint.

## License

[MIT](LICENSE)
