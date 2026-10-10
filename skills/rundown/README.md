# rundown

A Claude Code skill that draws a project map of any git repo. Type `/rundown` in any directory
and you get one offline HTML page in `<repo>/.rundown/rundown.html`:

- status overview: parts by status, the suggested next step, the next milestone with items
  left, open decisions, tests, the working tree and upstream ahead/behind
- what changed since the last run
- a "Needs you" strip with every stuck part and what it waits on, in full
- a treemap of the codebase, one block per part, sized by lines and coloured by status, with a
  details drawer per part
- the milestone timeline and the active milestone's checklist
- a commit heatmap (the repository's age, 8 to 26 weeks) with contributors
- branch lanes forked at their merge-base, with worktree badges
- "Your call": decisions only you can make, each with its DEFAULT
- a facts appendix: languages, folders, largest files, scripts, packages, CI, docs, TODOs

The same model and page power Mergeline's Rundown window and the holo city on its bridge.

## Use

| You type | What happens | Time |
| --- | --- | --- |
| `/rundown` | Full run: facts, then Claude judges parts, statuses, next step and decisions, then the page opens | a few minutes |
| `/rundown quick` | Facts + redraw, reusing Claude's last judgement and your edits to the markdown files | about 1 s |
| `/rundown facts` | Facts only, printed as a short summary | about 1 s |
| `/rundown ~/code/api` | Any of the above for another folder | |

Iterate fast: edit `.rundown/milestones.md` (tick items, rename, reorder) or answer a decision
under `Answer:` in `.rundown/decisions.md`, then `/rundown quick`.

Without Claude you can run the script directly:

```
node ~/.claude/skills/rundown/scripts/rundown.mjs quick --open      # collect + render
node ~/.claude/skills/rundown/scripts/rundown.mjs facts             # facts summary
node ~/.claude/skills/rundown/scripts/rundown.mjs brief             # the digest Claude reads
node ~/.claude/skills/rundown/scripts/rundown.mjs render --theme light --accent blue
```

Every command takes `--root <dir>` and `--no-gh`. Node 18 or newer, no dependencies.

## Files in `.rundown/`

| File | Written by | Purpose |
| --- | --- | --- |
| `facts.json` | collector | Deterministic facts (counts, paths, line numbers; never file contents) |
| `judgement.json` | Claude | Parts with paths, status, evidence and waitingOn; the next step; first proposals for milestones and decisions |
| `milestones.md` | you (first draft by Claude) | Milestones, "Done when", checklist items |
| `decisions.md` | you and Claude | Open and resolved decisions with options, DEFAULT and your Answer |
| `rundown.json` | renderer | The merged model the page draws (Mergeline reads it too) |
| `rundown.html`, `map.html` | renderer | The page (the same file under both names) |
| `state.json` | renderer | The diff base for the next run, written last so a failed run never moves it |
| `history/` | renderer | The previous 20 `state.json` files |

## Style

The page follows `~/.claude/agent-memory/project-map/style.md` (`style: dark|light`,
`accent: <name or #hex>`), shared with the project-map agent. `--theme` and `--accent` override it
for a run. The page also has a theme toggle, remembered per browser.

## Safety and limits

- Read only on the project apart from `.rundown/` and one line in `.git/info/exclude`.
- A `--root` that isn't a folder is an error, never created. Your home folder and `/` are only
  mapped when named with `--root`. Outside a git repository nothing is listed or opened.
- Git runs through `execFile` with fixed arguments and a timeout, no optional locks, and the
  config that could run a program switched off. It never fetches, checks out or writes refs.
  `gh` is optional with a 15 s timeout.
- Files come from `git ls-files` (tracked, plus untracked files that aren't ignored; tools'
  caches such as `.playwright-mcp/` are left out). Symlinks are never followed; binaries,
  lockfiles and built output are not counted for lines.
- Sensitive names (`.env*`, keys, keystores, `*credential*`, `*secret*`, `*vault*`, dumps, logs)
  are counted and never opened. TODOs record `path:line:tag`, never the text. Contributors are
  display names, never emails. Remote URLs lose any credentials.
- The page makes no network requests (a CSP of `default-src 'none'` enforces it).

## Where it comes from

The source is `skills/rundown/` and `src/server/rundown/` + `src/shared/rundown/` in the Mergeline
repository; `npm run rundown:install` builds `dist/rundown/rundown.mjs` and installs it here with
this README and SKILL.md, after listing what changes and backing up the old folder to
`~/.claude/backups/rundown-<time>/`. `npm run rundown:install -- --dry-run` only shows the list.
