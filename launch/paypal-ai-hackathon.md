# PayPal AI Hackathon: Kipdeck pays on merge, through PayPal

Last checked: 2026-10-14. Kit written 2026-10-14 from the Devpost overview, rules and resources pages (fetched with curl that day) and from the Kipdeck repository at `main` 719234e1. No earlier kit exists for this event. Re-read the rules page before you submit.

Kipdeck is a fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Upstream has not endorsed this fork. Every text field below credits upstream.

## Deadline

- Submission period: 2026-10-01 09:15 PT to **2026-11-12 12:00 PST (UTC-8)** = 2026-11-12 20:00 UTC = **2026-11-12 22:00 Vilnius (EET, UTC+2)**.
- Judging 2026-12-01 to 2026-12-15. Winners around 2026-12-21 14:00 PT.
- Our target: code freeze 2026-11-08, video on YouTube 2026-11-10, submit 2026-11-11 (one day of slack).
- Drafts can be saved on Devpost before the deadline; nothing can change after it.

## Links

| What | URL |
| --- | --- |
| Hackathon page | https://paypalaihackathon.devpost.com/ |
| Submission form | https://paypalaihackathon.devpost.com/ ("Join hackathon", then "Enter a submission"; needs a Devpost login) |
| Official rules | https://paypalaihackathon.devpost.com/rules |
| Resources (APIs, idea list) | https://paypalaihackathon.devpost.com/resources |
| PayPal Payouts docs | https://developer.paypal.com/docs/payouts/ |
| PayPal REST API | https://developer.paypal.com/api/rest/ |
| PayPal JS SDK v6 (Checkout) | https://developer.paypal.com/sdk/js/ |
| PayPal Agent Toolkit | https://docs.paypal.ai/developer/tools/ai/agent-toolkit-quickstart |
| PayPal MCP server | https://docs.paypal.ai/developer/tools/ai/mcp-quickstart |
| Sandbox starter | https://github.com/paypaldev/getting-started-with-paypal-sandbox |
| Kipdeck repo (public, MIT, licence shows in About) | https://github.com/zbagdzevicius/kipdeck |
| Site | https://kipdeck.com |
| Replay demo (no install) | https://kipdeck-demo.vercel.app |
| Showcase | https://zbagdzevicius.github.io/kipdeck/ |
| Contact | hello@kipdeck.com |

## Fit

- Eligibility: individuals over the age of majority, teams and organizations; "all countries/territories, excluding standard exceptions" (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, OFAC-sanctioned). Lithuania is eligible.
- The one hard requirement: "your project must meaningfully use both PayPal and AI", with PayPal integration central, in the free sandbox.
- No tracks. Existing projects are allowed if "significantly updated after the start of the Hackathon Submission Period", and the entry must explain how. Our update is the PayPal rail, built entirely inside the period.
- PayPal's own idea list (Resources, "AI Agents or Automation"): "a scheduling assistant that pays contractors automatically when a job is marked complete". Under "Money Movement": "a payout tool for gig workers that pays out the moment a task is approved". Proof of Merge already does this on Solana devnet; the entry adds PayPal as the rail.
- Open source in a fork is allowed: "An Entrant may submit a Submission that includes the use of open source software ... provided the Entrant complies with applicable open source licenses and ... creates software that enhances and builds upon the features and functionality included in the underlying open source product."
- Judging: Stage One pass/fail (fits the theme, uses the required APIs), then five equally weighted criteria: Technological Implementation, Design, Potential Impact, Innovation/Idea, Presentation.
- Risk to state openly: the rules also say the entry must be "solely owned by you ... with no other person or entity having any right or interest in it". Upstream code stays MIT and credited; the submission is the fork's own work on top. The open source clause above covers this, but the description must say plainly which parts are upstream.

## Ask

Prizes, not a grant. A project can win at most one Grand Prize or one Honorable Mention, plus one Sponsor Prize.

| Target | Prize | Why us |
| --- | --- | --- |
| Primary | Best Use of Agentic Commerce, USD 5,000 | AI agents earn money for merged work, and can post a priced sub-task for another agent, with a person's merge as the only trigger for payment |
| Secondary | Best Use of PayPal + AI, USD 5,000 | PayPal moves the money (Orders in, Payouts out); AI agents do the paid work |
| Automatic | 1st/2nd/3rd, USD 12,000 / 8,000 / 5,000 | every eligible entry is considered |
| Optional sponsor | Best Use of Render, USD 1,000 / 750 / 500 in Render credits | only if the judge sandbox office is hosted on Render (about half a day extra); skip if time is short |

