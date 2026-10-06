# Labs

Back to the [README](../README.md).

The office is an inbox for your coding agents: the home page at `/` lists every agent, ranked by what needs you, and opens each one's terminal, its changes and its pull request. Everything else the office can do is a lab. Each lab is off as the office ships, so the first thing anyone sees is the inbox and nothing else.

Turning a lab off hides it: its menu rows, its settings pane, its tabs and, for Proof of Merge, its HTTP routes. Its code stays in the build and in the tests, and what it saved (bounties, goals, a whiteboard) stays on disk for when it comes back on.

## The labs

| Lab | Id | What switching it on brings back |
| --- | --- | --- |
| Bridge view | `bridge` | The **Bridge view** link on the home page's top bar and the deck plan beside the list. The 3D bridge itself is a page of its own at `/bridge` and always opens; this lab only decides whether the home page points to it. The bridge works as a wall display for a team room. |
| Goals and timeline | `ops` | Mission control's Goals, Timeline and Crew tabs (Attention and Review are always there), the mission strip on the home page and in the bridge, and the bridge menu's Timeline, Mission and milestones and Services rows. |
| Meetings | `meetings` | The bridge menu's Review bay and Planning board, and the **Meeting...** and **Review panel...** buttons on an issue and a pull request. |
| Voice | `voice` | Voice chat, mute and screen sharing in the bridge menu, and the dictation mic on prompt boxes and terminals everywhere, the home page included. |
| Bridge ambience | `ambience` | The bridge in full. With it off the bridge starts calm: Life at Silent running with every part off (no mascot, droid, fleet or relay), no ship's voice, celebrations, start of watch, momentum display or pit-wall clock, no hands, space at Calm and the ambience bed silent. Alerts and attention cues are never touched. |
| Proof of Merge (testnets) | `proof` | Bounties and payouts (the Bounties settings pane and the payouts in the review inbox), the bridge menu's Proof group, the Proof corner on the deck plan, and the public routes: the Fund this issue Action (`/actions.json`, `/api/actions/*`), x402 paid tasks (`/api/x402*`), reputation (`/api/public/*`, `/agents/*`) and the ledger at `/pom/`. While it is off, those routes don't exist: a visitor who isn't signed in is sent to sign in, as for any page. See [Proof of Merge](proof-of-merge.md). |

## Switching them

- **From the office.** The **Labs** button on the home page (the flask icon at the top right), or **Labs** in the Bridge view's menu (Tab). An admin switches a lab for everyone in the office, and everyone is told who did. Anyone else sees which are on. The window has a ✕ in its top right, and Esc closes it.
- **From the command line.** `--labs bridge,ops` (or `AGENT_OFFICE_LABS=bridge,ops`, or `all`) holds those labs on for as long as the office runs; the Labs window shows them on and can't switch them off. Any chain flag (`--x402`, `--attest`, `--reputation`) holds Proof of Merge on, since those are its own switches.

An admin's choice is kept in `labs.json` in the office's data folder (`~/agent-office/.agent-office/` by default), so a restart keeps it.

Bridge ambience takes effect when the Bridge view loads; switching it while you're on the bridge says to reload. While it is off the bridge uses calm settings without saving them, but changing any setting in the bridge's Settings window saves the whole set, the calm values included.

## For developers

The table of labs is `src/shared/labs.ts`. The server keeps them in `src/server/labs.ts` (`ctx.labs`), sends them in the welcome and with `/api/whoami`, and takes `labs.set` from admins (`src/server/ws/handlers/labs.ts`). A lab joins the registries it hides from rather than being checked in the middle of other code:

- an HTTP route takes `lab: '<id>'` (`src/server/http/router.ts`), and isn't matched while that lab is off;
- a menu row in the bridge takes `lab: '<id>'` (`HudAction` in `src/client/ui/menu.ts`);
- a settings pane takes `lab` in `PANES` (`src/client/ui/settings.ts`);
- client code asks the store: `store.lab('<id>')` (`src/client/state/slices/labs.ts`), and follows the `labs` topic.

`tests/labs.test.ts` checks the defaults, the switches, the routes behind Proof of Merge and what each lab hides.
