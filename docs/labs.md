# Labs

Kipdeck gives you full control and clarity over every AI coding agent you run, in one place. Everything beyond the inbox is a lab, off as Kipdeck ships, and an admin can switch any of them on.

Back to the [README](../README.md).

The office is an inbox for your coding agents: the home page at `/` ([the inbox](inbox.md)) sorts every agent by what it needs from you, and opens each one's terminal, its changes and its pull request beside the list. Everything else the office can do is a lab. Each lab is off as the office ships, so a new office opens on the inbox and nothing else; an admin switches on whatever a team wants, and an office that saved its labs keeps them.

Turning a lab off hides it: its menu rows, its settings pane, its tabs, for Proof of Merge its HTTP routes, and over the socket the messages of Proof of Merge, Meetings, Voice and Rundown (a page that sends one hears which lab it needs). Its code stays in the build and in the tests, and what it saved (bounties, goals, a whiteboard) stays on disk for when it comes back on.

## The labs

| Lab | Id | What it brings (switching it off hides it) |
| --- | --- | --- |
| GitHub boards and queue | `boards` | Issues, Pull requests, the Task queue and Mission control in the home page's avatar menu and Ctrl+K. Without it the inbox is the one place work is managed: it already shows every agent's pull request and checks. The Deck keeps its own boards. |
| Deck (3D) | `bridge` | **Enter the Deck** in the Labs group of the home page's avatar menu (with how many agents are at work), as Go to Deck near the end of Ctrl+K and on **D**, and a small deck plan under the work in the empty pane. The Deck itself is a page of its own at `/deck` (the old `/bridge` address redirects there) and always opens; this lab only decides whether the home page points to it. The Deck works as a wall display for a team room. The lab's id stays `bridge`, so saved choices and `--labs bridge` keep working. |
| Goals and timeline | `ops` | Mission control's Goals, Timeline and Records tabs (Attention and Review are always there), the mission strip in the bridge, and the bridge menu's Timeline, Mission and milestones and Services rows. |
| Meetings | `meetings` | The bridge menu's Review bay and Planning board, and the **Meeting...** and **Review panel...** buttons on an issue and a pull request. |
| Voice | `voice` | Voice chat, mute and screen sharing in the Deck's menu, and the dictation mic on prompt boxes and terminals everywhere, the home page included. The browser asks for the microphone or the screen only when you click to use them, never when a page loads. |
| Deck ambience | `ambience` | The Deck in full. Its sound starts with your first click or key on the Deck, as browsers require, never on load. With it off the Deck starts calm: Life at Silent running with every part off (no mascot, droid, fleet or relay), no ship's voice, celebrations, start of watch, momentum display or pit-wall clock, no hands, space at Calm and the ambience bed silent. Alerts and attention cues are never touched. |
| Rundown | `rundown` | A map of each project: its parts by status, milestones, commit activity, branches and worktrees, and the decisions waiting on you. In the home page it's **Rundown** in the avatar menu and Ctrl+K; on the Deck it's **Rundown** and **Rundown on the holo** in the menu and Ctrl+K, which raises the project as a city of light over the mission table. The office builds each project's first map in the background when the project opens or the lab comes on (inferred from the code, kept in the office's memory), so the window opens with data and Signal's card has the parts to show. While it's off its socket messages go nowhere, no map is built and its download route doesn't exist. See [Rundown](rundown.md). |
| Proof of Merge (testnets) | `proof` | Bounties and payouts (the Bounties settings pane and the payouts in the review inbox), the bridge menu's Proof group, and the public routes: the Fund this issue Action (`/actions.json`, `/api/actions/*`), x402 paid tasks (`/api/x402*`), reputation (`/api/public/*`, `/agents/*`) and the ledger at `/pom/`. While it is off, those routes don't exist: a visitor who isn't signed in is sent to sign in, as for any page. Testnets only: nothing goes on chain and no key is needed until an admin turns bounties on in Settings or starts the office with a chain flag and its keys. Until then the lab shows only the Bounties settings pane, where it is set up: the Proof corner on the deck plan and on the Deck, the Proof ledger row and the payout counter wait until it is set up (`src/shared/proof-ready.ts`). See [Proof of Merge](proof-of-merge.md). |

## Switching them

- **From the office.** **Labs** at the foot of the home page's avatar menu (with how many are on), **Open Labs...** at the foot of Settings > Account, or Labs in its command palette (Ctrl+K), or **Labs** in the Deck's menu (Tab). An admin switches a lab for everyone in the office; the Labs window says who switched one last, and nobody gets a toast about it. Anyone else sees which are on. The window has a ✕ in its top right, and Esc closes it.
- **From the command line.** `--labs bridge,ops` (or `AGENT_OFFICE_LABS=bridge,ops`, or `all`) holds those labs on for as long as the office runs; the Labs window shows them on and can't switch them off. Any chain flag (`--x402`, `--attest`, `--reputation`) holds Proof of Merge on, since those are its own switches. A leading minus holds a lab off instead: `--labs -proof,-voice` (or `AGENT_OFFICE_LABS=-proof,-voice`), or `--labs none` for an office with only the inbox. The Labs window shows those as held off from the command line, and nobody can switch them on. One lab can't be held both ways, so `--labs -proof` with a chain flag stops the office at start.

An admin's choice is kept in `labs.json` in the office's data folder (`~/agent-office/.agent-office/` by default), so a restart keeps it. Every lab a `"v": 2` file names keeps its value, so an office that saved its labs while they shipped on keeps what it had. A lab the file doesn't name (one added since) takes the default, off. Files written by the oldest offices have no `v` field and spell out every lab, since one switch saved them all; such a file keeps only its trues. The next switch writes the `"v": 2` format.

Deck ambience takes effect when the Deck loads; switching it while you're on the Deck says to reload. While it is off the Deck uses calm settings without saving them, but changing any setting in the Deck's Settings window saves the whole set, the calm values included.

## For developers

The table of labs is `src/shared/labs.ts`. The server keeps them in `src/server/labs.ts` (`ctx.labs`), sends them in the welcome and with `/api/whoami`, and takes `labs.set` from admins (`src/server/ws/handlers/labs.ts`). A lab joins the registries it hides from rather than being checked in the middle of other code:

- an HTTP route takes `lab: '<id>'` (`src/server/http/router.ts`), and isn't matched while that lab is off;
- a socket message belongs to a lab through its handler map (`src/server/ws/labgate.ts`), and `dispatch` drops it while that lab is off;
- a menu row in the bridge takes `lab: '<id>'` (`HudAction` in `src/client/ui/menu.ts`);
- a settings pane is added only while its lab is on (Bounties in `src/client/ui/settings.ts`, after the three panes every page shares from `settings-core.ts`);
- client code asks the store: `store.lab('<id>')` (`src/client/state/slices/labs.ts`), and follows the `labs` topic.

`tests/labs.test.ts` checks the defaults, the switches, the routes behind Proof of Merge and what each lab hides.