Realistic goal: one Honorable Mention (USD 5,000). The total pool is USD 69,750 (USD 67,500 cash plus Render credits), with 14,198 registered participants on 2026-10-14.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] **Sole ownership:** the rules make the entrant warrant the work is solely theirs. Confirm a fork of an MIT project counts. The rules also exclude PayPal and Devpost contractors and affiliates and a judge's employer; none of those apply to us.
- [ ] **Company registration:** not needed. Enter as an individual. A prize is paid to the individual and is taxable in Lithuania; a W-8BEN is likely required. If a Kipdeck company is registered before entering, it could enter as an Organization instead. [FOUNDERS: decide]
- [ ] **Personal fields (Devpost profile and winner affidavit):** legal name, address, date of birth and tax details are filled by the applicant only. [FOUNDERS: personal details]
- [ ] **Upstream code:** the "solely owned" clause versus an MIT fork. Covered by the open source clause if the credit and the split between upstream and fork work are clear. Optionally ask the hackathon manager (email link on the page) in writing; the launch README already lists this as risk 1 for every event.
- [ ] **Team:** decision D9 is open. Do not add anyone to the Devpost entry who did not work on it. [FOUNDERS: team]

## Pre-existing code disclosure

The form asks "How was the project significantly updated during the submission period?" (under Project description); the about text ends with "Built on".

```field name="Disclosure paragraph" max-chars=800
Kipdeck is a fork of agent-office by webdevcody / AgentSystemLabs (MIT, https://github.com/AgentSystemLabs/agent-office). Upstream wrote the office the fork started from. Before 2026-10-01 the fork had the inbox and Proof of Merge bounties paid on Solana devnet only. Everything PayPal (the rail module, Checkout funding, Payouts on approval, webhooks, refunds, payout addresses in Settings, the post_bounty MCP tool and their tests) was written during the submission period.
```

## Project description: form answers

The Devpost submission form sits behind a login, so the fields below are Devpost's standard project fields plus what the rules' "What to submit" list requires. The host's custom questions were not visible without a login: open the form once, early, and paste any extra question into this kit. Limits marked [Devpost standard] are Devpost's usual ones; check the counter in the form.

### Project name [Devpost standard: 60 characters]

```field name="Project name" max-chars=60
Kipdeck: PayPal pays AI agents when a human merges
```
(50 characters.)

### Elevator pitch / tagline [Devpost standard: 200 characters]

```field name="Elevator pitch" max-chars=200
Kipdeck is the inbox for your AI coding agents. Put a PayPal bounty on a GitHub issue; an agent or a person fixes it, and the money moves only after a human with write access merges the PR.
```
(189 characters.)

### Thumbnail [Devpost standard: JPG, PNG or GIF, 3:2, up to 5 MB]

The inbox with the new "Approve PayPal payout" row selected. Take it from the sandbox build (see To build, item 7). Until then, `docs/img/bounty-payout.png` exists but shows the Solana payout, so do not use it as is.

### About the project [Markdown, no stated limit]

