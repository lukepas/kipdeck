# Launch kits

Submission and application kits for Kipdeck, our fork of Agent Office: five hackathons, four grant programs and sponsorship, with every deadline in one calendar. Written on 2026-09-30 from each program's official pages and re-checked against them on 2026-10-01. The root kits below were drafted under the old name and each says so at the top; the Colosseum and Solana kits under [chain/](chain/README.md) are the current Kipdeck versions. Rules change: re-read the official page before you submit, and fix the kit when they differ.

Agent Office is an MIT open source project by webdevcody / AgentSystemLabs. This fork is not theirs and they have not endorsed it. Every kit credits upstream and lists exactly what the fork adds; the shared wording and the facts behind it are in [disclosure.md](disclosure.md).

## Programs

The ranked list with links, form links, Vilnius deadlines, asks and blockers is [PROPOSALS.md](PROPOSALS.md) (2026-10-14).

| Kit | Program | Closes | What we enter |
| --- | --- | --- | --- |
| [chain/colosseum-worlds-fair.md](chain/colosseum-worlds-fair.md) | Colosseum Crypto World's Fair | 2026-10-12 23:59 PT | Kipdeck, with Proof of Merge as its payout layer. The older [colosseum-worlds-fair.md](colosseum-worlds-fair.md) here is superseded |
| [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | Amazon Build Ship Shape, Alexa+ track | 2026-10-23 12:00 PT | Remote MCP server so Alexa+ can run the office |
| [nebius-nvidia.md](nebius-nvidia.md) | Nebius x NVIDIA Global AI Hackathon | 2026-10-30 10:00 PT | Workers on Nemotron via Token Factory, in sandboxes |
| [vultr-agent-rush.md](vultr-agent-rush.md) | Vultr Agent Rush (lablab.ai) | 2026-11-08 [unverified time] | Sandboxed workers on a Vultr VM |
| [meta-vr-start.md](meta-vr-start.md) | Meta VR Start Developer Competition 2026 | 2026-11-18 12:00 PT | WebXR, hands-first office in the Quest browser |
| [chain/solana-foundation-grant.md](chain/solana-foundation-grant.md) | Solana Foundation grant | rolling | Open source escrow program and SDK. The older [solana-foundation-grant.md](solana-foundation-grant.md) here is superseded |
| [chain/base-builder.md](chain/base-builder.md) | Base Builder Grants | rolling | Proof of Merge and x402 on Base, only after a mainnet decision. The older [base-builder-grants.md](base-builder-grants.md) here is superseded |
| [filecoin-microgrant.md](filecoin-microgrant.md) | Filecoin devgrants | rolling [unverified status] | Not ready: needs an IPFS prototype first |
| [innovation-agency-lithuania.md](innovation-agency-lithuania.md) | Innovation Agency Lithuania | 2026-11-11 17:00 EET | Travel refund for the Salt Lake City on-site day |
| [gitlab-life-after-code.md](gitlab-life-after-code.md) | GitLab Life After Code (GitLab Transcend) | 2026-10-27 13:00 UTC | Path B, Supervised: Duo flows run everything but the merge |
| [paypal-ai-hackathon.md](paypal-ai-hackathon.md) | PayPal AI Hackathon | 2026-11-12 12:00 PT | PayPal rail for Proof of Merge bounties and a `post_bounty` MCP tool |
| [openai-codex-for-oss.md](openai-codex-for-oss.md) | OpenAI Codex for Open Source | rolling | USD 5,000 in API credits for Codex PRs on Kipdeck and monthly merge reports |
| [superteam-agentic-engineering.md](superteam-agentic-engineering.md) | Superteam Agentic Engineering Grant | rolling (paused) | USD 200 for the public Blink and a first outside Action run |
| [stellar-scf-46.md](stellar-scf-46.md) | Stellar Community Fund SCF #46, Integration track | 2026-11-08 [unverified time] | Merge-gated USDC bounties on Trustless Work escrows |
| [chain/arbitrum-dubai.md](chain/arbitrum-dubai.md) | Arbitrum Open House Dubai | 2026-12-06 16:01 UTC | Proof of Merge on Arbitrum Sepolia |
| [sponsors.md](sponsors.md) | GitHub Sponsors and Open Collective | none | Sponsor profile for the fork |

Each kit has the same sections in the same order: deadline, links, eligibility checklist, pre-existing code disclosure, project description (the form's fields, within their limits), judging criteria mapped to our features, demo video script with shot list and timing, and submission checklist.

## Read this first

The risks that could sink an entry, in order:

1. **The base project is someone else's, and it is new.** Upstream's first commit is 2026-09-25. Meta's Adapted division needs a project that existed before 2026-09-24, and its New division says "no pre-existing codebases", so neither fits cleanly; the others want work that is new or significantly updated during their period, and none says whether a fork of a third-party project counts. Ask each organizer in writing (task on 2026-10-01) and disclose everything regardless.
2. **Employer permission.** Colosseum's rules make you warrant that entering does not breach your employer's policies. Get Nortal's written position on outside work, IP and prizes before registering anywhere.
3. **Memberships that take time.** Meta requires Meta VR Start membership at submission time; approval time is unknown. Colosseum closes registration at the submission deadline. Apply on day one.
4. **One demo, many rules.** Vultr requires every model call through Vultr Serverless Inference; Nebius requires Token Factory and an NVIDIA open model; Meta requires hands-only. Keep a per-event configuration rather than one demo that half-fits all.
5. **Public demos run real agents.** Judges get a live office. Sandboxes, spending caps and a judge password are part of every checklist.
6. **AI-generated video.** Meta's judging notes say to show real footage that honestly represents the experience and not to lean on AI-generated video to carry the pitch. The other rules are silent on AI voiceover; every script assumes your own voice.
7. **Drafts describe the plan, and most of the plan is not built.** On 2026-10-01 only `launch/nebius-nemotron` and `launch/x402-base` work end to end; `launch/voice-mcp` has a tested MCP-over-HTTP core that the office does not serve yet; `launch/webxr-mode`, `launch/docker-sandbox`, `launch/vultr-deploy` and `launch/solana-escrow` have no commits. The status table in [disclosure.md](disclosure.md) has the details. The project descriptions and video scripts are written as if each workstream ships as planned. Before submitting, cut every claim the branch does not do yet, and fill the `{{...}}` numbers with real figures or "none yet".

## Timeline

Every dated item from 2026-09-30, generated from [deadlines.json](deadlines.json). Times are as the organizer states them, then UTC, then Vilnius. Items marked [unverified] were not published on the official pages on 2026-09-30.

<!-- timeline:start (generated by launch/tools/calendar.ts from deadlines.json) -->
| Date | What | Time | Kit | Status |
| --- | --- | --- | --- | --- |
| 2026-09-30 | Kickoff: apply to Meta VR Start, register on Colosseum Arena, Devpost (Amazon, Nebius, Meta) and lablab.ai | all day | this page | our target |
| 2026-10-01 | Ask each organizer whether a fork of a third-party MIT project is eligible; send a courtesy note to the upstream author | all day | [disclosure.md](disclosure.md) | our target |
| 2026-10-02 | Enable GitHub 2FA, apply for GitHub Sponsors, decide on an Open Collective host | all day | [sponsors.md](sponsors.md) | our target |
| 2026-10-09 | Colosseum: freeze the build, record the pitch and technical demo videos | all day | [chain/colosseum-worlds-fair.md](chain/colosseum-worlds-fair.md) | our target |
| 2026-10-12 | **Colosseum Crypto World's Fair: registration and submission close** | 23:59 PT (PDT, UTC-7); 2026-10-13 06:59 UTC; 2026-10-13 09:59 Vilnius | [chain/colosseum-worlds-fair.md](chain/colosseum-worlds-fair.md) | confirmed 2026-09-30 |
| 2026-10-14 | GitLab Life After Code: register on Devpost and start contributor onboarding (about 24 business hours) | all day | [gitlab-life-after-code.md](gitlab-life-after-code.md) | our target |
| 2026-10-14 | Solana Foundation grant: submit the application (rolling, reuse the Colosseum material) | all day | [chain/solana-foundation-grant.md](chain/solana-foundation-grant.md) | our target |
| 2026-10-15 | Amazon Build Ship Shape: go or no-go on the Alexa+ build (needs 6 free days) | all day | [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | our target |
| 2026-10-15 | Ask Nortal for written permission (outside work, IP, prizes and grants): blocks every kit | all day | [PROPOSALS.md](PROPOSALS.md) | our target |
| 2026-10-15 | Superteam Agentic Engineering: email support@superteam.fun asking when applications reopen | all day | [superteam-agentic-engineering.md](superteam-agentic-engineering.md) | our target |
| 2026-10-15 | Vultr Agent Rush: sign up on lablab.ai, join the Discord, ask about the on-site day in Salt Lake City | all day | [vultr-agent-rush.md](vultr-agent-rush.md) | our target |
| 2026-10-16 | OpenAI Codex for Open Source: apply (rolling) within 2 days of Nortal's written OK | all day | [openai-codex-for-oss.md](openai-codex-for-oss.md) | our target |
| 2026-10-16 | Stellar SCF #46: file the interest form on the SCF dashboard (invites take about 2 weeks) | all day | [stellar-scf-46.md](stellar-scf-46.md) | our target |
| 2026-10-20 | Amazon: record the demo video and finish the friction log | all day | [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | our target |
| 2026-10-21 | Innovation Agency Lithuania: file the foreign-event travel application in KIP as soon as the Salt Lake City flights are booked | all day | [innovation-agency-lithuania.md](innovation-agency-lithuania.md) | our target |
| 2026-10-22 | Amazon Build Ship Shape: submit a day early | all day | [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | our target |
| 2026-10-23 | **Amazon Build Ship Shape (Alexa+ track): submission closes** | 12:00 PT (PDT, UTC-7); 2026-10-23 19:00 UTC; 2026-10-23 22:00 Vilnius | [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | confirmed 2026-09-30 |
| 2026-10-26 | GitLab Life After Code: submit by 20:00 Vilnius, then edit only until 12:00 on the 27th | all day | [gitlab-life-after-code.md](gitlab-life-after-code.md) | our target |
| 2026-10-27 | Nebius x NVIDIA: record the demo video, check the hosted demo and README | all day | [nebius-nvidia.md](nebius-nvidia.md) | our target |
| 2026-10-27 | **GitLab Life After Code (GitLab Transcend): submission closes** | 13:00 UTC; 2026-10-27 13:00 UTC; 2026-10-27 15:00 Vilnius | [gitlab-life-after-code.md](gitlab-life-after-code.md) | confirmed 2026-09-30 |
| 2026-10-29 | Nebius x NVIDIA: submit a day early | all day | [nebius-nvidia.md](nebius-nvidia.md) | our target |
| 2026-10-30 | **Nebius x NVIDIA Global AI Hackathon: submission closes** | 10:00 PT (PDT, UTC-7); 2026-10-30 17:00 UTC; 2026-10-30 19:00 Vilnius | [nebius-nvidia.md](nebius-nvidia.md) | confirmed 2026-09-30 |
| 2026-11-02 | Base Builder Grants: revisit at 10:00 Vilnius; nominate only once every mainnet gate in the kit is green | all day | [chain/base-builder.md](chain/base-builder.md) | our target |
| 2026-11-02 | Vultr Agent Rush: re-check the event page for the cut-off time and update vultr-final | all day | [vultr-agent-rush.md](vultr-agent-rush.md) | our target |
| 2026-11-03 to 2026-11-08 | Vultr Agent Rush: online build phase (start and end times not published yet) | all day | [vultr-agent-rush.md](vultr-agent-rush.md) | [unverified] |
| 2026-11-07 | Stellar SCF #46: Build form in by 18:00 Vilnius | all day | [stellar-scf-46.md](stellar-scf-46.md) | our target |
| 2026-11-08 | **Stellar SCF #46 Build Award: submissions close (no time or zone published)** | time not published | [stellar-scf-46.md](stellar-scf-46.md) | [unverified] |
| 2026-11-08 | **Vultr Agent Rush: submission cut-off (time not published; our target is 18:00 Vilnius) and on-site day in Salt Lake City** | time not published | [vultr-agent-rush.md](vultr-agent-rush.md) | [unverified] |
| 2026-11-11 | PayPal AI Hackathon: submit a day early | all day | [paypal-ai-hackathon.md](paypal-ai-hackathon.md) | our target |
| 2026-11-11 | **Innovation Agency Lithuania: startup foreign-event support call closes** | 17:00 Lithuania (EET, UTC+2); 2026-11-11 15:00 UTC; 2026-11-11 17:00 Vilnius | [innovation-agency-lithuania.md](innovation-agency-lithuania.md) | confirmed 2026-09-30 |
| 2026-11-12 | Meta VR Start: record real headset footage for the demo video (no AI-generated video) | all day | [meta-vr-start.md](meta-vr-start.md) | our target |
| 2026-11-12 | **PayPal AI Hackathon: submission closes** | 12:00 PT (PST, UTC-8); 2026-11-12 20:00 UTC; 2026-11-12 22:00 Vilnius | [paypal-ai-hackathon.md](paypal-ai-hackathon.md) | confirmed 2026-09-30 |
| 2026-11-16 | GitLab Life After Code: winners announced (on or around) | all day | [gitlab-life-after-code.md](gitlab-life-after-code.md) | confirmed 2026-09-30 |
| 2026-11-18 | **Meta VR Start Developer Competition 2026: submission closes** | 12:00 PT (PST, UTC-8); 2026-11-18 20:00 UTC; 2026-11-18 22:00 Vilnius | [meta-vr-start.md](meta-vr-start.md) | confirmed 2026-09-30 |
| 2026-11-25 | Filecoin: apply for a Next Step microgrant or an Open Grant, only if the IPFS prototype exists | all day | [filecoin-microgrant.md](filecoin-microgrant.md) | our target [unverified] |
| 2026-11-30 | Innovation Agency Lithuania: check for a new ICT prototype call | all day | [innovation-agency-lithuania.md](innovation-agency-lithuania.md) | our target [unverified] |
| 2026-12-03 | Amazon Build Ship Shape: winners announced (on or around) | all day | [amazon-build-ship-shape.md](amazon-build-ship-shape.md) | confirmed 2026-09-30 |
| 2026-12-05 | Colosseum Crypto World's Fair: winners announced (by) | all day | [chain/colosseum-worlds-fair.md](chain/colosseum-worlds-fair.md) | confirmed 2026-09-30 |
| 2026-12-11 | Meta VR Start Developer Competition: winners announced | all day | [meta-vr-start.md](meta-vr-start.md) | confirmed 2026-09-30 |
| 2026-12-21 | PayPal AI Hackathon: winners announced (on or around) | all day | [paypal-ai-hackathon.md](paypal-ai-hackathon.md) | confirmed 2026-09-30 |
| 2027-01-11 | Nebius x NVIDIA Global AI Hackathon: winners announced | all day | [nebius-nvidia.md](nebius-nvidia.md) | confirmed 2026-09-30 |
<!-- timeline:end -->

## Calendar

[calendar.ics](calendar.ics) holds every item above with reminders: deadlines alert 7 days, 2 days and 6 hours before closing; tasks alert at 09:00 on the day. Import it into Google Calendar (Settings, Import and export), Outlook or Apple Calendar. Timed deadlines are stored in UTC, so they show at the right local time anywhere.

## Tools

The kits are checked by `npm test`, so a broken limit fails the build instead of a submission.

```sh
npx tsx launch/tools/calendar.ts          # regenerate calendar.ics and the timeline above from deadlines.json
npx tsx launch/tools/calendar.ts --check  # exit 1 if either is stale
npx tsx launch/tools/lint.ts              # field lengths, video timings, sections, ASCII, placeholders left to fill
npx tsx launch/tools/whats-new.ts         # the "exactly what is new" list, from git, since 226452e4 (our import of upstream 1bc3028)
```

- Change a date: edit `deadlines.json`, run `calendar.ts`, commit all three files.
- Form answers live in fences like ```` ```field name="Elevator pitch" max-chars=200 ````; the linter counts characters and words against the limit written there. `{{LIKE_THIS}}` marks what only you can fill in (fork URL, video link, real numbers).
- Video scripts start with `Runtime target: 2:45 (limit: under 3:00)`; the linter checks the shot times run from 0:00 to the target without gaps and that the target is inside the limit.
- [templates/friction-log.md](templates/friction-log.md) is the friction log for Amazon's bonus and Nebius's feedback prize.

## Consultancy pilot

The pilot offer for teams adopting coding agents is on the `launch/business-playbook` branch. The Vultr, Nebius, Colosseum and Lithuania kits refer to it as the business model; keep the numbers there and the claims here consistent.
