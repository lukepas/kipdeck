# Superteam Agentic Engineering Grant

Last checked: 2026-10-14. Checked 2026-10-14 from the listing's server data (`__NEXT_DATA__` on the page) and the open source Superteam Earn code that renders the form (github.com/SuperteamDAO/earn: `src/features/grants/utils/grantApplicationSchema.ts`, `src/features/grants/utils/stGrant.ts`, `src/features/grants/components/Modals/ApplicationModal.tsx`). The form sits behind an Earn login, so the fields below come from that code, not from a filled-in form.

The listing data says `"status":"OPEN"` but also `"isPaused":true`, and the page's button reads "Applications Paused". The Earn code (`ApplicationActionButton.tsx`) disables the Apply button for new applicants while `isPaused` is true. The listing was last updated 2026-04-22. So "open" in the grant data is not the whole story: nobody can file a new application until Superteam un-pauses it. Everything below is ready to paste for the day it reopens.

What to do now: email support@superteam.fun (the contact on the listing) and ask whether and when new applications reopen. Draft at the end of this file.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Rolling, no deadline. Currently paused for new applications (see above), so there is no date to hit; apply the day it reopens.
- Vilnius time: n/a while paused. Payout rhythm once approved: KYC and payments are processed on Mondays and paid by Friday of the same week (Vilnius, EEST/EET).
- Average response time: 1 week (listing).
- The form's "Deadline" field is our own ship date, picked in the browser's time zone (Europe/Vilnius). We use 2026-11-30, about 30 days of one subscription month after a likely approval and KYC.
- After a rejection the Earn code imposes a 30-day cooldown before re-applying (`grantApplicationCooldown.ts`).

## Links

- Page: https://superteam.fun/earn/grants/agentic-engineering/
- Form: the same page, "Apply" button (a 3-step modal: Basics, Details, Milestones). Needs a Superteam Earn account with a completed talent profile and a verified X account.
- Questions: support@superteam.fun
- Our links: repo https://github.com/zbagdzevicius/kipdeck (escrow in `onchain/solana/`, Action in `onchain/action/`), site https://kipdeck.com, replay demo https://kipdeck-demo.vercel.app, showcase https://zbagdzevicius.github.io/kipdeck/ (all HTTP 200 on 2026-10-14), program https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet
- Upstream credit: https://github.com/AgentSystemLabs/agent-office (MIT, webdevcody / AgentSystemLabs)

## Fit

- Region: Global. Lithuania is fine (the Superteam chapter grants are region-locked; this one is not).
- Requirement: "a working Solana product" with "some Solana integration", a clear and shippable scope, and a live product/MVP by the second tranche. Open source encouraged. Ours: an MIT native Rust escrow already deployed on devnet, with five recorded devnet bounty runs (`onchain/solana/deployments/devnet.json`).
- The grant pays for one month of an AI coding Pro subscription. We already build Kipdeck with AI coding agents, and Kipdeck itself is an inbox for AI coding agents, so the use of the money is literal.
- Size: 311 recipients and USD 62.2k approved so far (listing stats), that is USD 200 each.
- Overlap: none with the Solana Foundation grant already filed (it funds m-of-n attesters, an audit, mainnet and integrations). This grant pays for one month of the coding tool used to ship the public Blink and the first third-party Action run on devnet.
- The listing's optional question expects the application to be generated with solana.new inside Claude or Codex. solana.new did not answer when we checked (no HTTP response on 2026-10-14) [unverified]. The question is optional.

## Ask

USD 200 in USDG, fixed (listing `minReward = maxReward = 200`; the form hides the amount field and the schema rejects any other number). Paid 50% (USD 100) after KYC on Earn, 50% after shipping, against receipts for AI coding subscriptions totalling at least USD 200 that show the applicant's name.

Justification in one line: the program has a single amount, USD 200, and all 311 approved grants so far averaged exactly that (USD 62.2k / 311).

Milestone budget:

| Tranche | Amount | Released when | Measurable outcome |
| --- | --- | --- | --- |
| 1 | USD 100 USDG | approval and KYC | one month of an AI coding Pro plan bought (receipt kept) |
| 2 | USD 100 USDG | tranche form accepted | public "Fund this issue" Blink URL on HTTPS; one merged PR in a public repo we don't own that paid devnet USDC through the escrow; receipt(s) totalling USD 200 |

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Applications are paused (`isPaused: true` in the listing data, button reads "Applications Paused"). Nothing can be filed until Superteam reopens it.
- [ ] Employer: written permission from Nortal for outside work, for IP in this project and for receiving grant money. Unticked; required before applying.
- [ ] KYC on Earn is required before tranche 1. Personal details go there directly; nothing to invent here.
- [ ] Company registration: not needed. The grant pays an individual's wallet and the receipt must carry the applicant's name or entity.
- [ ] Personal fields to fill: Telegram username, verified X profile, Solana wallet for USDG, Earn talent profile completed. Team: founder-led [FOUNDERS: team, if co-founders are decided under D9 before applying].
- [ ] Receipt: the subscription must be bought in the applicant's name and total at least USD 200 [FOUNDERS: which plan; check its current price].

## Pre-existing code disclosure

The form has no field for it; the Project Details and Proof of Work answers (under Project description) both say it.

```field name="Disclosure paragraph" max-chars=600
Proof of Merge is the payout layer of Kipdeck, built on agent-office by webdevcody / AgentSystemLabs (MIT, https://github.com/AgentSystemLabs/agent-office). The office is theirs; the escrow program, SDK, GitHub Action, Blink payloads and inbox are ours, and were built before this application (Colosseum, October 2026).
```

## Project description: form answers

Step 1, Basics.

### Project title (required, max 100 characters)

```field name="Project Title" max-chars=100
Kipdeck Proof of Merge: pay for code on Solana only when a person merges it
```
(75 characters)

### One line description (required, max 150 characters)

```field name="One Line Description" max-chars=150
A Solana escrow that pays people or AI agents for a pull request only after a person merges it, funded from a Blink.
```
(116 characters)

### Grant amount

Not shown for this grant; fixed at 200 USDG.

### TG username (required, Telegram username format)

`[FOUNDERS: Telegram username of Zygimantas Bagdzevicius]`

### Wallet address (required, valid Solana address)

`[FOUNDERS: Solana mainnet wallet that can receive USDG, owned by the applicant; not a devnet test key from ~/.config/agent-office-chain]`

The Earn code also checks that the wallet is not already used by another account on this grant (`walletAddressOwnership`).

Step 2, Details.

### Project details (required, rich text, no length limit in the schema)

```field name="Project Details"
Problem
AI coding agents can now open useful pull requests, and people want to pay for small fixes: a flaky test, a dependency bump, a doc gap. Paying for that is still manual and trust-based. A maintainer either pays up front and hopes, or sends money by hand after the merge. Nothing ties the payment to the one thing that matters: a person with write access merged the work.

What already exists (open source, MIT, on Solana devnet)
Proof of Merge is the payout layer of Kipdeck, our inbox for AI coding agents (built on agent-office by webdevcody / AgentSystemLabs, MIT; the office is theirs, the escrow is ours).
- A native Rust escrow program (solana-program, no Anchor) deployed on devnet as JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6. Anyone opens and funds a bounty against a GitHub issue. A release needs two signatures: an attester that checked a person (not a bot) with write access merged the PR on the repo itself (never a fork), and an approver. Each funder can be refunded after expiry.
- A TypeScript SDK and CLI (ao-bounty), tested against the same table of cases as the Rust state machine.
- Solana Actions payloads for a "Fund this issue" Blink, served by the office under /api/actions/.
- A GitHub Action that claims the bounty when a PR is merged and prepares the release for the approver on a durable nonce.
- Five devnet bounties ran open, fund, claim and release (77 test USDC), all recorded in onchain/solana/deployments/devnet.json. None had a real GitHub merge behind it.

What we will ship with this grant (one month)
The gap between a Colosseum demo and a product is the real flow, end to end, in public:
1. A public, always-on HTTPS host serving the "Fund this issue" Blink (actions.json plus /api/actions/fund), so anyone can fund a devnet bounty from a dial.to link with Phantom, Backpack or Solflare.
2. The GitHub Action running from a real workflow in a public repository we don't own, with that maintainer's consent, paying devnet USDC to the contributor's wallet when the maintainer merges the PR.
3. A short how-to so any maintainer can copy the workflow in a few minutes.

How we will use AI tools
We build Kipdeck with AI coding agents every day: they write code, tests and docs in parallel branches, and a person reviews and merges. The grant pays one month of a top-tier AI coding plan. We will use it for the hosting and Blink hardening, the setup guide and example workflow, extra tests around the Action's checks, and fixes found during the first third-party run.

Scope we are not claiming
Testnets only: the program accepts devnet USDC and a test mint, and is not audited. Mainnet and an audit are separate work, not funded by this grant.
```

