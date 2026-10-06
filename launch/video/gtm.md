# Go-to-market note

For the Colosseum form's go-to-market field, which asks for "go-to-market strategy, demand validation, and plans for developing distribution", and for the pitch's traction beat. Written 2026-10-07. Every number in it is a target until you have run the step; replace targets with what actually happened before you paste anything.

## Who it is for first

Small engineering teams (2 to 20 people) and open source maintainers who already run three or more coding agents in parallel, from more than one vendor (Claude Code, Codex, Cursor, Pi). Their pain is not writing code. It is knowing which agent needs a person now, and getting through the review queue.

Why them first:

- They feel the problem today, so they can try the product today: mission control works with every chain feature off.
- A team that mixes vendors gets nothing from any single vendor's dashboard. That is the opening.
- Open source maintainers are the ones who can put a bounty on an issue, and they are public, so they can be found.

Bounties and Proof of Merge are a switch those same users turn on later, when they want to pay for merged work or show an agent's record. Lead with mission control in conversations; bring up the chain only when they ask how payment or trust would work.

## Business model

Open core. The office, the escrow program, the SDK and the board stay MIT, and the outcome data is CC0. Revenue: a hosted mission control seat for teams, and later a 1 to 2 percent fee on released bounties once the program is audited and on mainnet. No token.

## Channels

- Direct outreach to people who visibly run several agents (found below), one message each, no templates sent in bulk.
- Build in public on X and Farcaster: the daily posts in `launch/chain/posts/`, and the weekly "which coding agent's pull requests get merged?" board from `/pom/`.
- The agent-office community upstream, after telling webdevcody what the fork is (draft in `launch/chain/disclosure.md`). Don't recruit in his channels without asking.
- Funded issues as a magnet: a public repo with open devnet bounties is something agent operators can point their agents at today.
- Solana and Base developer channels for the bounty side only.

## Demand validation you can run this week

Seven days, one person, mostly evenings. Log every touch in one spreadsheet: who, where found, message sent, replied, call held, what they said, next step. Those rows are your evidence.

### Tuesday to Wednesday (2026-10-07 to 10-08): build the list

1. Find 40 people or teams who run several agents. Search for pull requests agents opened recently:

   ```sh
   gh search prs "Generated with Claude Code" --created ">2026-09-30" --limit 100 --json repository,author,url
   gh search prs "Co-Authored-By: Claude" --created ">2026-09-30" --limit 100 --json repository,author,url
   ```

   Keep repositories with two or more human contributors and agent PRs from more than one tool, or many agent PRs a week. Add people who post on X about running agents in parallel.

2. Pick 10 open source maintainers among them whose repos have small, well-scoped open issues.

### Wednesday to Friday (10-08 to 10-10): talk to them

3. Message 30 of the 40. Ask for 15 minutes to learn how they manage several agents, not to pitch. Example:

   ```text
   Hi <name>, I saw <repo> gets PRs from <tools>. I'm building a tool for teams
   running several coding agents at once and I'm trying to learn how people manage
   it today. Could I ask you 3 questions over 15 minutes this week? No pitch.
   ```

4. Hold as many calls as you can; aim for 8. Ask about the past, not about your idea:

   - How many agents ran in parallel last week, and from which tools?
   - Tell me about the last time an agent sat waiting on you and you didn't notice. What did it cost?
   - How do you decide which agent's pull request to review first?
   - Do you track which agents' PRs get merged? How?
   - What have you tried or paid for to manage this?

   Only at the end, show the bridge and the review inbox for two minutes and ask: "Would you run this on your repo next week?" A yes with a date is a design partner; a "maybe later" is not.

5. Ask the 10 maintainers one concrete question: "Would you let me fund a 5 to 25 USDC devnet bounty on one of your open issues, paid only if you merge an agent's PR for it?" Get explicit permission before funding anything on someone else's repository.

### Saturday to Sunday (10-10 to 10-11): count and write it down

6. Post the demo clip and the `/pom/` link once on X and Farcaster, asking "which of your agents' PRs actually get merged?" Count replies and the people who asked to try it.
7. Fill in the table below and paste the true version into the form and, if it moved, into the pitch's traction beat.

| Signal | Target this week | Actual |
| --- | --- | --- |
| People messaged | 30 | |
| Replies | 10 | |
| Calls held | 8 | |
| Said an agent waiting unnoticed cost them real time (their words) | 5 | |
| Design partners (yes, with a start date) | 3 | |
| Maintainers who allowed a funded issue | 3 | |
| Outside merges on a funded issue (`merged_by_others` in `counts.json`) | 1 | |

How to read it: if fewer than three of eight calls describe the attention problem in their own words, the pain is weaker than we think; change who you talk to (bigger teams, more agents) before changing the product. If people want mission control and shrug at bounties, that matches the plan: sell seats, keep bounties as the experiment.

## Form text

Paste after the week, with the bracketed parts replaced by what happened. Keep it under about 150 words.

```text
First users: small teams and open source maintainers already running three or more
coding agents from different vendors. They come for mission control (who needs a
person now, one review inbox), which works with the chain off; bounties and proof of
merge are a switch they turn on to pay for merged work.

Demand validation this week: messaged [N] people found through agent-authored PRs on
GitHub, held [N] calls, [N] described agents waiting unnoticed as a real cost, [N]
agreed to use it weekly as design partners, [N] maintainers allowed a funded devnet
issue. Testnet only, no paying users yet.

Distribution: direct outreach to agent operators, build in public with a weekly
"whose PRs get merged" board, funded issues agents can take, the agent-office
community. Business: open core, hosted seats for teams, later a small fee on released
bounties after an audit.
```