```field name="About the project"
## Inspiration

Teams now run several AI coding agents at once, and outside contributors (people or their agents) send pull requests too. Paying for that work is the awkward part: you either pay up front and hope, or chase invoices after. PayPal's own idea list for this hackathon names it: "a scheduling assistant that pays contractors automatically when a job is marked complete". For code, "complete" has a precise meaning: a person with write access merged it.

## What it does

Kipdeck is an open source inbox for AI coding agents (Claude Code, Codex and Cursor side by side, each on its own branch). You answer their questions, read a review brief over the diff, and merge, from a laptop or a phone.

For this hackathon we added a PayPal rail to Kipdeck's Proof of Merge bounties:

1. **Fund.** A maintainer puts a bounty on a GitHub issue and pays it with PayPal Checkout (Orders API, sandbox). The money sits with the office's PayPal sandbox business account, tied to that issue.
2. **Work.** Any agent in the office, or an outside contributor, picks up the issue and opens a pull request that closes it.
3. **Merge.** Kipdeck asks GitHub who merged: it must be a `User` (not a bot or an app) with write, maintain or admin permission, the PR must close the issue, and it must not come from a fork.
4. **Approve.** The payout lands in the review inbox as "Approve PayPal payout of USD N for PR #x". An office admin presses Approve.
5. **Pay.** Kipdeck calls the PayPal Payouts API, paying the PayPal account of whoever earned it: the person who deployed the agent, or the contributor. The payout id and status go on the issue's timeline and the payout is a toast for the team.
6. **Refund.** If nothing merges before the bounty expires, the funder gets a refund of the captured order.

The agentic part: agents in Kipdeck already manage other agents through an MCP server (`hire_worker`, `tell_worker`, `send_home` and more), and each request waits in the inbox for a person. We added a `post_bounty` tool: an agent that finds a sub-task it should not do itself can put a priced bounty on it, within a budget the admin set. A person approves the bounty, another agent or a contributor fixes it, and the same merge check and payout run. No agent can release money; only a human merge plus an admin approval can.

The Solana devnet escrow and the Base Sepolia x402 rail stay as alternative rails; the PayPal rail is the one for teams that pay in fiat.

## How we built it

- TypeScript, Node.js 20, Vite. The PayPal rail is its own module (`src/server/paypal/`) that plugs into the existing bounty service through its rail interface, so the merge checks are shared with the Solana rail and tested once.
- PayPal REST APIs in the sandbox: OAuth 2.0 client credentials, Orders v2 (create, capture) behind the PayPal JS SDK v6 buttons for funding, Payouts v1 for the payout (`sender_batch_id` is the bounty's id, so a retried release can never pay twice), and Webhooks for payout status (`PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `.FAILED`, `.UNCLAIMED`).
- PayPal Agent Toolkit: [fill in after the build: which tools the `post_bounty` flow and the agent-facing status check use].
- GitHub API for the merge check (who merged, their permission, whether the PR closes the issue).
- AI: the agents doing the paid work are Claude Code, Codex and Cursor. Agents talk to the office through Kipdeck's MCP server, and the new `post_bounty` tool is gated by the same human-approval inbox as hiring.

## Challenges we ran into

[FOUNDERS: fill in from the build log. Candidates: keeping one merge check across two very different rails; making the payout idempotent across restarts; what to do with an UNCLAIMED payout to an address with no PayPal account.]

## Accomplishments that we're proud of

[FOUNDERS: fill in after the build. Keep to facts: number of tests added, the end-to-end sandbox run with its payout batch id.]

## What we learned

[FOUNDERS: fill in after the build.]

## What's next for Kipdeck

Live PayPal Payouts need PayPal's approval for the account, so the next step is applying for it with a real team's bounty board, then multi-currency payouts for contributors outside the US.

## Built on

Kipdeck is a fork of agent-office by webdevcody / AgentSystemLabs (MIT): https://github.com/AgentSystemLabs/agent-office. Upstream wrote the office the fork started from. The inbox, Proof of Merge and everything PayPal are the fork's work; the PayPal rail was written during the submission period (commits from [DATE of first PayPal commit] onward, listed in the repo).
```

### Built with (tags)

```
typescript, node.js, vite, paypal, paypal-payouts, paypal-orders, paypal-js-sdk, paypal-agent-toolkit, paypal-webhooks, mcp, claude-code, codex, cursor, github-api, solana
```

### Try it out links

```
https://github.com/zbagdzevicius/kipdeck
https://kipdeck-demo.vercel.app
```
Add the hosted sandbox office URL here only if To build item 8 is done.

### Video demo link

YouTube URL, public, under 3:00. Script below.

### Image gallery [Devpost standard: JPG, PNG or GIF, 3:2, up to 5 MB each]

1. Bounty card on a GitHub issue with "Fund with PayPal".
2. PayPal sandbox checkout capturing the funding order.
3. Agent at work on the issue in the inbox.
4. The inbox row "Approve PayPal payout of USD 25 for PR #x".
5. The PayPal sandbox account showing the payout received.
6. The `post_bounty` request waiting in Needs you.

### Expected custom questions (answer if the form asks)

**Which tools (model or AI service) did you use, and how?** (required by "What to submit: Tools")
```field name="Tools used"
AI agents: Claude Code (Anthropic), Codex (OpenAI) and Cursor's agent do the coding work that bounties pay for, each on its own git branch. They reach the office through Kipdeck's MCP server; the new post_bounty tool lets an agent propose a priced sub-task, which a person approves before it is funded. PayPal: Orders v2 and the JS SDK v6 for funding, Payouts v1 for paying the contributor, Webhooks for payout status, and the PayPal Agent Toolkit for [fill in]. All in the PayPal sandbox. Claude Code was also used to help write the code.
```

**How was the project significantly updated during the submission period?**
```field name="How was the project significantly updated"
Kipdeck existed before 2026-10-01 as a fork of agent-office (MIT, webdevcody / AgentSystemLabs), with bounties paid only on Solana devnet. Everything PayPal was built during the period: the PayPal rail module, PayPal Checkout funding, Payouts on approval, webhook status, refunds, the per-person PayPal payout address in Settings, the agent's post_bounty MCP tool, and their tests. The commits are listed at [link to compare view main@719234e1...<submission commit>].
```

**Testing instructions / how judges run it**
```field name="Testing instructions"
Hosted: [URL, if To build item 8 is done]. Login: [judge password].
Locally (about 5 minutes): Node.js 20+, git. 
  git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck && npm install
  cp .env.paypal.example .env.paypal   # sandbox client id and secret, given in the README for judges
  node bin/agent-office.js --demo --paypal-sandbox
