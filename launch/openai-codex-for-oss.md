# OpenAI Codex for Open Source

Last checked: 2026-10-14. Grant (in kind): 6 months of ChatGPT Pro with Codex, optional Codex Security access, and API credits from the Codex Open Source Fund. Drafted 2026-10-14 against repo commit 719234e1.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- None. The page says "Apply today" and applications are reviewed on a rolling basis (checked 2026-10-14). There is no Vilnius cut-off time.
- Internal target: submit this week. Submitting before M1 work starts is fine, because the form asks about plans and not results.

## Links

- Program page: https://developers.openai.com/community/codex-for-oss
- Application form: https://openai.com/form/codex-for-oss/
- The form returns HTTP 403 to curl and WebFetch (bot protection), so it could not be opened from here. The field list below comes from two published walkthroughs of the live form, which agree with each other: https://silenceper.com/en/article/2026-05-07-free-chatgpt-pro-codex-for-oss/ and https://aiidelist.com/blog/openai-codex-for-open-source. Open the form in a normal browser and check the fields before pasting.

## Fit

- What the page offers: "Six months of ChatGPT Pro with Codex", "conditional access to Codex Security", and "API credits through the Codex Open Source Fund for projects using Codex in pull request review, maintainer automation, or other core OSS workflows".
- Why the use is real: Kipdeck runs Codex as a worker harness (`src/server/providers/codex.ts`, `src/server/codex.ts` with native lifecycle hooks, `src/server/codex-usage.ts` for token use). Every agent's work lands on its own branch and only a person merges it. Proof of Merge (`onchain/action`, `onchain/indexer`) already computes merge rate, 14-day revert rate and median time to merge per harness, `codex` included.
- Weakness: the page favours "core maintainers of widely-used public projects". Kipdeck (https://github.com/lukepas/kipdeck) was created 2026-10-06 and has 0 stars, 0 forks, 0 issues and no npm release (`npm view kipdeck` returns 404). The page also invites maintainers "whose projects may not fit standard criteria but play important roles in the ecosystem" to explain why, so the answers rely on that clause and say plainly how new the project is. The upstream numbers (agent-office, 737 stars, 202 forks, checked with `gh` on 2026-10-14) belong to AgentSystemLabs. The answers cite them only as context and never claim them as ours.
- One more fact to state plainly: the repo's own 59 merged PRs so far were mostly written with Claude Code, not Codex (git log). The proposal presents the credits as what makes Codex a regular contributor.

## Ask

- USD 5,000 in OpenAI API credits, plus the standard 6 months of ChatGPT Pro. Tick "API credits" only and leave Codex Security unticked: it is reviewed case by case for repos needing deeper security analysis, and a weeks-old repo will not get it.
- Justification: the Codex Open Source Fund is USD 1M and gives up to USD 25,000 in API credits per project (DevGrants Daily summary; aiidelist warns "do not assume every approval includes $25,000"). USD 5,000 is a fifth of that cap, sized for a first grant to a new project. No public list of accepted projects or amounts was found, so none is cited.
- The form has no amount field. The ask goes in "How will you use API credits".

### Milestone budget

| Milestone | Credits | Months | Measurable outcome |
| --- | --- | --- | --- |
| M1: Codex triages and proposes PRs on Kipdeck's own issues through the inbox | USD 2,000 | 1-3 | At least 40 Codex-authored PRs opened on lukepas/kipdeck, each reviewed and merged or closed by a person; all public |
| M2: Monthly Codex PR report from Proof of Merge data | USD 3,000 | 2-6 | 4 monthly CC0 reports (merge rate, revert rate within 14 days, median time to merge, tokens per merged PR) built from on-chain attestations that anyone can rebuild with `onchain/indexer` |

Budget arithmetic (estimate): USD 5,000 over about 100 Codex tasks across 6 months (40 in M1, about 60 in M2) is about USD 50 per task, triage and retries included. If usage runs lower, the report says so and the rest of the credits stay unused.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Company registration: not needed. The program is for individual maintainers and the benefits are personal and non-transferable. The API credits land in the OpenAI org you name, so decide whose org that is (personal now, a company later).
- [ ] Personal fields: ChatGPT account email and OpenAI organization ID are [FOUNDERS] placeholders. Lukas Kveraga is the sole founder and maintainer, so the answers say "one maintainer".
- [ ] Usage numbers: [FOUNDERS: real usage numbers or 'no outside users yet'] in field 7. Do not invent any.

## Pre-existing code disclosure

Field 7 (under Project description) credits upstream and keeps upstream's numbers apart from ours.

```field name="Disclosure paragraph" max-chars=500
Kipdeck is a fork of agent-office (MIT, AgentSystemLabs / webdevcody). Upstream's 737 stars and 202 forks are theirs, cited as context only. Kipdeck itself is public since 2026-10-06 with 0 stars, and most of its PRs so far were written with Claude Code, not Codex.
```

## Project description: form answers

Fields in the order the published walkthroughs give. They put a 500-character limit on the three narrative fields. Character counts below are exact.

1. First name: Lukas
2. Last name: Kveraga
3. Email (the one on your ChatGPT account): [FOUNDERS: email of the ChatGPT account that should receive Pro. Use hello@kipdeck.com only if that is the ChatGPT login.]
4. GitHub username: lukepas
5. GitHub repository URL: https://github.com/lukepas/kipdeck
6. Maintainer role: Primary maintainer
7. Why does this repository qualify? (476/500)

```field name="Why does this repository qualify?" max-chars=500
Kipdeck is an MIT inbox for AI coding agents: Codex, Claude Code and Cursor run side by side, each on its own branch, and nothing merges until a person merges it. It is a fork of agent-office (MIT, AgentSystemLabs, 737 stars, 202 forks), credited in every README. Kipdeck is new: public since 2026-10-06, 59 merged PRs, [FOUNDERS: real usage numbers or 'no outside users yet']. We apply on ecosystem grounds: it publishes open data on whether agent PRs get merged or reverted.
```

8. I'm interested in: [x] API credits  [ ] Codex Security
9. OpenAI Organization ID: [FOUNDERS: org-... from https://platform.openai.com/settings/organization/general. Create the API org first if there is none.]
10. How will you use API credits for your project? (433/500)

```field name="How will you use API credits for your project?" max-chars=500
Ask: USD 5,000. M1 (USD 2,000, months 1-3): Codex agents run inside Kipdeck on its own repo, triage issues and open PRs that a person reviews and merges; target 40 Codex PRs, all public. M2 (USD 3,000, months 2-6): CI attests each merge (Proof of Merge, MIT); we publish a monthly CC0 report of merge rate, 14-day revert rate and median time to merge for Codex PRs, plus tokens used per merged PR, read from Codex's own session logs.
```

11. Anything else we should know? (450/500)

```field name="Anything else we should know?" max-chars=500
Founder-led, one maintainer today, so every agent PR still waits on one person. Codex already runs as a first-class harness (native lifecycle hooks, usage read from its rollouts: src/server/providers/codex.ts). To be plain: most PRs so far were written with Claude Code; credits would make Codex a regular contributor, measured in public. Demo: https://kipdeck-demo.vercel.app Site: https://kipdeck.com Contact: hello@kipdeck.com, Vilnius, Lithuania.
```

12. Terms: tick agreement to the "Codex for Open Source Program Terms" after reading them (the page requires it; the terms text was not reachable from here).

## Judging criteria

The page names no scoring; these are the selection signals it states.

| What the page looks for | Our answer |
| --- | --- |
| Core maintainers of widely-used public projects | Weak: Kipdeck is new (public since 2026-10-06, 0 stars). Said plainly in field 7 |
| Projects that "may not fit standard criteria but play important roles in the ecosystem" | Open, CC0 data on whether agent PRs get merged or reverted, per harness, Codex included |
| Using Codex in PR review, maintainer automation or other core OSS workflows | Codex runs as a first-class harness in Kipdeck; M1 is 40+ Codex PRs on Kipdeck's own issues, each decided by a person |

## Demo video script

The form does not ask for a video. Record this one for the first monthly report (M2), from real runs only.

Runtime target: 1:00 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:15 | Kipdeck inbox with a Codex agent on a Kipdeck issue | "Codex works on Kipdeck's own issues, each on its own branch." |
| 0:15-0:35 | Review brief beside the diff; a person merges or closes it | "A person reviews every pull request and decides." |
| 0:35-0:50 | The month's report: merge rate, 14-day revert rate, time to merge, tokens per merged PR | "Each month we publish what got merged and what got reverted, rebuilt from public attestations." |
| 0:50-1:00 | Repo, MIT, credit to agent-office by webdevcody | "Open source. The data is CC0." |

## To build before submitting

Nothing has to be built before the form goes in. The items below are what M1 and M2 promise, so start them the week the form is sent. Estimates are honest guesses for one person.

| Item | Status today | Estimate |
| --- | --- | --- |
| Open a real backlog of issues on lukepas/kipdeck for Codex to triage (the repo has 0 issues) | Missing | 1-2 h |
| Create an OpenAI API org, fund nothing yet, copy its org ID; run Codex workers with `OPENAI_API_KEY` (already passed through by `src/server/worker-env.ts`) | Code exists; org setup missing | 0.5 h |
| Per-PR harness in Proof of Merge: `onchain/action` takes `harness` as one static workflow input (`src/inputs.ts:138`), so a Codex vs Claude split needs it read per PR (a label such as `agent:codex`, or the Kipdeck branch name), with tests | Missing | 3-5 h |
| Install the attester workflow on lukepas/kipdeck (only `release.yml` and `showcase-pages.yml` run today). `attester-key` and `approver` are required inputs, so devnet Solana keys are needed even for attest-only use; set `BASE_ATTESTER_KEY` for the Base Sepolia attestation | Missing | 2-3 h |
| Monthly report: filter `onchain/indexer` `leaderboard.json` / `dataset.json` to harness `codex` and this repo, write a short Markdown report | Indexer exists; report script missing | 2-3 h |

## Submission checklist

- [ ] Signed in to ChatGPT with the account that should get Pro
- [ ] OpenAI API org exists; org ID copied
- [ ] Open https://openai.com/form/codex-for-oss/ in a browser and check the fields match the list above; adjust if the live form differs
- [ ] Replace every [FOUNDERS: ...] placeholder; re-check each narrative field is under 500 characters after editing
- [ ] Re-check the live numbers just before sending: `gh repo view lukepas/kipdeck --json stargazerCount,forkCount`, merged PR count, upstream stars
- [ ] Read and accept the Codex for Open Source Program Terms
- [ ] Submit; save a copy of the answers and the date in launch/ (deadlines.json, as "rolling")
- [ ] Open the issue backlog and start M1 the same week
