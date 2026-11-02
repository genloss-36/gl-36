# GL-36

[![@gl-36/sdk](https://img.shields.io/npm/v/@gl-36/sdk?label=%40gl-36%2Fsdk&color=black)](https://www.npmjs.com/package/@gl-36/sdk)
[![SDK CI](https://github.com/genloss-36/gl-36/actions/workflows/sdk.yml/badge.svg)](https://github.com/genloss-36/gl-36/actions/workflows/sdk.yml)
[![Verified build](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fverify.osec.io%2Fstatus%2FGtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb&query=%24.is_verified&label=verified%20build&color=black)](https://verify.osec.io/status/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb)
[![Solana mainnet](https://img.shields.io/badge/Solana-mainnet-black?logo=solana&logoColor=white)](https://explorer.solana.com/address/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb)
[![skills.sh](https://skills.sh/b/genloss-36/gl-36)](https://skills.sh/genloss-36/gl-36)
[![Docs](https://img.shields.io/badge/docs-gl36.org-black)](https://gl36.org)
[![License: MIT](https://img.shields.io/github/license/genloss-36/gl-36?color=black)](LICENSE)

GL-36 is an NFT standard for Solana where a token takes 36 bytes: 32 for the owner and 4 for a listing price. A whole collection lives in one program-owned account, so there are no mint, token or metadata accounts per NFT, no indexer, and trading is built into the program.

- Docs: [gl36.org](https://gl36.org)
- SDK: [`@gl-36/sdk`](packages/sdk) on npm
- Agent skill: [`skills/gl36`](skills/gl36) for Claude Code, Codex, Cursor and other coding agents
- First collection: [GENLOSS](collections/genloss), minted at [genloss.gl36.org](https://genloss.gl36.org)

> The program hasn't had a third-party audit yet. It is open source, its deployed binary is [verified by OtterSec](https://verify.osec.io/status/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb) to match this repository, and a LiteSVM suite covers normal flows and attacks: stale prices, wrong sellers and treasuries, missing signatures, foreign accounts, early or repeated settles. See [SECURITY.md](SECURITY.md).

## Repository

The standard and everything shared sits at the top level. Each mint built on it is a project of its own under `collections/`.

| Path | What it is |
|---|---|
| [`program/`](program) | The on-chain program, Rust with [Pinocchio](https://github.com/anza-xyz/pinocchio) 0.12, built to `gl36.so` (sBPF v3) |
| [`packages/sdk/`](packages/sdk) | `@gl-36/sdk`: instruction builders, account decoding, RPC reads, logs and errors on [@solana/kit](https://github.com/anza-xyz/kit), with unit and LiteSVM tests |
| [`docs/`](docs) | The docs site at gl36.org: Astro + MDX, with an account inspector |
| [`deployments/`](deployments) | `@gl-36/deployments`: where the program and every collection are deployed, per cluster |
| [`tools/cluster/`](tools/cluster) | `@gl-36/cluster`: keys, RPC and send-and-confirm helpers for deploy scripts |
| [`skills/gl36/`](skills/gl36) | An agent skill that teaches coding agents to integrate GL-36 with the SDK |
| [`collections/genloss/`](collections/genloss) | GENLOSS: its art generator, mint site and deploy script |
| [`DESIGN.md`](DESIGN.md) | Account layout, instructions, costs, and how the SDK, the docs and GENLOSS are built |

## How it works

A collection is a PDA at `["col", creator, nonce_u32_le]`. It starts as a 224-byte header and grows by 36 bytes per minted token, so the minter pays rent only for their own slot. Token `id` lives at offset `224 + id * 36`.

| Instruction | What it does |
|---|---|
| `init` | Creates the collection: supply, mint price, platform fee, generator hash |
| `mint` | Mints 1 to 10 tokens, growing the account and paying the creator |
| `transfer` | Moves a token and clears its listing |
| `list` | Sets or clears a price |
| `buy` | Pays the seller and the platform fee, then moves the token |
| `close` | Ends the mint early at the current supply |
| `withdraw_excess` | Returns rent above the minimum to the creator after a rent cut |
| `settle` | Takes the hash of a slot 32 slots after the close as the entropy; anyone can call it |

A token's content comes from a generator whose hash the collection pins at `init`, run on the seed `sha256(domain ‖ collection ‖ entropy ‖ id)`. `entropy` is the hash of a slot produced after the mint closes, so nobody, the creator included, can pick tokens in advance, and there is no secret to keep. There are no royalties.

## Getting started

Requirements: Node 24 or newer (tests and scripts run `.ts` files directly), and for the program, Rust with the [Agave CLI](https://docs.anza.xyz/cli/install) 4.x (`cargo build-sbf`). The root is one npm workspace for every JavaScript project.

```bash
cd program && cargo build-sbf
```

The binary that goes on chain is built with [solana-verify](https://github.com/Ellipsis-Labs/solana-verifiable-build) in its Docker image, so anyone can rebuild it byte for byte and compare the hash with the deployed program. The program is [verified by OtterSec](https://verify.osec.io/status/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb) against this repository.

```bash
cd program && solana-verify build --base-image solanafoundation/solana-verifiable-build:4.3.0 --library-name gl36 --arch v3
```

```bash
npm install && npm test
```

`npm test` runs the SDK's tests (byte layouts, builders, log and error parsing, prices and seeds, then the LiteSVM suite against `program/target/deploy/gl36.so`: normal flows and attacks such as stale prices, wrong sellers, creators or treasuries, missing signatures, a foreign account passed as the collection, a deposit sent to the collection address before `init`, an overflowing mint price, settling too early, twice or after the target slot has left SlotHashes, and withdrawals by anyone but the creator) and each collection's own tests. Without a built program the LiteSVM part is skipped.

| Command | Does |
|---|---|
| `npm run docs` | Docs site dev server |
| `npm run genloss` | GENLOSS mint site dev server |
| `npm run check` | `astro check` for both sites |
| `npm run build` | Builds the SDK to `packages/sdk/dist` |

## Mainnet

Program: [`GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb`](https://explorer.solana.com/address/GtUakBxu2UXwv68PkLYmkzyAUtLXwqhtbi7W8GUmPmTb). Every collection on it is listed in [`deployments/mainnet.json`](deployments/mainnet.json) with the project it belongs to. The docs show all of them; each mint site shows its own.

To deploy your own copy, put the deployer keypair in `.keys/deployer.json` (the folder is git-ignored), deploy `gl36.so` with its keypair from `program/target/deploy/`, then run a collection's deploy script, for example `npm run launch -w genloss`. Set `RPC_URL` to use another endpoint.

## Agent skill

[`skills/gl36`](skills/gl36/SKILL.md) gives a coding agent what it needs to build on GL-36 correctly: the account model, the SDK calls for reading, minting, listing, buying and transferring, price units, the stale-listing guard in `buy`, error and log parsing, closing and settling, and a launch walkthrough, with the byte layout in `references/`. It lives in this repository in the [skills.sh](https://skills.sh/genloss-36/gl-36) layout, so one command installs it into any project:

```bash
npx skills add genloss-36/gl-36
```

gl36.org serves the same skill as a well-known endpoint, so `npx skills add https://gl36.org` works too.

The [Quickstart](https://gl36.org/docs/quickstart/) and the landing page also offer a prompt to paste into an agent: it installs the skill and the SDK, checks them against mainnet and asks what to build.

## Adding a collection

1. Create `collections/<name>/` with a `package.json` named `<name>`: its generator, its site if it has one, a deploy script and tests. [GENLOSS](collections/genloss) is the reference.
2. The deploy script uses `@gl-36/sdk` and `@gl-36/cluster`, and writes its collections to `deployments/mainnet.json` under `projects.<name>` and `collections[].project = "<name>"`, leaving other projects' entries alone.
3. The docs pick the new collections up from the registry; nothing in the shared code changes.

## License

[MIT](LICENSE)