The --demo flag runs scripted agents, so no AI CLI or model key is needed to see the payment flow; with Claude Code, Codex or Cursor signed in, real agents work the issue. Sandbox buyer and payee accounts are listed in docs/paypal.md.
```
(The `--paypal-sandbox` flag, `.env.paypal.example` and `docs/paypal.md` do not exist yet; see To build.)

**Country of residence**: Lithuania.

**Team members**: founder-led. Zygimantas Bagdzevicius (CEO/CTO) submits as the individual entrant and Representative. [FOUNDERS: team, decision D9. Add teammates by Devpost username before submitting, and only people who actually worked on it.]

**Opt into sponsor prizes**: Render, only if hosted on Render. Otherwise none.

## Judging criteria

Stage one is pass/fail: fits the theme and meaningfully uses both PayPal and AI. Stage two: five criteria, equally weighted.

| Criterion (equal weight) | Our answer |
| --- | --- |
| Technological Implementation | Orders v2 funding, Payouts v1 with the bounty id as `sender_batch_id` (no double pay), webhooks for status, merge check through the GitHub API, all behind one rail interface shared with the Solana rail |
| Design | The payout is one row in the inbox, "Approve PayPal payout of USD N for PR #x"; a person approves, nothing else |
| Potential Impact | Teams paying people or agents for small fixes, in fiat, only for work that merged |
| Innovation/Idea | `post_bounty`: an agent can propose a priced sub-task, but only a human merge plus an admin approval moves money |
| Presentation | Under 3:00, real sandbox footage, ids on screen |

## Demo video script

Target 2:50, own voice, real screen footage, no third-party music.

Runtime target: 2:50 (limit: under 3:00)

| Time | Screen | Voice |
| --- | --- | --- |
| 0:00-0:15 | Inbox with three agents working | "I run several AI coding agents at once. They write the code. The hard part is paying for work, from agents or from people, without paying for work that never ships." |
| 0:15-0:30 | GitHub issue, bounty card, "Fund with PayPal" | "Kipdeck is the inbox for those agents. Here I put a 25 dollar bounty on this issue." |
| 0:30-0:50 | PayPal sandbox checkout, capture, bounty shows Funded | "PayPal Checkout takes the money. It stays with the office's PayPal account, tied to this issue." |
| 0:50-1:15 | Agent's `post_bounty` request in Needs you, approve; second agent picks it up | "Agents can post work too. This agent found a sub-task, asked to put a bounty on it within its budget, and waits for me. I approve; another agent takes it." |
| 1:15-1:40 | Agent asks a question, answered in one box; review brief over the diff | "I answer its question in one box and read the brief: what it was asked, what it did, its test runs, what in the diff is risky." |
| 1:40-1:55 | Merge on GitHub; Kipdeck shows the merge check | "I merge. Kipdeck checks with GitHub that a person with write access merged it, not a bot, and that the PR closes the issue." |
| 1:55-2:15 | Inbox row "Approve PayPal payout", press Approve; toast; timeline with payout id | "Only now does a payout appear. An admin approves, and Kipdeck calls PayPal Payouts." |
| 2:15-2:30 | Payee's PayPal sandbox account with the payment | "The contributor gets paid in their PayPal account. A retry can never pay twice: the payout batch id is the bounty's id." |
| 2:30-2:42 | Expired bounty refunding | "Nothing merged? The funder gets a refund." |
| 2:42-2:50 | Repo page, licence, credit line | "Kipdeck is open source, MIT, built on agent-office by webdevcody. Links below." |

Recording: real footage only, sandbox accounts, no real emails or keys on screen. Upload to YouTube as Public.

## To build before submitting

Nothing PayPal exists in the repo today (`grep -ri paypal` over `src`, `docs`, `launch` finds nothing). The Solana bounty flow it builds on is real and tested (`src/server/bounties.ts`, `tests/bounties.test.ts`, devnet program `JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`). Per `AGENTS.md`, it ships as a PR from fresh `origin/main` in a worktree, as a module of its own through the registries, with `tests/size.test.ts` green.

| # | Item | Estimate |
| --- | --- | --- |
| 1 | PayPal developer account, sandbox business (office) and personal (payee, buyer) accounts, REST app with Payouts enabled in sandbox | 0.5 day |
| 2 | Split a rail interface out of `bounties.ts` (it is written for one escrow SDK today: `backend: 'mock' or 'solana-devnet'`), keeping the merge checks shared; existing tests stay green | 1 day |
| 3 | `src/server/paypal/`: OAuth token, Orders create/capture, Payouts with `sender_batch_id` = bounty id, payout status poll plus webhook route, refund of the captured order on expiry; secrets from env only, never logged | 1.5 days |
| 4 | Settings: rail per office (PayPal sandbox, Solana devnet, mock), each person's PayPal payout email; Fund window with PayPal JS SDK v6 buttons; inbox row text "Approve PayPal payout of USD N" | 1 day |
| 5 | `post_bounty` MCP tool through the existing agent gate (lands in Needs you, admin budget cap), plus the PayPal Agent Toolkit use, whichever is honest and working | 1 day |
| 6 | Tests (unit with a mocked PayPal API, one end-to-end sandbox run recorded in `docs/paypal.md`), `npm run typecheck`, `npm test`, `npm run build` | 1 day |
| 7 | `--demo` mode with PayPal sandbox so judges see the flow without an AI CLI; screenshots; README and `docs/paypal.md`, `docs/bounties.md` updated | 0.5 day |
| 8 | Optional: hosted judge office (Render for the sponsor prize, or the existing deploy path) with a judge password, scripted agents only | 0.5 day |
| 9 | Video: record, edit, upload | 0.5 day |

Total about 7 to 8 working days (6.5 without item 8). Starting by 2026-10-27 leaves slack before the 2026-11-08 freeze. It overlaps with Nebius (2026-10-30) and Vultr (2026-11-08), so pick the order now.

Open checks during the build:
- Whether a sandbox REST app has Payouts on by default or needs it switched on in the dashboard. [verify in the developer dashboard]
- Holding funds in a business account for later payout is a custodial model, unlike the Solana escrow. Say so in the description, and keep it sandbox-only.

## Submission checklist

- [ ] Devpost account, "Join hackathon" clicked, custom form questions copied into this kit
- [ ] PayPal developer account and sandbox accounts made
- [ ] PayPal rail PR merged to `main` (typecheck, test, build green; screenshot for visual changes)
- [ ] `README.md`, `docs/paypal.md`, `docs/bounties.md` describe the PayPal rail and how judges run it
- [ ] Licence still shows in the GitHub About section (MIT today)
- [ ] One end-to-end sandbox run: fund, agent PR, human merge, approve, payout succeeded; ids recorded
- [ ] Judge credentials (sandbox only) in the README, nothing live, no personal keys
- [ ] Every `[fill in]` and `[FOUNDERS: ...]` in the form text replaced or cut; every claim matches the merged code
- [ ] Compare-view link of commits made during the period in the "significantly updated" answer
- [ ] Video under 3:00, own voice, no third-party music, public on YouTube
- [ ] Thumbnail and gallery images taken from the sandbox build, 3:2
- [ ] Upstream credit (agent-office, webdevcody / AgentSystemLabs, MIT) in the description and the video
- [ ] Draft saved by 2026-11-10; submitted by 2026-11-11, before 2026-11-12 22:00 Vilnius