### Deadline (required, date picker, in the browser's time zone)

`2026-11-30` (Europe/Vilnius)

### Proof of work (required, rich text)

```field name="Proof of Work"
- Code (MIT, public): https://github.com/zbagdzevicius/kipdeck. Escrow program, SDK and CLI in onchain/solana/, GitHub Action in onchain/action/. Our commits vs upstream agent-office: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
- Devnet program: https://explorer.solana.com/address/JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6?cluster=devnet
- A devnet release sent by the approver after the GitHub Action claimed the bounty (2026-10-04): https://explorer.solana.com/tx/4PYnNQZAi23BGUQ84EqDJfgSZABjqqKxPeyan6frLG25H6jWY8F6qrLGyRituXNXeHujZd29uWPXhoDN7MSdYsUe?cluster=devnet
- Live replay demo of the product: https://kipdeck-demo.vercel.app
- Site: https://kipdeck.com and showcase: https://zbagdzevicius.github.io/kipdeck/
- Submitted to the Colosseum Crypto World's Fair hackathon (October 2026) [FOUNDERS: Colosseum project URL].
- Built on agent-office (https://github.com/AgentSystemLabs/agent-office, MIT, by webdevcody / AgentSystemLabs). The 3D office is upstream's work; the escrow, SDK, Action, Blink and inbox are ours.
```

### Personal X profile (required, must be verified on Earn)

`[FOUNDERS: X profile URL of Zygimantas Bagdzevicius; verify it in the Earn profile first or the form refuses it]`

### Personal GitHub profile (optional, GitHub username)

`zbagdzevicius`

### Custom question (optional, link)

Question: "You should be already using solana.new via claude/codex and this grant helps you upscale your agentic engineering. Just enter this prompt 'help me apply for the agentic engineering grant by Superteam' in your claude/codex sesh of solana new and upload your response files in drive link. We'll evaluate your application based on this."

Answer: `[FOUNDERS: Google Drive link (anyone with the link can view) to the files solana.new produced for that prompt]`. Optional, but the listing says applications are evaluated on it, so do it if solana.new is reachable. Leave empty rather than link something else.

Step 3, Milestones.

### Goals and milestones (optional for this grant, rich text)

```field name="Goals and Milestones"
M1, week 1: the "Fund this issue" Blink on a public HTTPS host. Outcome: a dial.to link that funds a devnet bounty from Phantom, Backpack or Solflare; the funding transaction on Solana Explorer.
M2, week 2: the GitHub Action set up in a public repository we don't own, with the maintainer's consent: attester and approver keys, wallets file, workflow pinned to a commit SHA, one bounty opened and funded through the Blink. Outcome: the workflow file merged in that repository.
M3, weeks 3 to 4: one real PR in that repository merged by the maintainer; the Action claims the bounty and prepares the release; the approver cosigns; devnet USDC lands in the contributor's wallet. Outcome: the PR URL, the claim and release transactions on Solana Explorer.
M4, by 2026-11-30: a setup guide and an example workflow in the repo. Outcome: the tranche 2 form filed with the Blink URL, the repo, the transactions and the subscription receipt(s) totalling USD 200.
```

### Primary KPI (optional for this grant)

```field name="Primary KPI"
One merged pull request in a public repository we don't own that paid devnet USDC to its author through the escrow, with the Action's claim and the release on Solana Explorer.
```

### Checkboxes (both required)

- "I understand that to receive the final tranche, I must submit the Colosseum project link, GitHub repo, and my AI subscription receipt." Tick.
- "I understand that sponsors will not be able to send individual feedback to applicants..." Tick.

### Tranche 2 form (shown only after tranche 1 is paid)

