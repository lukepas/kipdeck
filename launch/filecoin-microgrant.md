# Filecoin devgrants microgrant

**Drafted on 2026-10-01 under the old name.** The product is now Kipdeck, the inbox for your AI coding agents, built on agent-office (MIT, by webdevcody / AgentSystemLabs), with Proof of Merge as its payout layer. Refresh the product name, what is built and the disclosure from [chain/disclosure.md](chain/disclosure.md) before you use this kit.

Last checked: 2026-10-01. Sources: the filecoin-project/devgrants repository and its Microgrants and Builder Next Step pages (links below). fil.org/grants refused the request again (HTTP 429), so the 2026 status of every program here is [unverified]. The repository's README now lists Open Grants (up to $50,000, by GitHub issue) and RFPs (none open, "Stay tuned!"); the Microgrant and Next Step pages are still in the repo but not listed there.

Plan: **not ready to apply.** Every Filecoin program below needs a working prototype built on Filecoin, IPFS or related technology first, and none of the fork's workstreams touch Filecoin yet. The prototype that fits Agent Office: archive a worker's session (terminal recording, the PR it opened, the meeting notes and whiteboards from the office) to IPFS and Filecoin, so a team has a verifiable, permanent record of what its agents did. Build that small prototype first, then apply.

## Deadline

- **Rolling** for Open Grants. The microgrant page's last listed focus area is "Filecoin Virtual Machine, Wave 2" with a deadline of 2023-04-20, so the microgrant track may be paused [unverified].
- Replies take 2 to 4 weeks. Work must fit in 1 to 3 months after signing.
- Internal target: prototype by 2026-11-24, apply **2026-11-25** after the Meta deadline, if the prototype exists and a program is open.

## Links

- Devgrants repo (apply by GitHub issue): https://github.com/filecoin-project/devgrants
- Next Step Microgrants: https://github.com/filecoin-project/devgrants/blob/master/Program%20Resources/Microgrants%20README.md
- FIL Builder Next Step Grants: https://github.com/filecoin-project/devgrants/blob/master/Program%20Resources/Builder%20Next%20Step%20Grants.md
- Filecoin Foundation grants: https://fil.org/grants
- Contact: grants@fil.org

## Eligibility checklist

- [ ] Pick the program that is actually open on the day (check the repo's README and issue templates):
  - Next Step Microgrant: $5,000 paid in FIL ($1,000 up front, $4,000 after a functional deployment to Filecoin mainnet or the latest testnet); needs a working prototype on Filecoin or related technology (IPFS, IPLD, libp2p and similar); must fit the current focus area.
  - FIL Builder Next Step Grant: $5,000 to $10,000; needs an on-chain project on the Filecoin Virtual Machine and a proof of concept (or a strong web3 background), deployed to the calibration testnet and mainnet. A session archive on IPFS is not an FVM project, so this one likely does not fit.
  - Open Grant: up to $50,000; for work that advances the Filecoin ecosystem or brings significant new usage.
- [ ] A working prototype exists (**not yet**).
- [ ] Work completable within 3 months.
- [ ] Grant-funded work open source (the microgrant page asks for MIT for code; check the license terms of the program you apply to).
- [ ] Monthly progress updates as comments on the GitHub issue, and a final report.
- [ ] Payment in FIL: a Filecoin wallet; KYC and tax forms [unverified].
- [ ] Employer: the employer's permission for outside work and for receiving grant money.

## Pre-existing code disclosure

These two fields describe a prototype that does not exist yet. Rewrite them from what is actually built before filing.

```field name="Prior work" max-chars=800
Our prototype is part of a fork of Agent Office, an MIT open source 3D office for coding agents by webdevcody / AgentSystemLabs (github.com/AgentSystemLabs/agent-office). The office, its workers and terminals are upstream work. Ours: the session archive that stores a worker's terminal recording, pull request and meeting notes on IPFS and Filecoin, and everything the grant would fund. Our changes against upstream: https://github.com/zbagdzevicius/kipdeck/compare/226452e4...main
```

## Project description

The application is a GitHub issue from the program's template. The template's sections (per the program pages): a clear description of the next step, success metrics, the technical design, the problem, milestones, how the grant supports the next step, the open source commitment and the monthly updates. No length limits are published.

```field name="Next step" max-words=200
Agent Office puts a team's AI coding agents at desks in a shared 3D office. Teams now let those agents change production code, and they need a record of what each agent did that nobody can quietly edit later. Our prototype archives a finished worker session to IPFS: its terminal recording, the diff and pull request it produced, and the notes and whiteboards from the meeting where the task was assigned, bundled as a CAR file and pinned. The next step, which this grant funds, is storing those archives in Filecoin deals with retrieval from the office (click a desk's history to replay any past session), a CID written to the pull request so reviewers can verify the record, and a retention setting per team.
```

| Milestone | Deliverable | Success metric |
| --- | --- | --- |
| M1 (month 1) | Filecoin storage for session archives, CID on the PR | 100 archived sessions from 3 teams |
| M2 (month 2) | Replay from the archive in the office; retention settings | Replay of any archived session in under 10 seconds |
| M3 (month 3) | Docs, a reusable archive library, write-up | Library published; one external project using it |

## Judging criteria

| What the program asks for | Our answer |
| --- | --- |
| A working prototype | The IPFS session archive (to build first) |
| A clear next step | Filecoin deals, replay and verifiable CIDs, in 3 months |
| New usage for Filecoin | Every agent session is a new, steadily growing dataset worth keeping |
| Open source | MIT, public repo, monthly updates on the issue |

## Demo video script

The template may not ask for a video [unverified]; link a short one from the issue.

Runtime target: 1:20 (limit: under 3:00)

| Time | Shot | Voiceover |
| --- | --- | --- |
| 0:00-0:20 | A worker finishes a task at its desk | "When an agent finishes, its whole session is archived." |
| 0:20-0:45 | The CAR file, its CID, the CID on the pull request | "Terminal, diff and notes go to IPFS, and the CID goes on the PR." |
| 0:45-1:05 | Click the desk's history; the session replays from the archive | "Anyone can replay what the agent did, and verify it has not changed." |
| 1:05-1:20 | Card: next step is Filecoin storage; built on Agent Office (MIT) | "The grant takes it to Filecoin storage." |

## Submission checklist

- [ ] Prototype working and public (this is the blocker).
- [ ] The program to apply to is confirmed open (repo README, issue templates, or an email to grants@fil.org).
- [ ] Issue filed from the right template, all sections filled.
- [ ] the employer's written permission saved.
- [ ] All `{{...}}` placeholders filled; `npx tsx launch/tools/lint.ts` clean.
- [ ] Calendar reminder for monthly updates once funded.
