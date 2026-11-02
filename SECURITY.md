# Security

The GL-36 program has not been audited. It runs on Solana devnet only, with test SOL. Do not deploy it to mainnet or use it with real funds until it has been reviewed.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button on this repository's Security tab, not in a public issue. Include the instruction involved, the accounts and arguments, and what you expected versus what happened. A LiteSVM test in the style of `packages/sdk/test/program.test.ts` that reproduces it is the most useful form.

## Scope

- `program/`: account validation, arithmetic, lamport movements, the commit-reveal scheme.
- `generator/genloss-gen.js`: any input that renders differently across engines or runs, since every viewer must see the same art for a seed.
- `web/` and `docs/`: transaction building and signing, and anything that could make a wallet sign something other than what the page shows.
