# Bounty attester GitHub Action

A JavaScript action a maintainer adds to any GitHub repository so the [Solana bounty escrow](../solana/README.md) works without running the office. When a pull request is merged, it checks the merge on GitHub and signs the escrow's claim with the repository's attester key. Paying out still needs the approver. Optionally it also writes the [Proof of Merge](../attest/README.md) attestation on Base Sepolia.

Testnets only: Solana devnet (or a local validator for tests) and Base Sepolia. There is no mainnet input, the Solana client checks the RPC's genesis hash is devnet's before it signs, and the Base attestor checks the chain id. This is part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT). It is not published to the Marketplace or anywhere else.

## What a run does

On `pull_request` with `types: [closed]`:

1. Reads the pull request from the GitHub API. Closed without merging: nothing to do.
2. Refuses the merge unless every check passes. The checks are the SDK's own `checkRelease` (`onchain/solana/sdk/src/attester.ts`), the same ones the office runs:

   | Check | How |
   | --- | --- |
   | The pull request comes from this repository, not a fork | the head repository's full name equals this one's (a deleted head counts as a fork) |
   | It is merged, with a merge commit | `merged` and `merge_commit_sha` |
   | A person merged it | `merged_by.type` is `User`, never `Bot` |
   | That person has write access or more | `GET /repos/{repo}/collaborators/{login}/permission` says `admin`, `maintain` or `write` |

