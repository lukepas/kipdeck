# Nebius x NVIDIA Global AI Hackathon: Kipdeck submission

Last checked: 2026-10-14. Checked on 2026-10-14 against the Devpost overview, rules and resources pages (fetched with curl), the Token Factory Nemotron page and the Kipdeck repository (`origin/main` at `499f93c2`). Replaces the old-name kit in `launch/nebius-nvidia.md`, which still describes "Agent Office on Nemotron" in a 3D office.

Kipdeck is built on agent-office (MIT, by webdevcody / AgentSystemLabs, https://github.com/AgentSystemLabs/agent-office). Upstream has not endorsed this fork.

## Deadline

- Closes Friday 2026-10-30 at 10:00 PDT (UTC-7) = 17:00 UTC = 19:00 Vilnius (EET, UTC+2). Devpost shows "Deadline: Oct 30, 2026 @ 10:00am PDT".
- The submission period opened 2026-08-26 09:00 PT (rules section 2).
- Drafts can be saved on Devpost before the deadline. After it closes, nothing in the submission can change.
- Internal target: build done 2026-10-26, video recorded 2026-10-27, submitted 2026-10-29 (one day of slack).
- Judging and winners: the old kit lists judging 2026-12-01 to 2026-12-15 and winners on 2027-01-11. I did not re-check these dates today.

## Links

- Hackathon page: https://nebiusglobalaihackathon.devpost.com/
- Submission form: "Join hackathon", then "Enter a submission" on the same page. It opens Devpost's project form at https://devpost.com/software/new, which needs a Devpost login. I could not open it logged out, so the field list below comes from the published "What to Submit" list, rules section 5 and Devpost's standard project form. Check it against the live form when you log in.
- Official rules: https://nebiusglobalaihackathon.devpost.com/rules
- Resources (credits): https://nebiusglobalaihackathon.devpost.com/resources
- Nemotron on Token Factory: https://nebius.com/services/token-factory/nemotron
- Token Factory API (OpenAI-compatible): `https://api.tokenfactory.us-central1.nebius.com/v1/`, model id `nvidia/nemotron-3-super-120b-a12b` (from the Nemotron page's example)
- Kipdeck repo: https://github.com/zbagdzevicius/kipdeck (public, GitHub detects MIT)
- Upstream: https://github.com/AgentSystemLabs/agent-office (MIT, webdevcody / AgentSystemLabs)
- Replay demo: https://kipdeck-demo.vercel.app (scripted agents, no model. It does not show Nemotron)
- Site: https://kipdeck.com. Contact: hello@kipdeck.com

## Fit

- $50,000 in cash. Every country except "standard exceptions" (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea and countries under full US sanctions). Lithuania is eligible.
- Hard requirement (pass/fail stage one): the project "must run on either Nebius Token Factory or Nebius AI Cloud and use at least one NVIDIA open source model". Kipdeck does not do this today, so the Nebius provider below has to be built before we enter.
- Track: Coding and Agentic Engineering, described as "Build coding agents and developer tools: agents that write, run, and test code in Token Factory." Kipdeck is an inbox where a person deploys coding agents, answers their questions, reads a review brief and merges. Nemotron through OpenCode makes those agents run on an open model, and the merge stays a human decision. That fits the track's wording directly.
- New work: upstream agent-office started 2026-09-25 and our first commit is 2026-09-30, both after the 2026-08-26 opening. All of it falls inside the submission period. We still disclose upstream (rules 5: "original work product... solely owned by you"), see Blockers.
- Stage two weighs four criteria equally: technological implementation, design, potential impact, quality of the idea.
- Weak spots: the per-worker Docker sandbox does not exist (`docs/security.md:125` says "No sandbox... The Docker sandbox from the `launch/docker-sandbox` branch isn't part of this version"), and the public replay demo shows no model at all.

## Ask

- Main target: Coding and Agentic Engineering Track Winner (1 NVIDIA Jetson Orin Nano). That is the realistic prize for a developer tool in its own track.
- Stretch: the overall placings (Grand Prize $20,000, 2nd $10,000, 3rd $6,000), judged across all tracks on the same four criteria.
- Side prizes: Most Valuable Feedback ($100 cash plus an NVIDIA swag pack, 10 winners), which needs careful feedback written from real runs. Best Use of Tavily ($3,000, 1 winner) only if the optional Tavily search MCP is built (To build item 6).
- Not in reach: City Winner Awards ($500, 20 winners). They are for Builders & Brews attendees, and all 20 events (latest LA, 2026-10-13) are over, none in Lithuania.
- Free credits to use: $25 of Token Factory credits through the resources page form (activation code `NEBIUS-DEVPOST-GLOBAL26`) and $25 more through the free Nebius Builders Program.

## Eligibility checklist and blockers

Every box here must be ticked before submitting. The first one is open in every kit.

- [ ] Employer (Nortal): written permission for outside work on Kipdeck, confirmation that Nortal claims no IP in it, and permission to accept a cash or hardware prize. Rules 5 require the submission to be "solely owned by you... with no other person or entity having any right or interest in it", so an IP claim by the employer would disqualify it. Not done. This is the top blocker.
- [ ] Ownership and the fork: the same clause sits awkwardly with code that is MIT-licensed upstream work. Before submitting, email the hackathon manager (the "Email the hackathon manager" link on the overview page) and ask whether an MIT fork with disclosed upstream code is eligible when only our additions are claimed. Save the reply. The rules require a written clarification request for anything ambiguous.
- [ ] Company registration: none exists. Enter as an individual (or as a team of individuals). An Organization entry needs a legal entity at the time of entry. Prize money goes to the individual, who handles Lithuanian tax on it (rules 7: winners pay all fees and taxes).
- [ ] Team: co-founders undecided (D9). Enter as an individual for now; Devpost lets you add teammates until the deadline. [FOUNDERS: team]
- [ ] Personal fields: Devpost profile name, email, age confirmation and, if you win, prize payment and tax forms. [FOUNDERS: fill in on Devpost yourself]
- [ ] Product claims: Nemotron support does not exist today (To build item 1). Do not save the submission as final until it is merged on `main`.
- [ ] Other contests: Kipdeck is also entered in Colosseum. These rules do not forbid that. Rules 5 do forbid projects built with "financial or preferential support from the Sponsor or Administrator" (Nebius or Devpost). The $25 hackathon credits are offered to all entrants, but list any other Nebius credits received.

## Pre-existing code disclosure

The form asks for it in field 11 (under Project description) only if the project existed before 2026-08-26. Kipdeck did not, but the base is someone else's work, so fill it anyway; the "Credit and what is new" part of field 5 says the same.

## Project description: form answers

Fields are listed in the order Devpost shows them. Where the hackathon sets no limit I give Devpost's default.

### 1. Project name (Devpost limit: 60 characters)

```field name="Project name" max-chars=60
Kipdeck: coding agents on Nemotron, merged by a person
```
(54 characters)

### 2. Elevator pitch / tagline (Devpost limit: 200 characters)

```field name="Elevator pitch" max-chars=200
The inbox for your AI coding agents. Run a queue of OpenCode agents on NVIDIA Nemotron via Nebius Token Factory, answer their questions, read a review brief, and a person merges. Open source, MIT.
```
(196 characters)

### 3. Thumbnail (Devpost: JPG, PNG or GIF, up to 5 MB, 3:2)

Use `docs/img/inbox-phone.png` or a fresh 3:2 screenshot of the inbox with three or more Nemotron agents in Working, Needs you and To review, the model name visible on each row. Take it after To build item 1, so the rows really say Nemotron.

### 4. Category / track (single choice)

```
Coding and Agentic Engineering Track
```

### 5. About the project (Devpost markdown, no limit stated. Keep it under about 450 words so it reads in two minutes)

Paste as is. Fill in the two `[AFTER RUNS: ...]` lines from real runs, never from guesses. If the sandbox (To build item 5) is not merged by submission day, delete the sentence marked [IF SANDBOX BUILT].

```field name="About the project"
## Inspiration
Coding agents now do real work, but a team running five of them lives in five terminal tabs, finds out too late that one was waiting on a question, and reviews diffs with no record of what the agent was asked. Most of those agents also run on closed models. We wanted one place to run a whole queue of coding agents on an open model, with a person deciding what gets merged.

## What it does
Kipdeck is the inbox for your AI coding agents. You deploy an agent with a task, and it works on a branch of its own. The inbox ranks every agent as Needs you, Stuck, To review, Working or Idle, so the oldest one waiting on you opens first. You answer its question in one box. When it is done you read its review brief (what it was asked, what it says it did, your answers, its test runs, the risky parts of the diff) beside the diff, then Merge or send it back. Every merge and send-back is kept as a signed record of the agent, model, prompt and reviewer.

For this hackathon, Kipdeck's OpenCode agents run on NVIDIA Nemotron 3 Super served by Nebius Token Factory. Set NEBIUS_API_KEY and every new OpenCode agent can use Nemotron, with its cost shown on its row and in today's spend. [IF SANDBOX BUILT: Each agent runs in a throwaway Docker container with CPU, memory and time limits and no host credentials.]

## How we built it
Kipdeck is TypeScript (Node server, browser client) and builds on agent-office, an MIT project by webdevcody / AgentSystemLabs. OpenCode takes custom OpenAI-compatible providers in its inline config. Kipdeck merges a "nebius" provider pointing at Token Factory's OpenAI-compatible API into each worker's OPENCODE_CONFIG_CONTENT, and the key is passed only as an environment reference, never written into the config. A price table gives per-agent cost, which feeds the existing budget caps (warning at 80 percent, pause at 100). Tests cover the config merge, the pricing and the hire flow in a headless browser.

## Challenges we ran into
[AFTER RUNS: what actually broke with Nemotron tool calls, long sessions or context limits, and what we changed]

## Accomplishments that we're proud of
A team can now run a queue of coding agents on an open model, from a phone if they want, without letting any agent merge its own work.

## What we learned
[AFTER RUNS: which Nemotron size handled which kind of task, measured on our own runs]

## What's next
Routing each task to the cheapest Nemotron model that passes its tests, and a Nebius AI Cloud deploy script so a team can keep the whole thing on infrastructure it controls.

## Credit and what is new
Built on agent-office (github.com/AgentSystemLabs/agent-office), MIT, by webdevcody / AgentSystemLabs and community contributors. We are not affiliated with them. Upstream started 2026-09-25 and built the desks where agent CLIs run in live terminals, the GitHub boards and the deploy scripts. Ours, from 2026-09-30: the inbox and mission control, the review brief, the security layer, Proof of Merge and the Nebius Token Factory provider. Our changes: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

### 6. Built with (tags)

```
typescript, node.js, opencode, nvidia-nemotron, nemotron-3-super, nebius-token-factory, openai-compatible-api, git, github-cli, playwright, docker
```
(Keep `docker` only if To build item 5 is merged. Add `tavily` only if item 6 is built.)

### 7. "Try it out" links / demo URL (required: "a URL to a working demo, hosted application, or test build")

The replay demo has scripted agents and no model, so it does not count as a Nemotron demo. Use the test build route, which the rules allow:

```
https://github.com/zbagdzevicius/kipdeck#run-on-nvidia-nemotron-via-nebius-token-factory
https://kipdeck-demo.vercel.app
https://kipdeck.com
```
The first link is the README section added by To build item 1: `NEBIUS_API_KEY=... npx github:zbagdzevicius/kipdeck --agent opencode`. If item 4 (a recorded Nemotron round) ships, use that as the first link instead.

### 9. Public code repository URL (required: GitHub, GitLab or Bitbucket, license visible at the top)

```
https://github.com/zbagdzevicius/kipdeck
```
GitHub detects MIT today (`licenseInfo: mit`). The README must also "highlight how you've used NVIDIA Nemotron... where Token Factory accelerated your workflow and any other Nebius Tools or Services used". That is To build item 1's README section.

### 10. Feedback on Nebius Token Factory, AI Cloud and NVIDIA tools (required. This field is judged for the Most Valuable Feedback prize)

Write it after the real runs. It has to be specific to earn the $100. Skeleton:

```field name="Feedback on Nebius Token Factory, AI Cloud and NVIDIA tools"
What we used: Nebius Token Factory (OpenAI-compatible API, us-central1), NVIDIA Nemotron 3 Super 120B (nvidia/nemotron-3-super-120b-a12b) [and Nano 30B / Ultra 550B if tried], driven by OpenCode as a custom provider inside Kipdeck.

What worked: [AFTER RUNS: e.g. drop-in OpenAI compatibility, latency on short tool calls, price per task]

What got in the way: [AFTER RUNS: tool-call format issues, context limits on long sessions, rate limits, error messages, how credits and usage showed up in the console]

What we would ask for: [AFTER RUNS: one to three concrete requests, e.g. a usage API per key so tools can show live spend, documented tool-calling behaviour per Nemotron size]

Numbers from our runs: [AFTER RUNS: tasks run, share that passed their tests first time, median tokens and cost per merged task]
```

### 11. Pre-existing work explanation (asked only "if your Project existed before the Submission Period")

Kipdeck did not exist before 2026-08-26, so strictly this field is not needed. Fill it anyway if the form shows it, because the base is someone else's work:

```field name="Pre-existing work explanation"
Kipdeck did not exist before the submission period. It is built on agent-office (MIT) by webdevcody / AgentSystemLabs, whose first commit was 2026-09-25, also inside the period. Our first commit is 2026-09-30. Upstream: the desks where agent CLIs run, terminals, GitHub boards, deploy scripts. Ours: the inbox and mission control, the review brief, the security layer, Proof of Merge and the Nebius Token Factory provider for OpenCode agents. Every commit and file we changed: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

### 12. Builders & Brews city (optional)

```
None (did not attend)
```

### 13. Submitter type, country and team (Devpost profile and submission fields)

- Submitter type: Individual, unless Nortal or a company enters (see Blockers). Organizations must "exist and have been organized or incorporated at the time of entry".
- Country of residence: Lithuania.
- Team members: [FOUNDERS: team. Kipdeck is founder-led by Zygimantas Bagdzevicius (CEO/CTO). Invite any co-founder by Devpost username only after decision D9]
- Representative (if a team): Zygimantas Bagdzevicius.
- Personal fields Devpost asks for (name, email, date of birth or age confirmation, address for prize payment): [FOUNDERS: fill in yourself on Devpost. Not written here]

### 14. Image gallery (optional, Devpost: up to about 5 MB each)

Four screenshots taken after the build: inbox with Nemotron rows; hire dialog with the Nebius model; review brief beside a diff; Token Factory usage page next to the agent's cost.

## Judging criteria

Stage one is pass/fail: the project must run on Nebius Token Factory or Nebius AI Cloud and use at least one NVIDIA open model. Stage two weighs four criteria equally.

| Criterion (equal weight) | Our answer |
| --- | --- |
| Technological implementation | OpenCode agents on Nemotron 3 Super via Token Factory's OpenAI-compatible API, key passed only as an env reference, per-agent cost feeding the budget caps; tests for the config merge and pricing |
| Design | One inbox ranks every agent (Needs you, Stuck, To review, Working, Idle); answer in one box; review brief beside the diff |
| Potential impact | Teams can run a queue of coding agents on an open model, and a person still decides what merges |
| Quality of the idea | Coding agents on an open model with a human merge gate and a signed record per merge |

Other prizes: track winner (NVIDIA Jetson Orin Nano), Most Valuable Feedback ($100 plus swag, judged on field 10), Best Use of Tavily ($3,000, only if To build item 6 ships).

## Demo video script

The form field is "8. Video demo link" (public YouTube, under 3:00; judges may stop at 3:00).

Script below. Narrate in your own voice. No copyrighted music, and no third-party marks beyond the sponsor names needed to explain the integration (rules 5).

Runtime target: 2:58 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:12 | Kipdeck inbox with four agents across Working, Needs you and To review. Each row says Nemotron 3 Super | "This is Kipdeck, the inbox for your AI coding agents. Every agent here runs on NVIDIA Nemotron, served by Nebius Token Factory." |
| 0:12-0:30 | Terminal: `export NEBIUS_API_KEY=...` (blurred), then `npx github:zbagdzevicius/kipdeck --agent opencode`. Browser opens signed in | "One environment variable. Start Kipdeck in your repository and it opens in the browser." |
| 0:30-0:55 | Deploy agent: pick OpenCode, model `nebius/nvidia/nemotron-3-super-120b-a12b`, paste a GitHub issue, deploy two more from the queue | "Deploy an agent with a task. Queue a few more. Each one works on its own branch." |
| 0:55-1:20 | An agent's terminal: reads code, edits, runs tests, a test fails, it fixes it and the tests go green | "It writes the change, runs the tests and fixes what fails, all on Nemotron." |
| 1:20-1:40 | Agent moves to Needs you. Answer its question in the one box | "When it needs you, it moves to the top. You answer in one box and it carries on." |
| 1:40-2:00 | Token Factory usage page showing the calls on Nemotron 3 Super, next to the agent's cost on its row and today's spend | "Every call goes to Token Factory. Kipdeck shows what each agent spent, with budget caps that pause it." |
| 2:00-2:30 | To review: the review brief beside the diff (asked, did, answers, test runs, risky lines). Click Merge. It lands in Shipped today | "The agent never merges its own work. You read its brief and the diff, and you merge." |
| 2:30-2:50 | [IF SANDBOX BUILT: an agent runs a destructive command, the container stops it, the host is untouched.] Otherwise: the signed record in Numbers, merge rate per model | "Every merge is kept as a signed record: which agent, which model, which prompt, who reviewed it." |
| 2:50-2:58 | Title card: repo URL, "Built on agent-office by webdevcody (MIT)" | "Open source, MIT, built on agent-office. Links below." |

Trim the 2:30 shot first if it runs long.

## To build before submitting

The kit says `launch/nebius-nemotron` worked on 2026-10-01. Today it is gone: no local branch, no remote branch (`git ls-remote` shows none), and no file on `main` mentions Nebius or Nemotron outside `launch/` and `business/`. Nothing below exists yet. Every item is a PR from fresh `origin/main` in a worktree, added as its own module through the registries (`docs/code-layout.md`, `tests/size.test.ts` stays green), checked with `npm run typecheck`, `npm test`, `npm run build` and a headless screenshot.

| # | Item | Needed for | Estimate |
| --- | --- | --- | --- |
| 1 | Nebius Token Factory provider for OpenCode agents. `NEBIUS_API_KEY` merges a `nebius` OpenAI-compatible provider (base URL above) into each worker's `OPENCODE_CONFIG_CONTENT`, keeping existing inline settings (`docs/agents.md:44` already preserves them). The key goes in only as `{env:NEBIUS_API_KEY}`. `--nebius default` makes model-less OpenCode hires use Nemotron 3 Super. Nemotron prices from the Token Factory price page feed per-agent cost and today's spend. Also: `NEBIUS_API_KEY` on the worker environment allowlist, unit and integration tests, a headless hire-dialog test, `docs/nebius.md` and a README section "Run on NVIDIA Nemotron via Nebius Token Factory" | Stage one pass/fail; video; README requirement | 1.5-2 days |
| 2 | Real runs: 10 or more tasks on Nemotron 3 Super (and Nano / Ultra for comparison) against a real repo. Note tool-call failures and fix what is ours. Fill in the "[AFTER RUNS]" lines and the feedback | Description, feedback prize, honest claims | 0.5-1 day |
| 3 | Fallback if Nemotron tool calls fail in OpenCode: try Ultra 550B, or adjust the provider options. Leave as a known limit in the description | Risk | 0-0.5 day |
| 4 | Recorded Nemotron round as a second hosted replay (adapt `deploy/replay/record.mjs`, which today records only the scripted demo, to record a live session, scrub it, deploy next to kipdeck-demo) | A "working demo" link with no install. Optional: the test build route already meets the rule | 1 day |
| 5 | Per-agent Docker sandbox (container per worker, CPU/memory/time caps, no host credentials, destroyed on finish). Not built: `docs/security.md:125`. Shared with the Vultr Agent Rush entry (2026-11-03 to 11-08) | Optional here. Do not claim it unless merged | 2-3 days |
| 6 | Tavily search MCP for OpenCode agents behind `TAVILY_API_KEY` (config merge only) | Best Use of Tavily ($3,000). Optional | 0.5 day |
| 7 | Video (recording, voiceover, edit, YouTube upload as public) | Required | 0.5 day |
| 8 | Refresh `launch/nebius-nvidia.md` to the Kipdeck name and disclosure | Done on 2026-10-14 (this kit) | 0 |

Minimum to enter: items 1, 2, 7 and the README part of 1, about 3 to 3.5 working days. With 16 days left that fits, but only if work starts by 2026-10-22 at the latest. Items 4 to 6 add 3.5 to 4.5 days.

## Submission checklist

- [ ] Nortal written permission (outside work, IP, prizes) saved.
- [ ] Organizer's reply on the MIT fork question saved.
- [ ] Devpost account, "Join hackathon" done. Token Factory credits redeemed (`NEBIUS-DEVPOST-GLOBAL26`) plus Builders Program. Spending cap set.
- [ ] To build item 1 merged on `main`: Nemotron via Token Factory works from a clean `npx github:zbagdzevicius/kipdeck`.
- [ ] README section on Nemotron and Token Factory live. License shows at the top of the repo page.
- [ ] Ten or more real Nemotron runs done. "[AFTER RUNS]" lines and the feedback filled in from them.
- [ ] No unbuilt claim left: every "[IF SANDBOX BUILT]" sentence and the `docker` tag removed unless item 5 merged.
- [ ] Screenshot of the Token Factory usage page for the video and gallery.
- [ ] Video under 3:00, public on YouTube, own voice, no copyrighted music.
- [ ] Thumbnail (3:2) and gallery images uploaded.
- [ ] Track set to Coding and Agentic Engineering. City set to none.
- [ ] Diff link re-stamped with the submitted `origin/main` commit (`npx tsx launch/chain/tools/whats-new.ts`).
- [ ] Every field pasted. No `[FOUNDERS: ...]` or `[AFTER RUNS: ...]` left in the text.
- [ ] Submitted before 2026-10-30 10:00 PDT (19:00 Vilnius), target 2026-10-29. Confirmation email and project URL saved.
