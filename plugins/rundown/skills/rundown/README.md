# rundown

A Claude Code skill that draws a project map of any git repo. Type `/rundown` in any directory and
you get one offline HTML page in `<repo>/.rundown/rundown.html`, plus one index of every project's
page in `~/.claude/rundown/index.html`. The page is a flow you read top to bottom:

| Step | Shows | Answers |
| --- | --- | --- |
| ① Road | Milestones as a track, "you are here" with a progress ring, the active milestone's checklist, and a "since last run" chip row | Where are we? |
| ② Next | The one suggested next step, its milestone and part, what it unblocks, "Copy as prompt" | What now? |
| ③ Needs you | Open decisions with the DEFAULT outlined, and stuck parts no decision covers | What is on me? |
| ④ Parts | One status bar with counts, a pill per part (stuck first); a pill opens the part's drawer | How is each part? |
| Under the hood | Closed by default: codebase treemap and parts table, commit heatmap, branch lanes and worktrees, repo vitals and languages | The details |

One glyph set everywhere (page, drawer, chat reply): ● done, ◐ in progress, ○ not started, ▲ stuck,
◆ you are here, → next step. A ticked item or an answered decision shows as done. Every fact has one home on the page; anything
else that mentions it is a chip or a link to that home.

The same model and page power Kipdeck's Rundown window and the holo city on its Deck.

## Install

Two ways in. The Claude Code plugin also adds the session brief (below):

```
/plugin marketplace add zbagdzevicius/kipdeck
/plugin install rundown@kipdeck
```

Or copy the skill into `~/.claude/skills/rundown/` (no session brief):

```
npx github:zbagdzevicius/kipdeck rundown install            # or: kipdeck rundown install
npx github:zbagdzevicius/kipdeck rundown install --dry-run  # only list what would change
```

The installer lists what changes, backs the old folder up to `~/.claude/backups/rundown-<time>/`,
and never replaces a newer installed copy with an older one unless you add `--force`.
`kipdeck rundown [path]` writes the map without Claude.

## Use

| You type | What happens | Time |
| --- | --- | --- |
| `/rundown` | Full run: facts, then Claude judges parts, statuses, next step and decisions, then relays the reply block | a few minutes |
| `/rundown quick` | Facts and a redraw, reusing Claude's last judgement and your edits to the markdown files | about 1 s |
| `/rundown facts` | Facts only, printed as a short summary | about 1 s |
| `/rundown ~/code/api` | Any of the above for another folder | |
| "show all rundowns" | Rebuilds the index and prints its path | instant |

Answer a decision by clicking an option on its card: it copies
`Answer D2 in .rundown/decisions.md: "<option>". Then /rundown quick.` for you to paste to Claude.
Or write it under `Answer:` in `.rundown/decisions.md` yourself, then `/rundown quick`. Edit
`.rundown/milestones.md` the same way.

Without Claude you can run the script directly:

```
node ~/.claude/skills/rundown/scripts/rundown.mjs quick --open      # collect and render
node ~/.claude/skills/rundown/scripts/rundown.mjs facts             # facts summary
node ~/.claude/skills/rundown/scripts/rundown.mjs brief             # the digest Claude reads
node ~/.claude/skills/rundown/scripts/rundown.mjs render --theme light --accent blue
node ~/.claude/skills/rundown/scripts/rundown.mjs index --open      # rebuild and open the index
node ~/.claude/skills/rundown/scripts/rundown.mjs version
```

Every command but `index` takes `--root <dir>` and `--no-gh`. Node 18 or newer, no dependencies.

## The session brief

With the plugin, a SessionStart hook runs `rundown.mjs session-start`. When the session's repo has
a judged `.rundown/` map that is under 7 days old, Claude starts the session with a brief of at most
1.5 KB: the active milestone and its open items, the next step, open decisions with their defaults,
and stuck parts. Older maps, folder-only maps and folders without a map add nothing. The hook only
reads `.rundown/rundown.json`; it never writes, never runs git and never fails a session.

## Files in `.rundown/`

| File | Written by | Purpose |
| --- | --- | --- |
| `facts.json` | collector | Deterministic facts (counts, paths, line numbers; never file contents) |
| `judgement.json` | Claude | Parts with paths, status, evidence and waitingOn; the next step; first proposals for milestones and decisions |
| `milestones.md` | you (first draft by Claude) | Milestones, "Done when", checklist items; `(part: id)` links an item to a part |
| `decisions.md` | you and Claude | Open and resolved decisions with options, DEFAULT and your Answer |
| `rundown.json` | renderer | The merged model the page draws (Kipdeck and the session brief read it too) |
| `rundown.html`, `map.html` | renderer | The page (the same file under both names) |
| `state.json` | renderer | The diff base for the next run, written last so a failed run never moves it |
| `history/` | renderer | The previous 20 `state.json` files |

## Files in `~/.claude/rundown/`

The one place outside a repo that rundown writes. `RUNDOWN_HOME=<dir>` moves it; it must be an
absolute path or start with `~/`, so it can never land inside the repo being mapped.

| File | Purpose |
| --- | --- |
| `index.json` | One entry per project root: name, page path, updated time, mode, branch, active milestone, next step, open decision and stuck counts, part counts, and the device the folder sits on (to tell an unmounted drive from a deleted folder) |
| `index.html` | The index page: one card per project, newest first, stale after 14 days, with a filter box past 8 projects |

Runs take `index.lock` while they update the index, so parallel runs (worktrees) never drop each
other's entry; a lock left by a killed run is taken over. A failure writing the index never fails
the render: it prints as an `! index: ...` line, and the page leaves out its link to an index that
isn't there.

## Style

The page follows `~/.claude/agent-memory/project-map/style.md` (`style: dark|light`,
`accent: <name or #hex>`), shared with the project-map agent. `--theme` and `--accent` override it
for a run. The page also has a theme toggle, remembered per browser.

## Safety and limits

- Read only on the project apart from `.rundown/` and one line in `.git/info/exclude`. Outside the
  project it writes only `~/.claude/rundown/`.
- A `--root` that isn't a folder is an error, never created. Your home folder and `/` are only
  mapped when named with `--root`. Outside a git repository nothing is listed or opened.
- Git runs through `execFile` with fixed arguments and a timeout, no optional locks, and the
  config that could run a program switched off. It never fetches, checks out or writes refs.
  `gh` is optional with a 15 s timeout.
- Files come from `git ls-files` (tracked, plus untracked files that aren't ignored; tools' caches
  such as `.playwright-mcp/` are left out). Symlinks are never followed; binaries, lockfiles and
  built output are not counted for lines.
- Sensitive names (`.env*`, keys, keystores, `*credential*`, `*secret*`, `*vault*`, dumps, logs)
  are counted and never opened. TODOs record `path:line:tag`, never the text. Contributors are
  display names, never emails. Remote URLs lose any credentials.
- The page makes no network requests (a CSP of `default-src 'none'` enforces it).

## Where it comes from

The source is `plugins/rundown/skills/rundown/` and `src/server/rundown/` with `src/shared/rundown/` in the
Kipdeck repository. `npm run build:rundown` bundles the script into
`plugins/rundown/skills/rundown/scripts/rundown.mjs`, which is committed so the plugin installs straight from git;
its second line carries the version. The `kipdeck` npm package ships the same three files. In a
source checkout, `npm run rundown:install` builds the script first and installs it
(`-- --dry-run` only shows the list).