3. Finds the issues it closes: `Closes #12`, `fixes owner/name#3`, `Resolves https://github.com/owner/name/issues/7` (the closing keywords GitHub knows), this repository's only.
4. For each issue, finds the live bounty (open or claimed, not expired) under the escrow program opened with this repository's attester and approver. A bounty someone opened for the same issue with other keys sits at another address and is never touched. A bounty already claimed for another merged pull request is left alone.
5. Finds the wallet to pay: the author's entry in `.github/bounty-wallets.json`, read at the pull request's base commit (so a pull request can't add its own author), then, unless `wallet-from-body: false`, a `Bounty-Wallet: <address>` line in the pull request body. No wallet: a warning, nothing claimed; add one and re-run.
6. Signs the claim with the attester key: the bounty is bound to this pull request and that wallet.
7. Then, depending on how the approver works (below): releases the bounty, prepares a release for the approver, or stops at the claim.
8. With `base-attester-key`, attests the merge with the Proof of Merge EAS schema (outcome 1, the payout's signature if it was paid in this run). A merge that closes no issue is still attested if it passed the checks.
9. Writes the job summary and the step outputs, and comments on the pull request when a bounty was involved.

A merge that fails a check is a notice and a green job; nothing is signed. The attester key is read only after the checks pass, so a fork's run, which GitHub gives no secrets, never needs it. `pull_request_target` is refused outright.

## Set it up

1. **Keys.** Make an attester and an approver with `solana-keygen new --no-bip39-passphrase --silent -o <file>` (testnet keys only, nothing of value on them). Give the attester some devnet SOL for fees. The program needs the attester and approver to differ.
2. **Bounties.** Anyone opens and funds a bounty for an issue with this attester and approver: `ao-bounty open --repo owner/name --issue N --attester <a> --approver <a>` then `ao-bounty fund ...` (see the [escrow README](../solana/README.md#the-cli)), or the office's "Fund this issue" Blink.
3. **Secrets.** Repository secrets (Settings, Secrets and variables, Actions): `BOUNTY_ATTESTER_KEY` (the attester key file's contents, the JSON array) and, if you want the merger recorded, `BOUNTY_MERGED_BY_SECRET` (16 or more random bytes). `BASE_ATTESTER_KEY` (hex) turns on the Base Sepolia attestation. Keys go in only as encrypted secrets; the action masks them in the log before doing anything else and never puts one in an error.
4. **Wallets.** Commit `.github/bounty-wallets.json`, mapping GitHub logins to Solana wallets ([example](examples/bounty-wallets.json)). Changing it takes a reviewed merge like any other file.
5. **Workflow.** Copy [examples/bounty.yml](examples/bounty.yml) to `.github/workflows/`, fill in the approver address and nonce account, and pin the action to a full commit SHA (`uses: OWNER/agent-office/onchain/action@<sha>`): it holds your attester key, so a moving tag is a way in.

## The approver

The escrow's release needs two signatures: the attester's (this action) and the approver's. The approver is the second pair of eyes; how much of that is left depends on where its key lives.

### Manual: the approver signs on their own machine (recommended)

The approver key never enters GitHub. The approver makes a durable nonce account once:

```sh
solana-keygen new --no-bip39-passphrase --silent -o approver-nonce.json
solana create-nonce-account approver-nonce.json 0.0015 --nonce-authority <approver address> \
  --keypair approver.json --url devnet
```

and the workflow passes its address as `approver-nonce-account`. After the claim, the action builds the release, signs it as the attester, and posts it (base64) in the pull request comment, the job summary and the `prepared-release` output. Because it uses the durable nonce instead of a recent blockhash, it stays valid until the approver sends it rather than for about a minute. The approver then runs the bundled CLI ([dist/ao-bounty.mjs](dist/ao-bounty.mjs), one file, Node 20 or later):

```sh
node ao-bounty.mjs cosign --tx @release.txt --repo owner/name --program <id> --backend solana-devnet \
  --approver-key approver.json                # shows what it pays, to whom, for which PR
node ao-bounty.mjs cosign ... --yes true      # signs as the approver, pays the fee, sends it
```

`cosign` doesn't trust the transaction: it reads the bounty from the chain, rebuilds the Release that bounty allows and refuses anything that differs by a byte, or that the attester didn't sign, or that needs any other signer, or whose nonce has moved on, or that the program would refuse now.

Trade-offs: a person has to act for each payout, and only one prepared release per nonce account can be sent; sending one makes the others stale, and re-running the workflow (Run workflow, with the PR number) prepares them again. A bounty that expires before the approver acts can't be released; its funders get their money back through the refund crank.

### Approver key behind a GitHub environment

[examples/bounty-gated.yml](examples/bounty-gated.yml): a `claim` job, then a `release` job in an environment (`bounty-payout`) with required reviewers and a deployment rule for the default branch only, holding the approver key as an environment secret. The payout waits until a named reviewer presses Approve in GitHub, and nobody has to run anything locally.

Trade-offs: the approver key is in GitHub. Anyone who can change the environment's settings (repository admins) can reach it, and the approval is a click in GitHub rather than a check of the transaction.

### Approver key as a plain secret (automatic)

Pass `approver-key: ${{ secrets.BOUNTY_APPROVER_KEY }}` and the same run claims and pays.

Trade-offs: there is no second pair of eyes any more. Repository secrets reach every workflow that runs from a branch of the repository, so anyone with write access can read both keys, claim a bounty for their own wallet and release it. Use this only where everyone with write access is trusted with the bounty money, on testnets.

The attester key has the same exposure in every setup: anyone with write access can get at it. On its own it can only bind a pull request and a wallet to a bounty (and bind again until release), never move money, which is what the approver is for.

## Inputs and outputs

All inputs are in [action.yml](action.yml). The ones most setups touch:

| Input | Default | What it is |
| --- | --- | --- |
| `approver` | required | the approver's address (public); part of every bounty's address |
| `attester-key` | required | `${{ secrets.BOUNTY_ATTESTER_KEY }}` |
| `approver-nonce-account` | none | manual approver flow: prepare releases on this durable nonce |
| `approver-key` | none | approver key from a secret: release in the same run |
| `mode` | `auto` | `claim` (never release), `release` (approver key required) |
| `program-id` | the devnet deployment | `onchain/solana/deployments/devnet.json` |
| `rpc-url` | devnet's public RPC | a provider URL with an API key belongs in a secret |
| `merged-by-secret` | none | record who merged as HMAC-SHA256 of their GitHub id, the same value on both chains |
| `wallets-file`, `wallet-from-body` | `.github/bounty-wallets.json`, `true` | where the wallet comes from |
| `pr-number` | none | `workflow_dispatch` re-runs |
| `base-attester-key` | none | also attest on Base Sepolia (`base-rpc-url`, `base-schema-uid`, `harness`) |

Outputs: `status` (`done`, `skipped`, `refused`), `pr`, `claimed`, `released`, `prepared-release`, `attestation-uid`, and `result` (all of it per issue, JSON).

The token needs `contents: read` and `pull-requests: write` (the comment; `comment: false` turns it off).

## Build and test

```sh
npm install
npm run typecheck
npm test             # unit tests: mocked GitHub, the SDK's in-memory escrow, a fake attestor; dist/ is up to date
npm run build        # dist/index.mjs and dist/ao-bounty.mjs, committed: GitHub runs dist/
npm run test:e2e     # needs solana-test-validator and onchain/solana's built program (npm run build:program there)
```

`dist/` is built with esbuild from `src/`, the Solana SDK's sources and `onchain/attest`'s attestor, and every package import (viem) resolves from this package's own `node_modules`, so the bundle depends on this lockfile alone. A test rebuilds it and fails if the committed copy differs.

The end-to-end test starts `solana-test-validator` with the built escrow program and the test mint, opens and funds two bounties, and runs the bundled action and the bundled `ao-bounty cosign` as separate processes against a fake GitHub API on loopback: a claim with a release prepared on a durable nonce, then the approver's check and cosign, a fork's merge refused with the chain untouched, and an approver key paying in one run. It makes up all its keys and takes about ten seconds.
