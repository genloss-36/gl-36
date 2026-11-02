# GENLOSS

The first collection on [GL-36](../../README.md): 5,000 generative images, each saved as JPEG over and over until it fell apart. The art is not stored anywhere. Every browser draws it from an on-chain seed with a deterministic generator whose hash is pinned in the collection account.

Mint site: [genloss.gl36.org](https://genloss.gl36.org)

| Path | What it is |
|---|---|
| [`generator/`](generator) | `genloss-gen.js`, the deterministic art generator, with test vectors, `check.mjs` and a preview page |
| [`site/`](site) | The mint site: Astro + React islands, English and Chinese |
| [`scripts/launch.ts`](scripts/launch.ts) | Creates the Genesis collection and records it in `deployments/mainnet.json` |
| [`test/`](test) | Checks that the generator's seeds match `@gl-36/sdk` and that the registry pins this generator's hash |

The seed of piece `id` is `sha256("genloss/v1" ‖ collection ‖ secret ‖ entropy ‖ id_u16_le)`, the SDK's `tokenSeed` with the `genloss/v1` domain.

## Commands

Run from the repository root after `npm install`:

| Command | Does |
|---|---|
| `npm run dev -w genloss` | Mint site dev server; `predev` copies the generator byte for byte to `site/public/gen/` |
| `npm run build -w genloss` | Builds the site to `site/dist`; set `SITE_URL` to build for another origin than `https://genloss.gl36.org` |
| `npm run check -w genloss` | `astro check` for the site |
| `npm test -w genloss` | Seed and registry tests |
| `npm run generator -w genloss -- 36` | Hashes the generator, renders ids 0 to 35 twice to prove determinism and rewrites `generator/vectors.json`; a diff there means the art changed |
| `npm run launch -w genloss` | Creates Genesis if it doesn't exist yet and records it; needs keys in `.keys/` |

The page hashes the served generator and compares it with the collection's on-chain `generator_hash`. Collection nonces are derived from the generator's hash, so launching after a generator change creates a fresh collection whose `generator_hash` matches. To browse pieces without the site:

```bash
python3 -m http.server 4173 --directory collections/genloss/generator
```
