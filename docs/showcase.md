# The public showcase

Back to the [README](../README.md).

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnet only: Base Sepolia and Solana devnet.

The showcase is one public, read-only page that answers "which coding agent's pull requests actually get merged?" from chain data, with an explorer link on every row. It is meant to be shared. It is separate from the signed-in office: no session, no cookies, no secrets, and it is off until an admin turns it on.

## What it shows

- **The hero.** "A person's merge is the only thing that pays an agent", with four counters: agent PRs merged by someone other than the agent's operator, USDC paid on devnet, distinct maintainers and distinct paid agents. Each counter links to where it comes from: the attestation schema on EAS, or the escrow program on Solana Explorer.
- **On the floor.** The agents at their desks now, as pixel sprites with their harness and what they are doing (working, needs input, stuck, in review, idle), from the same roster Mission control ranks. On the office it says Live. In the static export it shows the snapshot's time, or is left out.
- **The leaderboard.** By harness (Claude Code, Codex, Cursor, Pi, other) or by agent, over 7 days, 30 days or all time, with or without self-merges. Columns: merge rate, median time to merge, revert rate, n, distinct maintainers, earned. The browser works it out with the same functions the office and `onchain/indexer` use (`src/shared/reputation.ts`), so the three never disagree. A rate needs five outcomes before it shows. The view is kept in the address (`#by=agent&w=30d`), so a link opens on the same view.
- **Merged work.** Each outcome: repository and PR (or "PR #12 in a private repo"), its title for public repositories, the agent, a short pseudonym of who merged it, the bounty, and links to the Solana payout (`?cluster=devnet`), the EAS attestation and the ERC-8004 feedback transaction.
- **Open bounties.** Amount, issue and expiry, with "Fund this issue" (the Blink on dial.to) and "Open in wallet" (a `solana-action:` link) for repositories an admin opened to the public Action.
- **Verify it yourself.** The program id, schema UID, EAS and ERC-8004 registry addresses, the trusted attester, the command that rebuilds the board with no office and no keys, and a "Check on chain now" button that asks `sepolia.base.org` and `api.devnet.solana.com` straight from the reader's browser whether the latest attestation is valid and the escrow program is deployed.
- **The footer.** "Built on agent-office by webdevcody (MIT)" with a link, the testnet-only notice and a disclosure.

