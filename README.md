# UGC Army

**Mission control for teams running many AI coding agents. Proof of every merge.**

UGC Army puts every coding agent your team runs on one shared deck and ranks them by who needs a person right now: the units waiting on an answer first, then the stuck ones, then finished work waiting for review. You answer, unblock and review from one place instead of hunting through terminals. When a person merges a unit's pull request, the merge is proven on testnets: a devnet USDC bounty is released from escrow, an EAS attestation lands on Base Sepolia, and the agent's ERC-8004 reputation grows, all visible on a public ledger at `/pom/`.

![The deck from the Overview: the mission table in the middle, four pods of consoles, the curved situation wall to the north, units that need you on the ready line](docs/img/deck-overview.png)

[**Run it**](#run-locally) · [**What it does**](#what-it-does) · [**Proof of Merge**](#proof-of-merge-on-testnets) · [**Deploy**](#deploy-to-aws-ec2) · [**Controls**](#controls) · [**Design system**](DESIGN.md) · [**Docs**](docs/features.md)

| | |
| --- | --- |
| ![Mission control: every unit ranked by who needs a person, one title, one status, one time and one next step](docs/img/mission.png) | ![The 2D view: the deck plan beside the ranked list of units](docs/img/lite.png) |
| Mission control (I): every unit on every deck, ranked, with the one thing to do next. | The 2D view at `/lite`, the phone's deck, for machines without WebGL too. |
| ![The merge beat: a new lit segment on the Proof corner's rail and a violet toast with the devnet transaction](docs/img/beat-landed.png) | ![Demo mode: bigger type and callouts, the Overview turning round the table](docs/img/demo.png) |
| A merge, paid on devnet: the pulse climbs the Proof corner's rail and the toast shows the transaction. | Demo mode (`?demo=1`) for a screen share or a recording. |

## What it does

- **One ranking of who needs you.** `src/shared/attention.ts` ranks every unit on every deck: needs you (a question or a permission), stuck (crashed, silent, failing, never given a task), to review (done, a PR to merge or hand back), working, parked. The top bar's counters, the Units rail, Mission control, the 2D view, the tab title, the favicon and the wall's Attention board all read it, so they never disagree. A crashed unit stays stuck until a person resumes it.
- **Mission control.** Press **I**. Attention, Goals, Review, Timeline and Crew tabs: what needs someone with one next step per row, the deck's mission and milestones (given to new units as context), a review inbox of finished work, pull requests and payouts to approve, and what happened while you were away. Reminders catch what would otherwise be forgotten. See [docs/mission-control.md](docs/mission-control.md).
- **A deck per project.** Each GitHub repository is a deck: the mission table in the middle, four pods of consoles facing it, the situation wall curving round its north side with Issues, Queue, Attention, Pull requests and Services, the Proof corner on the west wall and the Review bay in the north-west corner ([the deck](docs/deck.md)).
- **Units at consoles.** Deploy Claude Code, Codex, OpenCode, Grok, Muse, DeepSeek Harness, Pi or Cursor at a free console, with its model and effort. Each runs in its own git worktree; its live terminal is one click away, for anyone on the deck. A unit that needs you steps onto its pod's ready line under orange light; **N** takes you to the next one.
- **Agents that manage agents.** Every unit can list, deploy, message and stand down the others through the `ugc-army` MCP server or the `office-workers` command, and board agents at the situation wall triage issues and pull requests for whoever walks up.
- **The 2D view.** `/lite` is the deck as a plan beside the ranked list, with terminals, the keys a phone lacks and the boards. Phones go there by default.
- **A bridge that looks alive.** Each console's screen shows its unit's state toward the table, and a working one runs with its terminal's output while the unit's hands work the console; busy stations send pulses to the holo table, which says how far the ship has come toward the active milestone, and a ticker over the wall carries the clock and the deck's log. It all goes quiet round a unit that needs you, and stills with Settings > Bridge > Ship motion at Off ([the deck](docs/deck.md#the-bridge)). Out of the ports, gas and dust stream past at four depths, a ringed giant hangs off the port side and the sun flares through the canopy, all of it dimming while a unit needs you. On a page's first load the view arrives from outside the bow and comes down through the canopy to the conn in 5 s (any key lands you there). Merges and jumps are framed, the boards and the holo have a screen's scanlines, and one grade sets the look by Night and by Day ([the cinema](docs/design.md#the-cinema)). Settings > Bridge > Quality (Auto by default) draws less of the light, detail, space close by and the cinema on slower graphics: High smooths edges with SMAA, Medium with FXAA, and Low leaves out the grade, the screens' character and the arrival. Auto steps down only for frames that keep falling behind and back up when there's room, holds at Medium or better on Apple silicon and discrete GPUs, and says what it runs at in Settings and on the menu's Quality row, with *Try High* to undo a step down ([light and materials](docs/deck.md#light-and-materials)).
- **The world outside moves with the work.** The mission is a world low in the forward glass, a quarter of the view from the first waypoint, that grows with every waypoint passed and issue closed, until the ship drops into orbit; every other deck flies as an escort off the side ports (its size its units, its lit ports its units at work, a needs-you beacon when it needs you, click it for the Decks lift); and each working unit has a fighter on patrol, its open pull request a fighter on the picket ahead. None of it moves on its own timer, and it all gives way to a unit that needs you. Settings > Bridge > Life: Full, Calm (no salutes, hails or patrols) or Silent running (no ambient life, stars at a crawl), and a switch for each part ([the deck](docs/deck.md#the-bridge), [docs/design.md](docs/design.md#the-world-outside)).
- **A crew with a record, a ship with a mind.** VESPER, the ship's mind, says a dry line now and then about what the crew really did ("3 merges this hour. The engines have noticed."), on the ticker and as a caption; when a unit needs you it says one plain sentence and goes quiet until that clears. Units earn epithets and chevrons from their real record (*the Mechanic*, *the Night Owl*; a violet chevron for a record on chain), shown up close and in Mission control's Crew tab, and the unit of the watch stands on the Proof corner's plinth. The crew carry themselves by their real state: they lean in at work, stand and stretch when they finish, slump when stuck and turn to the conn with a hand up when they need you. Bolt, a lopsided tool-drone with one arm, carries a finished unit's work to the Review bay with a trail behind it and waits by a unit that needs you. Settings > Bridge > Life has Ship's voice (On, Plain only, Off), Crew epithets and Bridge droid ([docs/design.md](docs/design.md#the-crew)).
- **Moments the crew earned, and a bridge that says how it's doing.** Celebrations come in tiers and only for real outcomes: a unit's first merge turns its pod to it with a nod, a unit back from stuck gets a sweep of light and a line on the band, three merges in an hour with nothing stuck put hands up across the ship, a waypoint jumps the ship in three beats (the lights let down through 3, 2, 1, the punch into a bright tunnel with the view kicked wide, the next world swinging into the glass) with the log card's real numbers, and the mission complete brings the fleet past the bow with a card naming every unit that merged. None of it plays while a unit needs you; it waits, and after ten minutes it is only the card. Alert conditions dim the room (never tint it) while units wait: amber past five minutes, red when one has been stuck past ten, and the lights come back up aft to bow when the last one clears; the band names who is behind a condition, and says STANDING DOWN the moment nobody is. Settings > Bridge > Moments: Celebrations (Full, Cards only, Off) and Alert conditions (on or off, the minutes) ([docs/design.md](docs/design.md#moments)).
- **Rituals: a start of watch, momentum you can see, a pit wall.** The first visit of the day the bridge's lights come up aft to bow, pod by pod, and the day's captain's log is typed onto the forward glass a sentence a line ("Day 14 of the mission. Yesterday the fleet merged 9 pull requests..."); back after twenty minutes away, a debrief in VESPER's voice lists who waits on you first, then what landed. A drive core rising over the Deck lift sends a pulse up its column and lights a ring for each merge in the current run, its collar counting the run and today's best, and the ticker carries the fleet's week against its record. The pit wall over the Review bay times your reply and review turnaround against the last seven days, and the top bar says what the crew got through today once there is something ("2 units back on task"). Outcomes only, team-level only, and all of it gives way to a unit that needs you. Settings > Bridge > Rituals: Start of watch (Full, Debrief only, Off), Momentum display and Turnaround clock ([docs/design.md](docs/design.md#rituals)).
- **Calm by design.** Hue only for exceptions, a glyph for every state, ambient life that gives way to attention, four optional sound cues ([DESIGN.md](DESIGN.md), [docs/design.md](docs/design.md)).
- **Night and Day lights.** Settings > Bridge > Bridge lights: Night for a dark room, Day for a bright one, or Auto to follow your system, with a Brightness step either way. The HUD, the 2D view and the sign-in page follow it ([the deck](docs/deck.md#light-and-materials)).

## Proof of Merge on testnets

![Testnet only](https://img.shields.io/badge/chain-testnet%20only-orange?style=flat-square) Solana devnet and Base Sepolia. No mainnet, no token, no NFT, no points.

Agents get paid, and earn reputation, only when a person merges their work.

- **Mission control** for teams running many agents: what needs a person now, a review inbox, goals and milestones, a timeline ([docs](docs/mission-control.md)).
- **Bounties** in devnet USDC on GitHub issues, from the board or a "Fund this issue" Blink. A release needs two signatures: the attester's (a person with write access merged the office's own, non-fork PR) and the approver's (an office admin approved it in the review inbox) ([docs](docs/bounties.md)). A repository can also run the attester as a [GitHub Action](onchain/action/README.md), with no office.
- **Proof of merge**: an EAS attestation on Base Sepolia for every office PR a person merges, reverts or closes, and ERC-8004 feedback for the agent ([docs](docs/proof-of-merge.md), [reputation](docs/reputation.md)).
- **Paid tasks over x402**: an outsider hires a worker for one task with test USDC; it waits, held, for an admin. Tested end to end on a local anvil chain, and one 0.10 test USDC payment settled on Base Sepolia through x402.org ([transaction](https://sepolia.basescan.org/tx/0x490896509be59e45e7d14afbaa3ec24c18db5292f4ea1c71cf79533670d126dc), [docs](docs/x402.md)).
- **A public board** at `/pom/`, built from chain data when the office runs the indexer and otherwise from the office's own attestation record, with an explorer link on every row; the GitHub Pages export is rebuilt from chain data alone ([docs](docs/showcase.md)).

What is on chain so far: the escrow program on Solana devnet (`JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6`) with five scripted demo bounties paid there (the last one claimed by the GitHub Action), the Base Sepolia schema and fallback contract, one x402 payment on Base Sepolia, and no standing attestations (the test ones were revoked) or outside users yet. Nothing here has had a real merge behind a payout yet; see the launch kit's checklist.

### Quickstart in 60 seconds

Every chain feature is off by default; without them this is the office plus mission control.

```bash
git clone <this fork's URL> agent-office-pom && cd agent-office-pom
npm install                 # also builds the client and server
node bin/agent-office.js    # opens the office; chain features off
```

To try the chain side on testnets, build the on-chain packages the office loads (`cd onchain/solana && npm install && npm run build`, the same in `onchain/attest`), then turn bounties on in Settings, Bounties (set an approver wallet there), and start the office with `--attest --attest-repos owner/name`, `--reputation` or `--x402`. Only public repositories are ever attested. The deployed testnet addresses are in `onchain/*/deployments/`.

### How it fits together

```text
 GitHub issue --Fund (board or Blink)--> Solana devnet escrow program
      |                                         ^
 unit (Claude Code, Codex, Cursor, Pi)          |  Release: attester + approver sign
      |                                         |
 office PR (never a fork) --person merges--> office checks GitHub --admin approves in review inbox
                                                 |
                                                 +--> EAS attestation + ERC-8004 feedback (Base Sepolia)
                                                 |
 onchain/indexer (chain data only) --> leaderboard.json --> /pom/ public ledger
```

Security: keys live in files under `~/.config/agent-office-chain` (mode 0600, never logged); use dedicated testnet keys with nothing of value on them. Payouts and refunds are admin-only and can be co-signed in the admin's browser wallet. RPC calls go through the network guard. Nothing here is audited, and mainnet waits on an audit. See [docs/security.md](docs/security.md). Hackathon and grant drafts are in [launch/chain](launch/chain/README.md).

> [!WARNING]
> **Work in progress.** UGC Army changes fast: keys that move, screens that get redrawn, features that come and go.

## Upstream credit

UGC Army is a fork of [agent-office](https://github.com/AgentSystemLabs/agent-office), created by webdevcody, Copyright (c) 2026 AgentSystemLabs, released under the MIT License. The server's architecture (decks as floors, workers and their terminals, worktrees, provider adapters, the queue, meetings, voice, accounts, the tunnel and the deploy scripts) is upstream's; [NOTICE](NOTICE) lists what this fork replaced and what remains, and [launch/chain/disclosure.md](launch/chain/disclosure.md) lists our changes commit by commit. This fork is not run by the upstream authors. The package and the `agent-office` command keep their upstream names so upstream changes can still be merged; `ugc-army` is the same command.

## Requirements

On the machine that runs the office:

- **Node.js 20+**
- At least one agent CLI, signed in as the user that runs the office: **Claude Code** (`claude`), **Codex** (`codex`), **OpenCode** (`opencode`), **Grok** (`grok`), **Muse** (`muse`), **DeepSeek Harness** (`dsh`), **Pi** (`pi`, 0.87.1+) or the **Cursor** CLI (`cursor-agent`). With [accounts](#add-users), everyone can sign in to their own Claude from the office instead.
- **git**, and the **GitHub CLI** (`gh auth login`) for cloning repos and the issue and PR boards

## Run locally

From a clone of this repository:

```bash
git clone <this repository's URL> ugc-army && cd ugc-army
npm install          # also builds the client and server
npm install -g .     # puts `ugc-army` (and `agent-office`) on your PATH
ugc-army
```

The deploy scripts below and `install.sh` / `install.ps1` still install upstream agent-office from its releases; until this fork publishes its own, run it from a clone as above.

The first time it starts, it walks you through setting up, right in the terminal:

1. **Where to clone your projects.** It suggests a code folder you already have (`~/Workspace`, `~/code`...), else `~/agent-office`. Each project goes in `<folder>/<owner>/<repo>`.
2. **GitHub.** If the GitHub CLI isn't signed in, it offers to run `gh auth login` for you.
3. **Your first project.** Pick one of your repos by number, or type `owner/name`, and the office clones it as the first floor.

Press Enter to skip a step: the elevator in the office asks for your first project too. Then the office opens in your browser, **already signed in**, with a link that works once. The terminal also prints the office password, for signing in from another browser (it's saved in `~/agent-office/.agent-office/config.json`).

Walk to a free console, press **E** and deploy a unit.

Common options:

```bash
agent-office ~/code/my-project              # use a project you already have as the first floor
agent-office --password 'correct horse'     # choose the password
agent-office --port 4700
agent-office --agent pi                     # default agent: claude, codex, opencode, grok, muse, dsh, pi or cursor-agent
agent-office --no-open                      # print the sign-in link instead of opening a browser
agent-office setup                          # the first-start walkthrough again (office stopped)
```

Every option is in [docs/configuration.md](docs/configuration.md). Choosing models and providers per worker is in [docs/agents.md](docs/agents.md).

> Only your computer can reach the office: it listens on `127.0.0.1`. `--host 0.0.0.0` lets your network in, but over plain http, where voice and screen sharing don't work. To share the office with a team, put it on a server: [AWS](#deploy-to-aws-ec2), [Azure](#deploy-to-azure), [Railway](#deploy-to-railway), [Fly.io](#deploy-to-flyio), [Dokploy](#deploy-to-dokploy) or [any Ubuntu or Debian machine](#deploy-to-any-ubuntu-or-debian-server).

## Deploy to AWS (EC2)

One script, using only the AWS CLI. You need the **AWS CLI signed in** (`aws configure` or `aws sso login`), `ssh`, `curl` and a clone of this repo:

```bash
git clone https://github.com/AgentSystemLabs/agent-office && cd agent-office
deploy/aws.sh up --project your-org/your-repo --claude-token "$(claude setup-token)"
```

In about two minutes, `up`:

1. Launches a **t3.xlarge** (4 vCPU, 16 GiB) Ubuntu 24.04 instance with a 50 GiB disk and a fixed Elastic IP.
2. Creates a security group that opens **only SSH, only to your IP**. The office listens on `127.0.0.1:4600` on the machine and is never on the internet. Everyone reaches it through an SSH tunnel, so there are no certificates to manage, and voice and screen sharing work.
3. Runs [`deploy/provision.sh`](deploy/provision.sh) on it: Node 22, git, the GitHub CLI, Claude Code and the office, under systemd, so it comes back after a crash or reboot and workers keep running through a restart.
4. Opens a tunnel and your browser at http://localhost:4600. **The first page shows the office password once. Write it down.**

`--project` is optional: it clones that repo as the first floor. Leave it out and pick projects in the elevator.

**Signing in the agents.** `--claude-token` uses your Claude subscription; `--anthropic-api-key <key>` uses an API key instead. Leave both out and run `/login` in the first worker's terminal. Codex and OpenCode aren't installed by the script: `deploy/aws.sh ssh` and install them yourself.

**GitHub.** Your local `gh auth token` is copied to the machine so the office can clone private repos, show the boards and push PRs. Anyone in the office can use it, so pass `--github-token <fine-grained token>` or `--no-github-token` to limit that.

**On Tailscale, no tunnels.** If your team uses [Tailscale](https://tailscale.com), add `--tailscale`:

```bash
deploy/aws.sh up --tailscale --project your-org/your-repo --claude-token "$(claude setup-token)"
```

The machine joins your tailnet, and Tailscale Serve puts the office on `https://agent-office.<your-tailnet>.ts.net` with a real certificate. Anyone on your tailnet just opens that link: no terminal to keep open, no SSH keys, no IPs to allow, and voice and screen sharing work. `up` opens Tailscale's page to add the machine (or pass `--tailscale-auth-key tskey-auth-...`) and, the first time, the page that turns on HTTPS for your tailnet. SSH stays open to your IP only, for `deploy/aws.sh` itself. More in [docs/aws.md](docs/aws.md#tailscale).

Day to day:

```bash
deploy/aws.sh open                # tunnel + open the office (Ctrl-C closes the tunnel)
deploy/aws.sh status              # machine, address, is the office up, who's invited
deploy/aws.sh logs                # follow the office's logs
deploy/aws.sh ssh                 # a shell on the machine
deploy/aws.sh update              # install the latest agent-office and restart
deploy/aws.sh resize t3.2xlarge   # bigger or smaller machine, same address
deploy/aws.sh pause               # stop the machine; only the disk and IP are billed
deploy/aws.sh resume              # start it again and open it
deploy/aws.sh destroy             # delete everything it created (asks first)
```

You can also upgrade from inside the office: **Menu > Deck > Update UGC Army**. Other flags (`--region`, `--instance-type`, `--disk`, `--name` for several offices) are in `deploy/aws.sh help`, and the details are in [docs/aws.md](docs/aws.md).

**The workers' dev servers, on your computer.** The office runs on the server, so a worker's `npm run dev` listens there. Run this on your own computer and leave it running, and every web server a worker starts opens on the same port on yours, by itself (`http://localhost:5173` is the worker's), and closes when the worker stops it:

```bash
agent-office tunnel                       # while `deploy/aws.sh open` (or a teammate's ssh command) is running
agent-office tunnel office@203.0.113.7    # or by itself: it opens the tunnel to the office too
```

It works with every way of running the office on a server, and needs the `agent-office` command on your computer: [docs/tunnel.md](docs/tunnel.md).

## Deploy to Azure

The same thing on an Azure VM, using only the Azure CLI. You need the **Azure CLI signed in** (`az login`), `ssh`, `curl` and a clone of this repo:

```bash
git clone https://github.com/AgentSystemLabs/agent-office && cd agent-office
deploy/azure.sh up --project your-org/your-repo --claude-token "$(claude setup-token)"
```

`up` puts everything in a resource group of its own, `agent-office`, and launches a **Standard_D4as_v5** VM (4 vCPU and 16 GiB, like the t3.xlarge on AWS, at about the same price) with Ubuntu 24.04, a 64 GiB Premium SSD and a static IP. Its firewall opens **only SSH, only to your IP**. Then it runs the same [`deploy/provision.sh`](deploy/provision.sh) and opens the office through an SSH tunnel at http://localhost:4600. **The first page shows the office password once. Write it down.**

Every command from the AWS script works the same, with `deploy/azure.sh` in its place: `open`, `status`, `logs`, `ssh`, `update`, `invite`, `allow`, `service`, `resize Standard_D8as_v5`, `pause` (deallocates the VM, so only the disk and IP are billed), `resume` and `destroy` (deletes the resource group). One more, `connect`, lets a second computer manage the office. `--location` picks the region (default: your `az` default location, else `eastus`), `--subscription` the subscription and `--size` the VM size. The details are in [docs/azure.md](docs/azure.md).

## Deploy to Railway

No machine to look after: one script, using the Railway CLI. You need the **Railway CLI 5 or newer, logged in** (`railway login`), `ssh`, `curl`, Node.js and a clone of this repo:

```bash
git clone https://github.com/AgentSystemLabs/agent-office && cd agent-office
deploy/railway.sh up --claude-token "$(claude setup-token)"
```

In about five minutes, `up`:

1. Creates a Railway project with one service, built from this checkout with [`deploy/container/Dockerfile`](deploy/container/Dockerfile): Node 22, git, the GitHub CLI and sshd, with Claude Code installed on first start.
2. Adds a **volume on `/data`** for everything the office keeps: the password, accounts, floors and settings, the projects, Claude's and GitHub's sign-ins, teammates' keys and the SSH host key. Restarts and redeploys replace the container, never the volume.
3. Puts Railway's **TCP proxy** in front of the container's SSH, and nothing else. The office listens on `127.0.0.1:4600` inside the container and has no public URL: everyone reaches it through an SSH tunnel, as on AWS.
4. Opens a tunnel and your browser at http://localhost:4600. **The first page shows the office password once. Write it down.**

The agents and GitHub sign in as on AWS: `--claude-token`, `--anthropic-api-key`, `--github-token` or `--no-github-token`.

```bash
deploy/railway.sh open              # tunnel + open the office (Ctrl-C closes the tunnel)
deploy/railway.sh status            # deployment, SSH address, volume, is the office up, who's invited
deploy/railway.sh invite octocat    # let a teammate tunnel in with their GitHub SSH keys
deploy/railway.sh logs              # follow the office's logs (ssh: a shell in the container)
deploy/railway.sh update            # build this checkout again and redeploy it
deploy/railway.sh destroy           # delete the project and its volume (asks first)
```

The details, and what's on the volume, are in [docs/railway.md](docs/railway.md).

## Deploy to Fly.io

The same container on a [Fly.io](https://fly.io) machine, using flyctl. You need **flyctl logged in** (`fly auth login`), `ssh`, `curl`, Node.js and a clone of this repo:

```bash
git clone https://github.com/AgentSystemLabs/agent-office && cd agent-office
deploy/fly.sh up --claude-token "$(claude setup-token)"
```

In a few minutes, `up`:

1. Creates a Fly app with one machine, a `shared-cpu-4x` with 8 GB in the region nearest you, built from this checkout with the same [`deploy/container/Dockerfile`](deploy/container/Dockerfile) as on Railway.
2. Adds a **volume on `/data`** for everything the office keeps, so restarts, redeploys and resizes lose none of it.
3. Gives the app a **dedicated IPv4 address** with SSH on a random port, and nothing else. The office listens on `127.0.0.1:4600` inside the machine and has no public URL: everyone reaches it through an SSH tunnel, as on AWS.
4. Opens a tunnel and your browser at http://localhost:4600. **The first page shows the office password once. Write it down.**

The agents and GitHub sign in as on AWS: `--claude-token`, `--anthropic-api-key`, `--github-token` or `--no-github-token`.

```bash
deploy/fly.sh open                    # tunnel + open the office (Ctrl-C closes the tunnel)
deploy/fly.sh status                  # machine, SSH address, volume, is the office up, who's invited
deploy/fly.sh invite octocat          # let a teammate tunnel in with their GitHub SSH keys
deploy/fly.sh logs                    # follow the office's logs (ssh: a shell in the machine)
deploy/fly.sh update                  # build this checkout again and redeploy it
deploy/fly.sh resize performance-2x   # another machine size, same address and volume
deploy/fly.sh pause                   # stop the machine (resume starts it again)
deploy/fly.sh destroy                 # delete the app and its volume (asks first)
```

`--region`, `--org`, `--vm-size`, `--memory`, `--disk` and `--name` (for several offices) are in `deploy/fly.sh help`. The details, and what's on the volume, are in [docs/fly.md](docs/fly.md).

## Deploy to Dokploy

Already run a [Dokploy](https://dokploy.com) server? One script puts the office on it, through Dokploy's API. You need an **API key** (Dokploy: **Settings → Profile → API/CLI Keys**, with rate limiting off), `ssh`, `curl`, `git`, Node.js and a clone of this repo:

```bash
git clone https://github.com/AgentSystemLabs/agent-office && cd agent-office
export DOKPLOY_API_KEY=<your key>
deploy/dokploy.sh up --url https://dokploy.example.com --claude-token "$(claude setup-token)"
```

In about five minutes, `up`:

1. Creates a Dokploy project with one application, and uploads this checkout for Dokploy to build with [`deploy/container/Dockerfile`](deploy/container/Dockerfile), the same image as on Railway.
2. Mounts a **Docker volume on `/data`** for everything the office keeps. Deploys and restarts replace the container, never the volume.
3. Publishes the container's SSH on **port 2222 of the server** (`--ssh-port` picks another), and nothing else: no domain, and the office listens on `127.0.0.1:4600` inside the container. Everyone reaches it through an SSH tunnel, as on AWS. A firewall in front of the server has to let that port through.
4. Opens a tunnel and your browser at http://localhost:4600. **The first page shows the office password once. Write it down.**

The agents and GitHub sign in as on AWS: `--claude-token`, `--anthropic-api-key`, `--github-token` or `--no-github-token`. `--server <name>` runs it on one of Dokploy's remote servers.

```bash
deploy/dokploy.sh open              # tunnel + open the office (Ctrl-C closes the tunnel)
deploy/dokploy.sh status            # its page in Dokploy, last deployment, SSH address, who's invited
deploy/dokploy.sh invite octocat    # let a teammate tunnel in with their GitHub SSH keys
deploy/dokploy.sh logs              # follow the office's logs (ssh: a shell in the container)
deploy/dokploy.sh update            # upload this checkout again, build it and redeploy it
deploy/dokploy.sh destroy           # delete the application and its volume (asks first)
```

The details, and what's on the volume, are in [docs/dokploy.md](docs/dokploy.md).

## Deploy to any Ubuntu or Debian server

Another cloud, or your own machine? Run one line on the server, as root or as a user with sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/AgentSystemLabs/agent-office/main/deploy/provision.sh | bash
```

It installs Node 22, git, the GitHub CLI, Claude Code and the office as a systemd service. Run as root, it creates an `agentoffice` user to run the office, so workers never run as root. The office listens on `127.0.0.1:4600` only, and the script ends by printing the SSH tunnel command and a link that shows the office password once. Run the same line again to update.

For HTTPS on your own domain, point a DNS record at the server and add `bash -s -- --domain office.example.com`: it sets up Caddy, which gets the certificate by itself. To put it on your Tailscale network instead, add `bash -s -- --tailscale`. The details, and setting it up by hand behind Caddy or nginx, are in [docs/self-hosting.md](docs/self-hosting.md).

## Add users

Everyone gets their own account, so their name is on their operator, in chat and on every terminal they type into.

**1. On a server, let them in first.** On a [Tailscale](docs/aws.md#tailscale) office, everyone on your tailnet can already open it. For someone who isn't, share the machine with them from Tailscale's Machines page: **Menu > Deck > Invite teammates** says how. Skip to step 2.

Otherwise the office is only reachable through an SSH tunnel, so a teammate needs their SSH key on the machine. In the office, open **Menu > Deck > Invite teammates** and type their GitHub username. On AWS, Railway, Fly.io or Dokploy you can also do it from your terminal:

```bash
deploy/aws.sh invite octocat        # installs the keys from github.com/octocat.keys
deploy/aws.sh allow 203.0.113.7     # their IP ("allow anywhere" opens SSH to every IP)
deploy/railway.sh invite octocat    # on Railway, SSH answers every IP already
deploy/fly.sh invite octocat        # and on Fly.io
deploy/dokploy.sh invite octocat    # and on Dokploy
```

It prints the command to send them. They leave it running and open http://localhost:4600:

```
ssh -L 4600:localhost:4600 office@<your-office-ip>
```

(On Railway and Fly.io the address carries a port of its own, like `ssh://office@zephyr.proxy.rlwy.net:17738`. On Dokploy it's the server's SSH port for the office: `ssh://office@203.0.113.7:2222`.)

Their key logs in as a locked-down `office` user that can only forward to the office port: no shell, no other ports. Running the office on your own computer, or on your own domain over HTTPS? Skip this step.

A teammate with the `agent-office` command on their computer can run `agent-office tunnel office@<your-office-ip>` instead of the `ssh` line: it opens the same tunnel, and every web server a worker starts opens on their computer too ([docs/tunnel.md](docs/tunnel.md)).

**2. Make them an account.** Open **Menu > Deck > Accounts** and make an invite link. Name it (or let them pick) and make them a *Member* or an *Admin*. The link works once, for 7 days, and they choose their own password. Make one for yourself too, as an admin.

The same works from a terminal on the office's machine, even while it runs:

```bash
agent-office accounts                      # accounts and open invites
agent-office accounts invite ada --admin   # prints a single-use /join#... link
agent-office accounts role ada member
agent-office accounts revoke ada           # signed out within seconds
```

On the EC2 machine, run it through `deploy/aws.sh ssh` (on Azure, `deploy/azure.sh ssh`):

```bash
deploy/aws.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada --dir "$(cat /etc/agent-office/home)"'
deploy/railway.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'   # on Railway
deploy/fly.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'       # on Fly.io
deploy/dokploy.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'   # on Dokploy
```

**Their own Claude and GitHub.** With accounts, everyone's workers run on their own Claude plan, and the office acts on GitHub as them: comments, merges, labels, pushes and pull requests show up under their name. The first time someone comes in, **Your sign-ins** opens (it's under Menu > Deck too). *Sign in with Claude* gives them Claude's sign-in page and takes back the code it shows. *Sign in with GitHub* shows a one-time code for github.com/login/device. They can paste a token from `claude setup-token`, or a GitHub token, instead. A shell they open at a console runs as them, so `claude auth login` and `gh auth login` typed there work too. Admins can use the office machine's own sign-ins instead. Each account's sign-ins live in `.agent-office/homes/<account>/`, and revoking the account deletes them. The boards are read with the machine's own `gh`, so that account needs read access to the repos. Running it just for yourself, with no accounts, none of this applies.

**3. Turn off the shared password.** Until you do, anyone who knows the office password can get in, as an admin. Once everyone has an account, switch it off in **Accounts** (signed in with your own admin account), or `agent-office accounts password off`.

**Removing someone.** Revoke their account in **Accounts** (or `agent-office accounts revoke <name>`), and on a server also remove them in **Invite teammates** (on AWS, `deploy/aws.sh uninvite <name>`; on Railway, `deploy/railway.sh uninvite <name>`; on Fly.io, `deploy/fly.sh uninvite <name>`; on Dokploy, `deploy/dokploy.sh uninvite <name>`) to take away their SSH keys and drop open tunnels (other teammates just reconnect). If the shared password is still on, change it with `deploy/aws.sh reset-password` (or `deploy/railway.sh reset-password`, `deploy/fly.sh reset-password` or `deploy/dokploy.sh reset-password`).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk (hold Shift to run) |
| Space | Jump |
| Mouse drag / wheel | Orbit / zoom the camera |
| E | Interact: deploy a unit, open its terminal, read a board, sit down, open Decks at the Deck lift |
| P | Give a task to a new unit, or to the one at this console |
| C | See a unit's changes: diff, commit, open a PR |
| I | Mission control: reminders and what needs someone on every deck, the deck's goals, the review inbox and the timeline |
| N | Go to the next unit that's waiting on you (the view flies there), then the next deck's |
| X | Stand a unit down |
| L | Stencil a tag by a console ("Operations", "Code cleanup") |
| G | The Overview: the whole deck from above (Q / E turn it, G walks again) |
| T / Enter | Chat |
| V | Join voice; then hold V to talk |
| M | Mute / unmute in voice |
| Ctrl + Space | Dictate into a terminal or a prompt box: hold it and talk (or hold the mic button) |
| Tab | The menu: Command, Work, Proof, Deck and Comms |
| Esc | Close any window |
| Ctrl + [ | Send Esc to a terminal, to close a menu like Claude's `/skills` or interrupt Claude (or **Esc** in its header) |

The full list is in [docs/controls.md](docs/controls.md). Add `?demo=1` to the address for demo mode: bigger type and callouts, and the Overview turning slowly round the table.

## Development

```bash
npm install
npm run dev          # Vite with hot reload on :5173, the server on :4600 (password: dev)
npm run typecheck
npm test
```

Server edits restart the server, not the workers. After changing `ptyhost.ts`, bump `PTY_PROTOCOL` in `ptys.ts` so the next server replaces the PTY host.

[docs/code-layout.md](docs/code-layout.md) says where the code lives, and where a new feature's pieces go.

The rules for coding agents working on this repository are in [`AGENTS.md`](AGENTS.md), which Codex, OpenCode and most other agent CLIs read. `CLAUDE.md` only imports it for Claude Code, so new rules go in `AGENTS.md`.

Every change to the app that lands on `main` is published as a GitHub release by [`.github/workflows/release.yml`](.github/workflows/release.yml), and `install.sh` installs the newest one. Bump `package.json`'s version to start a new minor.

## More

- [Features](docs/features.md): seeing what every agent does, handing out work, reviewing it and staying on mission
- [Design system](docs/design.md): each surface on screen, the motion and sound that mark a change of state, demo mode, and how to check a design change with `design/shoot.mjs`
- [The deck](docs/deck.md): what's where on the 3D deck (the mission table, the pods, the ready line, the boards, the Proof corner), cell addresses, and the Overview camera
- [Mission control](docs/mission-control.md): the attention ranking, the floor's mission and milestones, linking work to goals, the review inbox, the timeline, reminders and the digest
- [Proof of Merge bounties](docs/bounties.md): devnet USDC escrowed against an issue, paid only when a person merges the office's pull request and an admin approves (testnet only, off by default); the [GitHub Action](onchain/action/README.md) attests merges to the same escrow from any repository's workflow, without the office
- [Proof of merge on Base Sepolia](docs/proof-of-merge.md): an EAS attestation for every office PR a person merges, reverts or closes in an opted-in public repository, and an indexer that rebuilds the leaderboard from chain data alone (testnet only, `--attest --attest-repos`)
- [Agent reputation from merges](docs/reputation.md): ERC-8004 identities for the office's agents, feedback only for what a person did with their pull requests, a public leaderboard and a read-only MCP tool (testnet only, `--reputation`)
- [The public showcase](docs/showcase.md): a shareable, read-only page at `/pom/` (and on GitHub Pages) showing which coding agents' PRs people actually merge, from chain data, with an explorer link on every row (testnet only, off until an admin turns it on)
- [The launch kit and its tools](docs/launch.md): submission drafts, posts and the calendar in `launch/chain`, and the checks that keep their numbers, links and limits honest
- [Paid tasks over x402](docs/x402.md): outsiders pay test USDC to queue one task, held until an admin approves it (testnet only, `--x402`)
- [Agents](docs/agents.md): every harness the office runs (Claude Code, Codex, OpenCode, Grok, Muse, DeepSeek Harness, Pi, Cursor), models and effort, and the office's prompts
- [Configuration](docs/configuration.md): every command-line option, and where the office keeps its data
- [Workers' servers on your own computer](docs/tunnel.md): `agent-office tunnel`, which opens every worker's web server on your computer by itself
- [AWS reference](docs/aws.md): Tailscale, service tunnels, upgrades, and everything `deploy/aws.sh` does
- [Railway reference](docs/railway.md): what `deploy/railway.sh` sets up, and what the volume keeps
- [Fly.io reference](docs/fly.md): what `deploy/fly.sh` sets up, machine sizes, pausing and what the volume keeps
- [Dokploy reference](docs/dokploy.md): what `deploy/dokploy.sh` sets up on your Dokploy, and what the volume keeps
- [Your own server](docs/self-hosting.md): the one-line setup for any Ubuntu or Debian server, or by hand behind Caddy or nginx
- [Azure reference](docs/azure.md): picking a VM size, pausing, and everything `deploy/azure.sh` does
- [How it works](docs/how-it-works.md): the architecture, and security notes
- [Security](docs/security.md): the threat model, and what keeps repositories, other sites and stolen cookies out
- [Code layout](docs/code-layout.md): where the code lives, adding a feature or an agent provider, and the size guard

## License

[MIT](LICENSE)
