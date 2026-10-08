# Launch posts

Status: needs the gates in [README.md](README.md#before-anything-goes-out). Every claim below is true of the code on this branch; numbers stay out until there are real ones. Fill `{{REPO_URL}}`, `{{DEMO_URL}}` and `{{SITE_URL}}` on the day.

## Show HN

Title (80 characters at most):

```text
Show HN: Kipdeck - one inbox for Claude Code, Codex and Cursor agents
```

URL: `{{REPO_URL}}`

First comment:

```text
Hi HN. I run several coding agents at once (Claude Code, Codex, Cursor) across a
few repos, mostly on a Linux box. The bottleneck stopped being the agents and
became me: one would sit blocked on a question for twenty minutes in a terminal
I wasn't looking at, while finished branches piled up unreviewed.

Kipdeck is a local web app that puts every agent in one list, sorted by what
it needs from you: Needs you, To review, Working, Idle. Each row has one button
(Answer, Review changes, Fix checks, Merge). Answer opens the agent's live
terminal with the cursor in the reply box; Review shows the diff and checks;
Merge merges the PR, or merges the branch locally if you don't use GitHub.
Every merge writes a signed record (agent, model, prompt, reviewer) on your
machine, and a Numbers view shows human wait time and merge rate per agent and
model.

  npx kipdeck              # in a repo; opens signed in, nothing to configure
  npx kipdeck --demo       # five scripted agents, no CLI or model needed

Each agent runs in its own git worktree. It runs on your machine or a dev box
(SSH tunnel or Tailscale for teammates, accounts with invite links), and works
on a phone. No telemetry unless you turn it on.

It's a fork of agent-office by webdevcody (MIT), which started as a 3D office
for agents; I kept the server and rebuilt the front around the inbox. The 3D
view is still there as an opt-in lab for a team's wall screen.

Hosted read-only demo: {{DEMO_URL}}

What I'd like to hear: how you deal with agents waiting on you today, and
whether status detection gets it wrong for your CLI.
```

## r/ClaudeAI

Title:

```text
I built an inbox for running several Claude Code sessions at once (open source, local)
```

Body:

```text
If you run more than two or three Claude Code sessions, you know the problem:
one is waiting on a permission prompt in a tab you forgot, another finished ten
minutes ago and nobody looked.

Kipdeck (`npx kipdeck` in your repo) shows every session in one browser
page, sorted by what it needs from you. Needs you is on top, with the question
in plain words; Answer opens its terminal with the reply box focused. Finished
work lands in To review with the diff, and Merge merges it. Each session gets
its own git worktree, so they don't step on each other.

Already have a session running? Quit it and run `npx kipdeck attach` in the
same folder: the same conversation carries on in the inbox.

It also runs Codex and Cursor side by side, if you mix them.

Open source (MIT, a fork of webdevcody's agent-office), runs locally, no
telemetry by default. Demo with scripted agents, no tokens spent:
`npx kipdeck --demo` or {{DEMO_URL}}.

Source: {{REPO_URL}}
```

## X

Post 1 (with the 30-second GIF):

```text
Coding agents now wait on us more than we wait on them.

Kipdeck is one inbox for Claude Code, Codex and Cursor: what needs an answer,
what's ready to review, what shipped. One button per agent.

npx kipdeck

Open source, runs on your machine. {{SITE_URL}}
```

Post 2 (reply):

```text
Try it with no agents and no tokens: npx kipdeck --demo plays five scripted
agents on a throwaway repo. Or the hosted demo: {{DEMO_URL}}
```

## LinkedIn

```text
Engineering teams I talk to now run five to ten coding agents in parallel. The
agents are rarely the bottleneck. People are: an agent sits blocked on a
question nobody saw, and finished work waits hours for a review.

I've built Kipdeck, an open-source inbox for AI coding agents. Every agent,
whichever CLI it runs (Claude Code, Codex, Cursor), is in one list sorted by what
it needs from a person, with one button each: answer, review, merge. It runs on
your own machine or your team's dev box, and every merge leaves a signed record
of which agent and model wrote it and who reviewed it.

I'm looking for 3 to 5 European teams to use it weekly as design partners, and
tell me where it falls short. If your team runs agents across more than one
repository, I'd like to talk.

{{SITE_URL}}
```