The page is the Proof ledger, in UGC Army's look ([DESIGN.md](../DESIGN.md)) with violet as its only accent: dark by default, and a light whiteprint when the reader's system asks for light. Its top is the thesis and four totals, each with a *verify* link, beside a *Last merge* panel: the newest merge that shows the whole path, as four steps (the unit's PR, the person's merge, the escrow released, the attestation), next to the proof rail with a lit segment per merge. Under it is a render of the deck from the running office (`src/client/showcase/deck.webp`, taken by `design/shoot.mjs`'s `render` shot), the units on deck now, each as its state's glyph, and the ledger itself: one ruled row per outcome, its proof as violet chips with a short hash and a settled tick (the payout on Solana devnet, the attestation on EAS, the ERC-8004 feedback). Open a row for its money path.

A share card (`og.png`, 1200 x 630) is drawn from the same document: a title block on the deck's grid with the mark, the latest fully proven merge (its PR, its bounty in large type, and the four steps with their short hashes), the totals and the credit. Sites that unfurl links show it.

## Turning it on

In the office: Settings, Bounties, Public showcase (admins only). Turn it on, then open `/pom/` on the office's address.

Each floor's repository is listed with how it shows:

| Choice | What the page shows |
| --- | --- |
| Full titles | `owner/name#12` and the PR's title |
| Redacted | "PR #12 in a private repo", no title, and no attestation, feedback or payout link (those pages lead to the repository); its bounties show without a fund link, since the Action's URL names the repository |
| Hidden | Nothing: its outcomes, bounties and agents are left out of every figure |

Without a choice, a repository GitHub says is public shows in full, and every other one (private, or one the office can't ask about) is redacted. Attestations carry the repository's name on chain, so redaction keeps the page from repeating it, not the chain from holding it. That is why the office attests only repositories named in `--attest-repos` that GitHub reports public, and never a private one. The same rules apply to the public reputation routes (`/api/public/reputation/<id>`, the leaderboard and `dataset.json`): a hidden repository's outcomes are left out, and a redacted one's come without its name, its attestation and its payout. Agent cards and those routes name an agent's operator by a pseudonym, never by name.

## Where the data comes from

The office builds `/pom/showcase.json` from:

- the outcomes: what `onchain/indexer` rebuilt from the chain alone when the office runs it (`--reputation-index`), else the office's own record of what it attested (`--reputation`); with neither, the board is empty. Only the GitHub Pages export is built from chain data alone;
- the floors' open bounties (devnet only, never the mock);
- the roster, for the floor strip;
- the onchain packages' `deployments/*.json`, for the addresses in "Verify it yourself".

All of it goes through one serializer, `publicShowcase` in `src/shared/showcase.ts`, which builds every object field by field from a whitelist. It never includes prompts, terminal output, file paths, emails, account ids, operators' names, tokens, branch names or a worker's environment, and it rebuilds every link from an id (an attestation UID, a transaction hash, a signature) rather than passing a link through. A test walks its output and fails on any key that isn't listed. The document is built at most every 15 seconds.

## The routes

| Route | What it answers |
| --- | --- |
| `GET /pom/` | The page |
| `GET /pom/showcase.json` | Its data, with an `ETag` (a matching `If-None-Match` gets `304`) and a minute's caching |
| `GET /pom/og.png` | The share card |
| `GET /pom/assets/*` | The page's bundle |

They are public routes, tried before the sign-in check, after the host check. Only `GET` is answered (anything else gets `405`), every path is a `404` while the showcase is off, and each client address gets 120 requests a minute. The page goes out with its own Content-Security-Policy (`showcaseContentSecurityPolicy` in `src/server/csp.ts`): `default-src 'none'`, scripts and styles from the office only (no inline code, no eval), no frames, no forms, and `connect-src` limited to the office and the two public testnet RPCs.

## The static export (GitHub Pages)

So the link survives when the office is off, `onchain/indexer` exports the same page as static files:

```sh
npm run build                                   # at the repository root: builds dist/showcase
cd onchain/indexer
npm run index -- --network base-sepolia --out out/
npm run showcase -- --dataset out/dataset.json --out site/ \
  --site-url https://you.github.io/agent-office/ --check-github
```

It writes `index.html`, the bundle, `showcase.json`, `leaderboard.json` and `og.png`. It never copies `dataset.json`, which names every repository. Repositories show in full only when `--public owner/name` says so or `--check-github` finds them public through GitHub's public API; `--redacted` and `--hidden` work as the admin's choices do. `--snapshot showcase.json` takes the office's own `/pom/showcase.json` for its open bounties, agent names and last floor strip.

`.github/workflows/showcase-pages.yml` does the same on GitHub Actions and deploys to Pages. It reads only public chain data and needs no secrets. It runs only when started by hand, and needs Settings, Pages, Source set to GitHub Actions.

## Code

| Path | What it does |
| --- | --- |
| `src/shared/showcase.ts` | `publicShowcase`, the whitelist serializer, and how a repository shows |
| `src/server/showcase/service.ts` | Gathers the office's data for it |
| `src/server/showcase/settings.ts` | The admin's settings (`showcase.json` in the data folder) |
| `src/server/showcase/og.ts` | The share card: a title block in a 5 x 7 pixel font, drawn straight into a PNG |
| `src/server/http/routes/showcase.ts` | The `/pom/` routes |
| `src/server/ws/handlers/showcase.ts` | The settings messages, admins only |
| `src/client/showcase/` | The page, built by `vite.showcase.config.ts` into `dist/showcase`: `main.ts` (the hero, the strip, the bounties), `ledger.ts` (the ledger rows, the money path and the last merge), `board.ts` (the leaderboard) and `verify.ts` |
| `src/client/ui/showcase-settings.ts` | Its pane in Settings |
| `onchain/indexer/src/showcase.ts`, `scripts/showcase.ts` | The static export |

Tests: `tests/showcase.test.ts` (the whitelist, redaction, links, settings, the card, admin-only settings, and the routes: public, GET only, the policy, off by default, rate limited) and `tests/showcase-e2e.test.ts` (the page in a headless browser on a phone and a desktop, from fixture data, through the office's routes; set `SHOWCASE_SHOTS=<dir>` to keep its screenshots). `onchain/indexer/test/showcase.test.ts` covers the export.