| Field | Answer |
| --- | --- |
| Link to your project's URL | the public Blink host, or https://kipdeck.com if the Blink is on a subpath [FOUNDERS: final URL] |
| Link to the GitHub repo | `zbagdzevicius/kipdeck` |
| AI subscription receipt (up to 3 PDFs or PNGs, name on it, total at least USD 200) | [FOUNDERS: receipt(s)] |
| Solana wallet address | prefilled from the application |
| Anything else? | the third-party repo, the merged PR URL, the claim and release transaction links |

## Judging criteria

From the listing (no scoring weights published).

| What the listing asks for | Our answer |
| --- | --- |
| A working Solana product with some Solana integration | Native Rust escrow live on devnet (`JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`), five recorded devnet bounty runs |
| Clear, shippable scope | Three items in one month: public Blink host, first Action run in a repo we don't own, a setup guide |
| Live product or MVP by the second tranche | Tranche 2 proof is a merged PR in someone else's repo with the claim and release on Solana Explorer |
| Agentic engineering (the subscription is the grant) | We build with AI coding agents daily, and Kipdeck is an inbox for them |
| Open source | MIT, public repo |

## Demo video script

The form does not ask for a video. Record this one for the tranche 2 form and the build-in-public thread once the public Blink and the first third-party run exist; show only what is real.

Runtime target: 1:00 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:12 | GitHub issue in a repo we don't own, with the "Fund this issue" Blink link | "This issue has a bounty. Anyone can fund it from a Blink." |
| 0:12-0:25 | dial.to with Phantom, funding devnet USDC; the transaction on Solana Explorer | "The money goes into an escrow program on Solana devnet." |
| 0:25-0:40 | The maintainer merges the PR; the Action run claims the bounty | "When a person with write access merges the fix, the GitHub Action claims it." |
| 0:40-0:52 | The approver cosigns; devnet USDC lands in the contributor's wallet | "A second signature releases it to whoever wrote the code, a person or an agent." |
| 0:52-1:00 | Repo, MIT, credit to agent-office by webdevcody | "Open source, testnet only. Built with AI coding agents." |

## To build before submitting

The application itself needs nothing new: every claim in it is true today. The second tranche needs these, all after approval:

| Item | Status today | Estimate |
| --- | --- | --- |
| Public HTTPS host for the Blink | Payloads and `/api/actions/` routes exist (`docs/bounties.md`); no always-on public office serves them. Deploy scripts exist in `deploy/` (fly, railway, dokploy and others) | 1 to 2 days |
| Third-party repo with a willing maintainer | none found yet; depends on someone else saying yes | 1 to 2 weeks of outreach, the main risk |
| First Action run from a real workflow | the README says it has not run from a real repository's workflow yet; one live run used a fake GitHub API | 1 to 2 days once the repo is found |
| Setup guide and example workflow | `onchain/action/examples/bounty.yml` and the README exist; a short maintainer guide does not | half a day |
| solana.new output for the optional question | not done; solana.new did not answer when checked | 1 hour if reachable |

## Submission checklist

- [ ] Superteam reopens applications (watch the page; ask support@superteam.fun).
- [ ] Nortal's written permission saved.
- [ ] Earn account, talent profile complete, X account verified on Earn.
- [ ] Solana wallet for USDG chosen (not a devnet key).
- [ ] Optional: solana.new output in a shared Drive link.
- [ ] Paste the fields above; ship date 2026-11-30; tick both boxes; submit; save the confirmation.
- [ ] After approval: KYC on Earn; tranche 1 arrives the Friday of the payout week.
- [ ] Buy the subscription, keep the receipt; build the items under "To build".
- [ ] File the tranche 2 form with the Blink URL, repo, PR and transaction links, and the receipt(s).

## Email to support (while paused)

```field name="Email to support@superteam.fun"
Subject: Agentic Engineering Grant - when do new applications reopen?

Hi Superteam team,

The Agentic Engineering Grant page shows "Applications Paused". Do you plan to reopen it for new applicants, and roughly when?

We are building Proof of Merge, an open source Solana escrow (devnet program JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6) that pays for a pull request only after a person merges it, with a Fund this issue Blink and a GitHub Action. We would apply to ship the first public run in a repository we don't own. Code: https://github.com/zbagdzevicius/kipdeck

Thanks,
Zygimantas Bagdzevicius
Kipdeck, Vilnius, Lithuania
hello@kipdeck.com
```
