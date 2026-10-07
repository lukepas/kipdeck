# Mergeline

The inbox for your AI coding agents: see which agent needs you, review what's ready, and merge what shipped.

```bash
npx mergeline
```

![Mergeline in 30 seconds: Codex asks a question and is answered from its row, Claude Code's diff is reviewed and merged into Shipped today (the demo's scripted agents, no model)](docs/img/demo.gif)

No agents yet? `npx mergeline --demo` plays five scripted ones on a throwaway repository, no CLI, sign-in or model needed ([the demo](docs/demo.md)).

Run it inside the repository you work in. It opens in your browser, signed in, with that repository as your first project. Claude Code, Codex and Cursor run side by side (OpenCode, Pi, Grok, Muse and DeepSeek Harness in beta), each on a branch of its own, and you answer, review and merge from one page, on your laptop or your phone. It runs on your machine or your team's dev box, and nothing leaves it.

[**Run it**](#run-it) · [**Try the demo**](docs/demo.md) · [**Attach an agent**](#attach-an-agent-you-already-started) · [**Teams and servers**](docs/self-hosting.md) · [**Labs**](#labs) · [**Docs**](docs/features.md)

- **One loop.** **Deploy agent**, get pinged when it needs you, act on its row (Answer, Review changes, Merge), and it lands in **Shipped today**. Each row has one button; the selected agent's live terminal, diff and log sit beside the list. See [the inbox](docs/inbox.md).
- **One ranking.** `src/shared/attention.ts` decides the order everywhere: the inbox's sections (Needs you, To review, Working, Idle), Mission control, the tab title and notifications.
- **A record of what shipped.** Every merge and send-back is kept on your machine as a signed record: which agent and model, the prompt, and who reviewed it. The inbox shows the merge rate per agent and model.
- **Calm by default.** Everything that isn't the inbox (the 3D Bridge view, goals and the timeline, meetings, voice, Proof of Merge on testnets) is off until someone switches it on in [Labs](#labs).

| | |
| --- | --- |
| ![The inbox on a phone: the list alone, an agent opens over it (demo data)](docs/img/inbox-phone.png) | ![The 3D Bridge view, a Labs view of the same agents (demo data)](docs/img/deck-overview.png) |
| The same inbox on a phone. | The Bridge view at `/bridge` (Labs): the same agents as a room, for a team's wall screen. |

## Run it

You need **Node.js 20+**, **git** and one agent CLI: **Claude Code** (`npm install -g @anthropic-ai/claude-code`), **Codex** (`npm install -g @openai/codex`) or **Cursor** (`cursor-agent`), signed in. The **GitHub CLI** (`gh`) is optional: with it, agents open pull requests and the inbox shows their checks; without it, review reads the local diff and Merge merges on your computer.

In the repository you work in:

```bash
npx mergeline
```

1. It starts on `http://localhost:4600` (or the next free port) and opens your browser, **already signed in**. On your own computer there is no password to type: the link it opens works once, and `npx mergeline open` makes a new one if you lose the tab. Only your computer can reach it.
2. The repository you started it in is your first project. Started somewhere else, the setup card offers to clone one from GitHub.
3. The **setup card** says which agents it found and whether each is signed in, the project, and GitHub, with the one line to run for anything that isn't ready.
4. **Deploy your first agent** starts one on a safe task (a 5-line SUMMARY.md on how to run the repository). It shows up under **Working** within seconds and under **To review** when it's done.

Nothing asks you anything in the terminal, and there are no settings to fill in. From a clean machine to the first agent at work takes under two minutes, most of it npm downloading; `design/time-to-first-agent.mjs` times it.

Common options:

```bash
npx mergeline --port 4700                 # this port or nothing
npx mergeline ~/code/my-project           # keep the office's data in that project, as agent-office did
npx mergeline --host 0.0.0.0              # let your network in (then everyone else signs in with a password)
npx mergeline --password 'correct horse'  # a password, even on this computer
npx mergeline --no-open                   # print the sign-in link instead of opening a browser
npx mergeline --telemetry                 # share anonymous usage numbers (off by default)
```

To have a `mergeline` command instead: `npm install -g mergeline`, or [`install.sh`](install.sh) (macOS and Linux) and [`install.ps1`](install.ps1) (Windows), which install the same package. Every option is in [docs/configuration.md](docs/configuration.md); choosing models and providers per agent is in [docs/agents.md](docs/agents.md).

## Attach an agent you already started

Started Claude Code or Codex in a terminal before Mergeline was running? Quit it there (Ctrl+C or `/exit`), then in the same folder:

```bash
npx mergeline attach
```

It finds that folder's newest Claude Code or Codex session in the CLI's own files, and the running Mergeline carries it on as one of its agents: the same conversation, now in the inbox with its terminal, its questions, its changes and the merge. `--list` shows the folder's sessions, `--session <id>` picks one, and Cursor needs `--agent cursor --session <id>` (`cursor-agent ls` lists them).

## Labs

Labs are the parts beyond the inbox. Each is off as the office ships, so a first visit sees the inbox and nothing else. An admin switches them for everyone from **Labs** in the home page's avatar menu (or Ctrl+K) or the Bridge view's menu; `--labs bridge,ops` (or `AGENT_OFFICE_LABS`) holds some on from the command line. Turning one off hides it; nothing is deleted.

| Lab | What switching it on brings back |
| --- | --- |
| Bridge view | A link to the 3D bridge at `/bridge` on the home page, and the deck plan in the pane while no agent is selected. `/bridge` itself always opens. |
| Goals and timeline | Goals and milestones, the Timeline and Crew tabs in Mission control, the Bridge view's mission strip and the Services board. |
| Meetings | The Review bay and the planning whiteboard. |
| Voice | Voice chat, screen sharing and the dictation mic in prompt boxes and terminals. |
| Bridge ambience | The bridge in full: mascot, ship's voice, hands, celebrations, start of watch, ship motion and the ambience bed. Off, the bridge starts calm. |
| Proof of Merge (testnets) | Bounties and payouts, attestations, ERC-8004 reputation, x402 paid tasks and `/pom/`. Their HTTP routes don't exist while it's off. Any chain flag (`--x402`, `--attest`, `--reputation`) holds it on. |

More in [docs/labs.md](docs/labs.md).

## What it does

The home page and the ranking are the product. Most of the rest of this list is the Bridge view and the other labs, each off by default.

- **One ranking of who needs you.** `src/shared/attention.ts` ranks every unit on every deck: needs you (a question or a permission), stuck (crashed, silent, failing, never given a task), to review (done, a PR to merge or hand back), working, parked. The top bar's counters, the Units rail, Mission control, the 2D view, the tab title, the favicon and the wall's Attention board all read it, so they never disagree. A crashed unit stays stuck until a person resumes it.
- **Mission control.** Press **I**. Attention, Goals, Review, Timeline and Crew tabs: what needs someone with one next step per row, the deck's mission and milestones (given to new units as context), a review inbox of finished work, pull requests and payouts to approve, and what happened while you were away. Reminders catch what would otherwise be forgotten. See [docs/mission-control.md](docs/mission-control.md).
- **A deck per project.** Each GitHub repository is a deck, built as a command amphitheatre: the mission table in a pit in the middle, four pods of consoles facing it on two tiers that step up south of it to the captain's raised dais, the situation arc hung over the north side (the Attention board in the middle, Issues over Queue and Pull requests over Services on its wings, capacity along its foot), the Proof corner and the planning board on the west wall, the Review bay in the north-west corner and the service monitor on the east wall, where the live page of a unit's dev server shows when you walk up to it (E on its row of the Services board puts it there; [the service monitor](docs/deck.md#the-service-monitor)) ([the deck](docs/deck.md)). Every panel on the deck is a table you can read from where you stand: the planning board's milestones, the Review bay's queue and seats (on its board and on the sign by its door), the Proof corner's escrow ledger and ERC-8004 records, the docs rack's index and the pit wall's clocks. Sitting in the captain's chair frames it all in one look: the bow, the arc, the pit and the crew. Behind the arc, under the Attention and Pull requests boards, a forward lounge hangs at the bow: climb its ladder (E), take one of its three seats facing the glass and watch space go by with a wider view; a readout on the glass names a unit that needs you (N takes you to it) and counts the jump in ([the forward lounge](docs/deck.md#the-forward-lounge)). From across the deck each table shows its headline counts, large enough to read from the dais, and turns back into its table as you walk up. The Attention board in the middle of the arc is the hero: a card for every unit that is stuck, needs you or waits for review (stuck first, names in 0.5 m type, readable from the chair; three or fewer go full width, the first a lit hero card with the N key when it needs you), the working folded into one *WORKING 12* chip, *ALL CLEAR* when nobody waits, and the counts in its header, the only place besides the top bar the room counts. Each board is framed in lit chrome the colour of its most urgent state, an empty Queue or Services folds to a pill so Issues and Pull requests read bigger, and while a waiting unit is out of view the arc's foot on its side points to it ([docs/design.md](docs/design.md#the-bridge-from-the-captains-chair)).
- **Units at consoles.** Deploy Claude Code, Codex, OpenCode, Grok, Muse, DeepSeek Harness, Pi or Cursor at a free console, with its model and effort. Each runs in its own git worktree; its live terminal is one click away, for anyone on the deck. A unit that needs you steps onto its pod's ready line with an orange diamond turning over it and a beam of light up to its card on the Attention board; a stuck one has a red triangle blinking over it and a red rim round its station, one to review an amber ring at its feet, one at work a small cyan pip. One label a unit: its card while the board is in view, else its callout, else its mark at the edge of the screen. **N** takes you to the next one.
- **Agents that manage agents.** Every unit can list, deploy, message and stand down the others through the `mergeline` MCP server or the `office-workers` command, and board agents at the situation wall triage issues and pull requests for whoever walks up.
- **The home page.** `/` is the inbox: every agent in four sections with one button each, the selected agent's terminal, diff and log beside the list, the Deploy sheet, Shipped today and six keys ([the inbox](docs/inbox.md)). It loads no 3D and opens its windows only when first wanted, so it draws after about 175 kB on any laptop or phone. The old `/lite` address goes there. With Bridge view on in Labs, the deck plan fills the pane while no agent is selected.
- **A bridge that looks alive.** Each console's screen shows its unit's state toward the table, and a working one runs with its terminal's output while the unit's hands work the console; busy stations send pulses to the holo table, whose route column climbs through the mission's waypoints with each unit's marker parked at its own, and whose one caption at the table's lip says how far the ship has come toward the active milestone, and a ticker over the wall carries the clock and the deck's log. Its pod goes quiet round a unit that needs you, a dark ring settles round that unit on screen, and the room's spectacle ducks for a beat and then stays (it no longer greys out while anyone waits); it all stills with Settings > Bridge > Ship motion at Off ([the deck](docs/deck.md#the-bridge)). The room reads in three zones of value: a dark hull, the crew under cool starlight with warm footwell glows, and the arc's type bright on its own dark backing, under a vivid magenta and teal galaxy ([the look](docs/design.md#the-look-value-light-and-colour)). Out of the ports, gas and dust stream past at four depths, a ringed giant hangs off the port side and the sun flares through the canopy. On a page's first load the view arrives from outside the bow and comes down through the canopy to the conn in 5 s (any key lands you there). Sitting in the captain's chair takes the conn: the view rises over the chair's back, the tiers light from the pit to the dais and the arc builds in, the Attention board first (any key skips it). A unit that starts needing you hails: its beam climbs to its card, the card slides in with chevrons and its ship marker flies from the holo to hover by the dais; a stuck card sweeps red, and a jump's countdown (JUMP IN and the digit, a ring wiping round it), a waypoint cleared and the mission complete are said on one type plane over the arc; at rest a wave of light runs down the canopy's ribs every 7 s and, at High, a wake of lit dust streams over the glass ([the motion layer](docs/design.md#the-motion-layer)). Merges and jumps are framed, the boards and the holo have a screen's scanlines, and one grade sets the look by Night and by Day ([the cinema](docs/design.md#the-cinema)). Settings > Bridge > Quality (Auto by default) draws less of the light, detail, space close by and the cinema on slower graphics: High smooths edges with SMAA, Medium with FXAA, and Low leaves out the grade, the screens' character and the arrival. Auto steps down only for frames that keep falling behind and back up when there's room, holds at Medium or better on Apple silicon and discrete GPUs, and says what it runs at in Settings and on the menu's Quality row, with *Try High* to undo a step down ([light and materials](docs/deck.md#light-and-materials)). In first person your own gloved hands are at the bottom of the view: they sway and swing as you look round and walk, reach out and tap whatever you use, hold up a datapad with the counts while Mission control is open, make way when you stop to read a board, and hold each rung of the lounge's ladder as you climb past it (Settings > Bridge > Hands; [your hands](docs/design.md#your-hands-in-first-person)).
- **The world outside moves with the work.** The mission is a world low in the forward glass, a quarter of the view from the first waypoint, that grows with every waypoint passed and issue closed, until the ship drops into orbit; every other deck flies as an escort off the side ports (its size its units, its lit ports its units at work, a needs-you beacon when it needs you, click it for the Decks lift); and each working unit has a fighter on patrol, its open pull request a fighter on the picket ahead; high off the starboard bow, seen from the captain's chair, the Relay Beacon carries a node-star for every unit at work in the fleet, flares the lamp at the heart of its rings on a merge and lights a ledger segment per bounty released ([the Relay Beacon](docs/design.md#the-relay-beacon)). None of it moves on its own timer, and it all gives way to a unit that needs you. Settings > Bridge > Life: Full, Calm (no salutes, hails or patrols) or Silent running (no ambient life, stars at a crawl), and a switch for each part ([the deck](docs/deck.md#the-bridge), [docs/design.md](docs/design.md#the-world-outside)).
- **A crew with a record, a ship with a mind.** VESPER, the ship's mind, says a dry line now and then about what the crew really did ("3 merges this hour. The engines have noticed."), on the ticker and as a caption; when a unit needs you it says one plain sentence and goes quiet until that clears. Units earn epithets and chevrons from their real record (*the Mechanic*, *the Night Owl*; a violet chevron for a record on chain), shown up close and in Mission control's Crew tab, and the unit of the watch stands on the Proof corner's plinth. The crew carry themselves by their real state: they lean in at work, stand and stretch when they finish, slump when stuck and turn to the conn with a hand up when they need you. Bolt, a lopsided tool-drone with one arm, carries a finished unit's work to the Review bay with a trail behind it and waits by a unit that needs you. Kip, a small furry stowaway with a glowing toy wand, runs laps of the pit while the crew works, trots after Bolt's handoffs, twirls for a merge, hides behind the captain's chair while a unit is stuck and sits quietly by one that needs you. Settings > Bridge > Life has Ship's voice (On, Plain only, Off), Crew epithets, Bridge droid and Bridge mascot ([docs/design.md](docs/design.md#the-crew)).
- **Moments the crew earned, and a bridge that says how it's doing.** Celebrations come in tiers and only for real outcomes: a unit's first merge turns its pod to it with a nod, a unit back from stuck gets a sweep of light and a line on the band, three merges in an hour with nothing stuck put hands up across the ship, a waypoint jumps the ship in three beats (the lights let down through 3, 2, 1, the punch into a bright tunnel with the view kicked wide, the next world swinging into the glass) with the log card's real numbers, and the mission complete brings the fleet past the bow with a card naming every unit that merged. None of it plays while a unit needs you; it waits, and after ten minutes it is only the card. Alert conditions dim the room (never tint it) while units wait: amber past five minutes, red when one has been stuck past ten, and the lights come back up aft to bow when the last one clears; the band names who is behind a condition, and says STANDING DOWN the moment nobody is. Settings > Bridge > Moments: Celebrations (Full, Cards only, Off) and Alert conditions (on or off, the minutes) ([docs/design.md](docs/design.md#moments)).
- **Rituals: a start of watch, momentum you can see, a pit wall.** The first visit of the day the bridge's lights come up aft to bow, pod by pod, and the day's captain's log is typed onto the forward glass a sentence a line ("Day 14 of the mission. Yesterday the fleet merged 9 pull requests..."); back after twenty minutes away, a debrief in VESPER's voice lists who waits on you first, then what landed. A drive core rising over the Deck lift sends a pulse up its column and lights a ring for each merge in the current run, its collar counting the run and today's best, and the ticker carries the fleet's week against its record. The pit wall over the Review bay times your reply and review turnaround against the last seven days, and the top bar says what the crew got through today once there is something ("2 units back on task"). Outcomes only, team-level only, and all of it gives way to a unit that needs you. Settings > Bridge > Rituals: Start of watch (Full, Debrief only, Off), Momentum display and Turnaround clock ([docs/design.md](docs/design.md#rituals)).
- **Calm by design.** Hue zoned (orange only ever means someone needs you), a glyph for every state, ambient life that gives way to attention, synthesized sound in four groups with a mixer, where the alerts always sit on top ([DESIGN.md](DESIGN.md), [docs/design.md](docs/design.md#sound)).
- **Night and Day lights.** Settings > Bridge > Bridge lights: Night for a dark room under the galaxy, Day for high orbit over a sunlit planet, or Auto to follow your system, with a Brightness step either way. The HUD, the 2D view and the sign-in page follow it ([the deck](docs/deck.md#light-and-materials)).

## Teams and servers

The same inbox runs on a server for a team: everyone reaches it through an SSH tunnel or Tailscale, with their own account. One script each for [AWS](docs/self-hosting.md#deploy-to-aws-ec2), [Azure](docs/self-hosting.md#deploy-to-azure), [Railway](docs/self-hosting.md#deploy-to-railway), [Fly.io](docs/self-hosting.md#deploy-to-flyio), [Dokploy](docs/self-hosting.md#deploy-to-dokploy) and [any Ubuntu or Debian machine](docs/self-hosting.md#deploy-to-any-ubuntu-or-debian-server), all in [docs/self-hosting.md](docs/self-hosting.md). Off your own computer the office asks for a password or an account, never a sign-in link.

## Add users

Everyone gets their own account, so their name is on their operator, in chat and on every terminal they type into.

**1. On a server, let them in first.** On a [Tailscale](docs/aws.md#tailscale) office, everyone on your tailnet can already open it. For someone who isn't, share the machine with them from Tailscale's Machines page: **Invite teammates** (Ctrl+K) says how. Skip to step 2.

Otherwise the office is only reachable through an SSH tunnel, so a teammate needs their SSH key on the machine. In the office, open **Invite teammates** (Ctrl+K) and type their GitHub username. On AWS, Railway, Fly.io or Dokploy you can also do it from your terminal:

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

A teammate with Mergeline on their computer can run `npx mergeline tunnel office@<your-office-ip>` instead of the `ssh` line: it opens the same tunnel, and every web server a worker starts opens on their computer too ([docs/tunnel.md](docs/tunnel.md)).

**2. Make them an account.** Open **Accounts** (Ctrl+K) and make an invite link. Name it (or let them pick) and make them a *Member* or an *Admin*. The link works once, for 7 days, and they choose their own password. Make one for yourself too, as an admin.

The same works from a terminal on the office's machine, even while it runs:

```bash
mergeline accounts                      # accounts and open invites
mergeline accounts invite ada --admin   # prints a single-use /join#... link
mergeline accounts role ada member
mergeline accounts revoke ada           # signed out within seconds
```

On the EC2 machine, run it through `deploy/aws.sh ssh` (on Azure, `deploy/azure.sh ssh`):

```bash
deploy/aws.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada --dir "$(cat /etc/agent-office/home)"'
deploy/railway.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'   # on Railway
deploy/fly.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'       # on Fly.io
deploy/dokploy.sh ssh 'node /opt/agent-office/bin/agent-office.js accounts invite ada'   # on Dokploy
```

**Their own Claude and GitHub.** With accounts, everyone's workers run on their own Claude plan, and the office acts on GitHub as them: comments, merges, labels, pushes and pull requests show up under their name. The first time someone comes in, **Your sign-ins** opens (it's under Menu > Deck too). *Sign in with Claude* gives them Claude's sign-in page and takes back the code it shows. *Sign in with GitHub* shows a one-time code for github.com/login/device. They can paste a token from `claude setup-token`, or a GitHub token, instead. A shell they open at a console runs as them, so `claude auth login` and `gh auth login` typed there work too. Admins can use the office machine's own sign-ins instead. Each account's sign-ins live in `.agent-office/homes/<account>/`, and revoking the account deletes them. The boards are read with the machine's own `gh`, so that account needs read access to the repos. Running it just for yourself, with no accounts, none of this applies.

**3. Turn off the shared password.** Until you do, anyone who knows the office password can get in, as an admin. Once everyone has an account, switch it off in **Accounts** (signed in with your own admin account), or `mergeline accounts password off`.

**Removing someone.** Revoke their account in **Accounts** (or `mergeline accounts revoke <name>`), and on a server also remove them in **Invite teammates** (on AWS, `deploy/aws.sh uninvite <name>`; on Railway, `deploy/railway.sh uninvite <name>`; on Fly.io, `deploy/fly.sh uninvite <name>`; on Dokploy, `deploy/dokploy.sh uninvite <name>`) to take away their SSH keys and drop open tunnels (other teammates just reconnect). If the shared password is still on, change it with `deploy/aws.sh reset-password` (or `deploy/railway.sh reset-password`, `deploy/fly.sh reset-password` or `deploy/dokploy.sh reset-password`).

## Controls

The home page needs six keys: Ctrl+K (find anything), N (deploy an agent), Enter (the selected agent's next step), Esc, / (search) and ? (the keys); see [the inbox](docs/inbox.md#keys). The keys below are the Bridge view's (`/bridge`, a lab).

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
| G | The Overview: the whole deck from above, a little off the axis, as one plan with the arc facing you (Q / E turn it, G walks again) |
| T / Enter | Chat |
| V | Join voice; then hold V to talk |
| M | Mute / unmute in voice |
| Ctrl + Space | Dictate into a terminal or a prompt box: hold it and talk (or hold the mic button) |
| Tab | The menu: Command, Work and Deck (Proof and Comms with their labs on) |
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

The browser tests (`tests/*-e2e.test.ts`) load the built bundle, so run `npm run build` before `npm test` to include them. They skip, saying why, when there is no bundle or it is older than the sources it was built from (after an edit, a merge or a checkout).

Server edits restart the server, not the workers. After changing `ptyhost.ts`, bump `PTY_PROTOCOL` in `ptys.ts` so the next server replaces the PTY host.

[docs/code-layout.md](docs/code-layout.md) says where the code lives, and where a new feature's pieces go.

The rules for coding agents working on this repository are in [`AGENTS.md`](AGENTS.md), which Codex, OpenCode and most other agent CLIs read. `CLAUDE.md` only imports it for Claude Code, so new rules go in `AGENTS.md`.

The npm package ships the built `dist/` (`files` in `package.json`), so `npx mergeline` builds nothing on the user's machine: run `npm run build` before `npm publish` (`prepare` does it on `npm pack` and `npm publish`). `install.sh` and `install.ps1` install that package.

## More

- [The inbox](docs/inbox.md): the home page, its loop, the setup card, its keys and the shipped log
- [The demo](docs/demo.md): `npx mergeline --demo` with five scripted agents, the hosted read-only demo, and the scripts that make the video, the GIF and the deck's screenshots
- [Features](docs/features.md): seeing what every agent does, handing out work, reviewing it and staying on mission
- [Design system](docs/design.md): each surface on screen, the motion and the deck's sound, demo mode, and how to check a design change with `design/shoot.mjs`
- [The deck](docs/deck.md): what's where on the 3D deck (the pit and the mission table, the tiers and the pods, the conn's dais, the ready line, the situation arc, the Proof corner), cell addresses, and the Overview camera
- [Mission control](docs/mission-control.md): the attention ranking, the floor's mission and milestones, linking work to goals, the review inbox, the timeline, reminders and the digest
- [Proof of Merge bounties](docs/bounties.md): devnet USDC escrowed against an issue, paid only when a person merges the office's pull request and an admin approves (testnet only, off by default); the [GitHub Action](onchain/action/README.md) attests merges to the same escrow from any repository's workflow, without the office
- [Proof of merge on Base Sepolia](docs/proof-of-merge.md): an EAS attestation for every office PR a person merges, reverts or closes in an opted-in public repository, and an indexer that rebuilds the leaderboard from chain data alone (testnet only, `--attest --attest-repos`)
- [Agent reputation from merges](docs/reputation.md): ERC-8004 identities for the office's agents, feedback only for what a person did with their pull requests, a public leaderboard and a read-only MCP tool (testnet only, `--reputation`)
- [The public showcase](docs/showcase.md): a shareable, read-only page at `/pom/` (and on GitHub Pages) showing which coding agents' PRs people actually merge, from chain data, with an explorer link on every row (testnet only, off until an admin turns it on)
- [The launch kit and its tools](docs/launch.md): submission drafts, posts and the calendar in `launch/chain`, and the checks that keep their numbers, links and limits honest
- [Paid tasks over x402](docs/x402.md): outsiders pay test USDC to queue one task, held until an admin approves it (testnet only, `--x402`)
- [Agents](docs/agents.md): every harness the office runs (Claude Code, Codex, OpenCode, Grok, Muse, DeepSeek Harness, Pi, Cursor), models and effort, and the office's prompts
- [Configuration](docs/configuration.md): every command-line option, and where the office keeps its data
- [Workers' servers on your own computer](docs/tunnel.md): `mergeline tunnel`, which opens every worker's web server on your computer by itself
- [AWS reference](docs/aws.md): Tailscale, service tunnels, upgrades, and everything `deploy/aws.sh` does
- [Railway reference](docs/railway.md): what `deploy/railway.sh` sets up, and what the volume keeps
- [Fly.io reference](docs/fly.md): what `deploy/fly.sh` sets up, machine sizes, pausing and what the volume keeps
- [Dokploy reference](docs/dokploy.md): what `deploy/dokploy.sh` sets up on your Dokploy, and what the volume keeps
- [Teams and servers](docs/self-hosting.md): one script each for AWS, Azure, Railway, Fly.io and Dokploy, the one-line setup for any Ubuntu or Debian server, or by hand behind Caddy or nginx
- [Azure reference](docs/azure.md): picking a VM size, pausing, and everything `deploy/azure.sh` does
- [How it works](docs/how-it-works.md): the architecture, and security notes
- [Security](docs/security.md): the threat model, and what keeps repositories, other sites and stolen cookies out
- [Code layout](docs/code-layout.md): where the code lives, adding a feature or an agent provider, and the size guard

## Upstream credit

Mergeline is a fork of [agent-office](https://github.com/AgentSystemLabs/agent-office), created by webdevcody, Copyright (c) 2026 AgentSystemLabs, released under the MIT License. The server's architecture (projects as floors, agents and their terminals, worktrees, provider adapters, the queue, meetings, voice, accounts, the tunnel and the deploy scripts) is upstream's; [NOTICE](NOTICE) lists what this fork replaced and what remains, and [launch/chain/disclosure.md](launch/chain/disclosure.md) lists our changes commit by commit. This fork is not run by the upstream authors. The package is `mergeline`; the `agent-office` command it also installs is the same command, so upstream's scripts keep working.

## License

[MIT](LICENSE)
