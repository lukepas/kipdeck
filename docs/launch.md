# The launch kit and its tools

Kipdeck's launch kit for the Proof of Merge lab, and the tools that check it.

Back to the [README](../README.md).

Part of Proof of Merge, the payout layer of Kipdeck (a lab). Kipdeck is built on [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). The submission drafts, posts and calendar for the chain side live in [launch/chain](../launch/chain/README.md). This page is about the four small tools that keep them honest. They run on `tsx`, need no network and add no dependency.

## Why tools

A form rejects an answer over its limit, and a judge stops trusting a page with one wrong number. The kits are full of both: character limits, deadlines in two time zones, addresses, counts. The tools check what a person would get wrong by hand:

- a field over its character or word limit, a missing section, a video whose shots don't add up to its runtime;
- fancy punctuation, emoji or a Title Case heading (the repository's writing rules);
- a traction number that isn't one of the counts made from chain data;
- an outside link nobody opened, or an address that isn't the deployed one;
- a post that claims mainnet or talks like a token;
- a calendar or timeline that drifted from `deadlines.json`;
- a disclosure that miscounts the upstream commits our branch carries.

## The tools

| Tool | What it does |
| --- | --- |
| `launch/chain/tools/calendar.ts` | Turns `deadlines.json` into `calendar.ics` (RFC 5545, CRLF, reminders by kind) and the timeline table in the kit's README, with PT and Vilnius columns. `--check` only compares |
| `launch/chain/tools/counts.ts` | Makes `data/counts.json` from `data/leaderboard.json` (a snapshot of what `onchain/indexer` rebuilt from Base Sepolia and Solana devnet) and `onchain/solana/deployments/devnet.json`. `--refresh <dir>` first copies `leaderboard.json` from an indexer run; `--check` only compares |
| `launch/chain/tools/lint.ts` | Every rule above, on every Markdown file in `launch/chain/` and `launch/chain/posts/`. Lists `{{PLACEHOLDERS}}` still to fill without failing on them |
| `launch/chain/tools/whats-new.ts` | The disclosure's commit list since `226452e4`, our snapshot import of upstream 1bc3028. Our history starts from two such imports, and 11 upstream pull requests were re-committed in it under our name, so commits are sorted by the lists in `deadlines.json`: `upstream.imports`, `upstream.carried` (credited to their upstream authors), `fork.authors` (ours), anyone else (bots). Then every changed file by area. It prints none of our names or emails. `--json` gives the counts the demo's fork card shows; `launch/tools/whats-new.ts` runs the same code for the older kits |

`npm run launch:check` runs the first three in check mode. `npm run typecheck` includes `tsconfig.launch.json`, and `npm test` runs `tests/launch-chain-*.test.ts`: each rule on small inputs, the real kit through every rule, the tools from the command line against the kit and against a broken copy, and every doc rendered in a headless browser (skipped when no Chrome or Playwright Chromium is installed).

## Conventions in the kit

- A form answer is a fenced block: ```` ```field name="One-liner" max-chars=140 ````, with `max-chars`, `max-words` or `min-words` as the form has them.
- A field that states traction adds `sources="merged_by_others,agents_ranked"`: it may only state those counts' values from `data/counts.json`. A number typed by hand fails the linter.
- Every `https://` link must be in `launch/chain/links.json` with how it was checked. Explorers block scripted requests, so their links were checked over RPC (the transaction's status, the program's account, the contract's code).
- A post has `Status: ready` (every claim is true now, and `Built in:` names the commits, which the tests check are on this branch) or `Status: needs ...`. A ready post has no placeholders left.
- The landing copy's hero, lede, share text, credit and testnet notice are the ones on `/pom/` (`src/client/showcase/index.html`); a test compares them.

## Refreshing the numbers

```sh
cd onchain/indexer && npm install && npm run index -- --network base-sepolia --out out/
cd ../.. && npx tsx launch/chain/tools/counts.ts --refresh onchain/indexer/out
npx tsx launch/chain/tools/lint.ts     # now names every field whose numbers changed
```

Rewrite those fields to the new counts, then commit `data/leaderboard.json` and `data/counts.json` with them.

## History

The tools started on the `launch/submission-kits` branch (`launch/tools/`), written against upstream's old layout for a wider set of programs. This port keeps their checks and adds the sourced numbers, the checked links, the post rules, the shared video file and the author split in `whats-new.ts`.
