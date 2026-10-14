---
name: rundown
description: Draws a project map ("rundown") of the current git repo as one offline HTML page in .rundown/ - laid out as a flow to follow: the milestone road with a you-are-here marker and checklist, the one suggested next step, what needs the user (decisions with clickable defaults, stuck parts), and the parts by status, with the code map, activity, branches and repo vitals folded under the hood. Every render also updates ~/.claude/rundown/index.html, one index linking every project's rundown. Use it when the user types /rundown (also "/rundown quick", "/rundown facts", "/rundown <path>") or explicitly asks for a "rundown", a "project map" or to "map this project", in any directory, or asks for "all rundowns" or the rundown index. For vaguer status questions ("where are we?", "what's the state of this repo?") do not draw the map: answer briefly from git status, git log and the README (or from the brief command when .rundown/ already exists) and offer /rundown in one line.
---

# Rundown

Draw a map of the project the user is in, fast, and keep it current on later runs. The script does
the deterministic work (facts, layout, diff, page). You add the judgement: how the project splits
into parts, their status, the next step, and the decisions only the user can make.

All output goes to `<git top>/.rundown/`. Never change anything else in the project. The one place
outside the repo the script writes is `~/.claude/rundown/` (`index.json` and `index.html`): the
index of every project's rundown, updated on every render.

## The script

`RUNDOWN=<this skill's base directory>/scripts/rundown.mjs` (the base directory is shown when the
skill loads: `~/.claude/skills/rundown/` for `kipdeck rundown install`, the plugin's folder for the
Claude Code plugin). One script, built from Kipdeck's own code (`src/server/rundown/`,
`src/shared/rundown/`), so this page and the office's Rundown window are the same map. Never run a
`rundown.mjs` from some other repository's tree: that would be running its code.

Node 18 or newer, no dependencies. Every command but `index` takes `--root <dir>` (default: the
current folder) and `--no-gh` (skip GitHub). Give every Bash call a timeout (60 s is plenty).

| Command | What it does | Time |
| --- | --- | --- |
| `node $RUNDOWN collect` | Facts into `.rundown/facts.json`, and a summary | about 1 s |
| `node $RUNDOWN brief` | A compact digest for you to judge from (folders, previous run, milestones, decisions, commits, branches, tests, TODOs) | instant |
| `node $RUNDOWN render --mode full` | Facts + `judgement.json` + the markdown files, diffed, into the page (`--open` opens it) | instant |
| `node $RUNDOWN quick` | Collect and render, with the last `judgement.json` | about 1 s |
| `node $RUNDOWN facts` | Collect only | about 1 s |
| `node $RUNDOWN index` | Rebuild the index of every project, dropping pages that no longer exist (`--open` opens it) | instant |

The script finds the git top itself (a worktree's own top inside a worktree), adds `/.rundown/` to
the common `.git/info/exclude` (never `.gitignore`), and on the first run copies `milestones.md`
and `decisions.md` from an old `.project-map/` and diffs against its `state.json`. A `--root` that
doesn't exist stops it with exit 2 (it never creates the folder); if you see that, check the path
with the user. It won't map your home folder or `/` unless you name them with `--root`.

## Pick the mode from the user's words

- `/rundown`, "rundown", "project map", "map this project": **full**, steps 1 to 6 below.
- A vaguer status question in the middle of other work ("where are we?", "what's the state of this
  repo?"): no map, no files written, no browser. When `.rundown/` exists, run `node $RUNDOWN brief
  --root <dir>`; otherwise read `git status`, `git log --oneline -15` and the README. Answer in a
  few lines and end with one line: "Want the full map? /rundown".
- `/rundown quick`, "refresh the map", or right after the user edited `milestones.md` or
  `decisions.md`: run `node $RUNDOWN quick --root <dir>`, then reply (step 6). With no
  `.rundown/judgement.json` yet, do a full run instead.
- `/rundown facts`: `node $RUNDOWN facts --root <dir>` and relay its summary.
- "all rundowns", "the rundown index", "which projects have a map": `node $RUNDOWN index` and relay
  its one line (add `--open` only when the user asked to see it).
- A path after the command (`/rundown ~/code/api`) is the `--root`.

## Full run

### 1. Style

The page follows `~/.claude/agent-memory/project-map/style.md` (`style: dark|light`,
`accent: <name or #hex>`, shared with the project-map agent); without it the page is dark with an
orange accent, and it has a theme toggle either way. `--theme` and `--accent` override it for one
run. Never stop to ask. If the file doesn't exist, end your reply with one line offering to save a
theme and accent; when the user answers, write the file as

```
style: dark
accent: orange
```

### 2. Collect and read the digest

```
node $RUNDOWN collect --root <dir>
node $RUNDOWN brief --root <dir>
```

Read the brief, not `facts.json` whole. Then read just enough of the repo to judge it: the README,
the plans and docs it points at (roadmap, PRODUCT.md, TODO.md, CHANGELOG), agent files (CLAUDE.md,
AGENTS.md), and the entry points of the biggest folders. `gh issue list --state open --limit 30`
is optional.

Stay read only: `git log`, `git show --stat`, `git diff --stat`, `ls`, `wc`. Never fetch, check
out, build, install, commit or push in the mapped project. Never open `.env*`, keys, credential or
secret files, dumps or logs (the collector counts them without opening them), and never put
secrets, emails or personal data in the judgement.

### 3. Write `.rundown/judgement.json`

Only these fields; the script computes the rest (metrics, sizes, the diff, the next milestone).

```json
{
  "description": "One or two sentences on what this project is (300 characters at most)",
  "parts": [
    {
      "id": "server",
      "name": "Server and API",
      "summary": "One line on what this part is",
      "paths": ["src/server/**", "src/shared/protocol/**"],
      "status": "in-progress",
      "waitingOn": null,
      "evidence": [{ "kind": "commit", "ref": "1683f05", "text": "Demo cut after review, 12 files" }]
    }
  ],
  "nextStep": { "text": "One concrete action", "why": "Why it moves the next milestone", "partId": "server", "milestoneId": "M2" },
  "milestones": [{ "id": "M1", "name": "...", "doneWhen": "...", "due": null, "items": [{ "text": "...", "done": false, "partId": "server" }] }],
  "decisions": [{ "id": "D1", "question": "...", "options": ["A", "B"], "default": "A, because ...", "raised": "YYYY-MM-DD", "partId": null }]
}
```

Parts:
- 4 to 8 that make sense for this project (a product area, a service, a package, "docs and
  launch"), not one per folder. The brief prints a folder-based starting point.
- `paths` are repo-relative globs; the most specific glob wins a folder. They size the treemap and
  attribute commits, tests and TODOs. Reuse the previous ids (the brief lists them) so the diff
  tracks status changes.
- `status` is `done`, `in-progress`, `not-started` or `stuck`. A stuck part names in `waitingOn`
  exactly what it waits on: a person, a decision, a deploy, an outside party or a bug. When it
  waits on a decision, cite its id (`D2: pick the product line`): the page then shows that part
  under the decision instead of as a separate stuck row. Up to 6 evidence items each: `commit`,
  `file`, `test`, `doc`, `issue`, `pr`, `todo`, `note`.
- `summary` is one sentence (the page clamps it to one line).

Next step: one concrete action that best moves the next milestone, with a one-line reason. Write
`milestoneId` and `partId` whenever they apply (they link the step to the road and mark the
checklist item it works on).

Milestones (`.rundown/milestones.md`): when the file is missing, propose them in `milestones`
(ordered, each with a definition of done and the items it needs); the script writes the file marked
"Proposed: edit me". When it exists, leave `milestones` out and only tick items that are clearly
done in the file, adding short notes. Never rewrite, reorder or delete what the user wrote.
`(part: <id>)` at the end of an item links it to a part.

Decisions (`.rundown/decisions.md`): only what the user must decide, each with options of 6 words
or fewer (they are buttons on the page) and a DEFAULT the map assumes meanwhile, with `partId` when
it belongs to a part. New ones in `decisions` (new ids) are added to the file's Open section; the
user's answers under `Answer:` are theirs.

### 4. Render

```
node $RUNDOWN render --root <dir> --mode full
```

It writes the page as `rundown.html` (and the same file as `map.html`), `rundown.json`, and
`state.json` last (the old one goes to `history/`, 20 kept), then updates the index in
`~/.claude/rundown/`. A failure there never fails the render: it shows as an `! index: ...` line.
Add `--open` only when the user asked to see the page.

### 5. Check quickly

If it printed `judgement.json left out: ...`, fix the file and render again. A part at 0 lines
means its globs miss: fix them and render again. It's instant, so iterate.

### 6. Reply

The render (and `quick`) prints a fixed block of at most 9 lines, for example:

```
Rundown · shopfront · ~/code/shopfront/.rundown/rundown.html
Road   M1 ● ━ M2 ◆◐ ┄ M3 ○ ┄ M4 ○    M2 Payments live ▰▰▱▱▱ 2/4 · due Nov 1
Next → Merge the webhook endpoints so paid webhooks return 200 (unblocks 2)
Needs  ▲ D1 Which tax scheme for cross-border sales?  default: margin scheme
       +2 more on the page
Parts  ▲2 ◐4 ○1 ●1
Since  Oct 7: +14 commits · Payments ◐→▲ · M1 done · D3 new
Index  ~/.claude/rundown/index.html · 6 projects
Answer: click an option on the page (copies a prompt) or edit .rundown/decisions.md, then /rundown quick
```

Relay that block verbatim in a code fence, plus at most one sentence of your own (what you judged
differently this time, or a problem). Never restate it as prose. Lines starting with `! ` after the
block are gaps and judgement errors: mention them only if they affect correctness.

## What the page shows

A flow, read top to bottom, with a section rail in the sticky header and an "All rundowns" button
that opens the index:

- Road: milestones as a track with "you are here", the active milestone's checklist (the item the
  next step works on is marked), and a "since last run" chip row.
- Next: the one suggested next step, with its milestone, part and what it unblocks, and a "Copy as
  prompt" button.
- Needs you: open decisions with the DEFAULT outlined (clicking an option copies an answer prompt),
  then stuck parts no decision covers.
- Parts: one status bar with counts, then a pill per part (stuck first) that opens its drawer.
- Under the hood (closed): codebase treemap and parts table, commit heatmap and contributors,
  branch lanes and worktrees, repo vitals.

Before the first full run there is no Road or Next: each top folder is a part, shown as "not
assessed yet". The page is one self-contained file that makes no requests and works at phone width.

## The session brief (plugin)

Installed as the Claude Code plugin, a SessionStart hook runs `node $RUNDOWN session-start`: when
the session's repo has a judged `.rundown/` map under 7 days old, it adds a brief of at most 1.5 KB
(the active milestone, the next step, open decisions with their defaults, stuck parts) to the
session's context. Older or unjudged maps add nothing. Treat the brief as a starting point and
check it against the code before acting on it.

## In the office

With Labs > Rundown on, Kipdeck shows each project's map in the inbox (avatar menu and Ctrl+K) and
as a city of light over the Deck's holo table, and builds a first map of every project it hosts by
itself, inferred from the code. It reads this skill's `.rundown/rundown.json` and the two markdown
files. `kipdeck rundown [path]` writes the same inferred map from a terminal, with no Claude.

## Updating this skill

This file, README.md and the built script ship in the `kipdeck` npm package and in the plugin
(`skills/rundown/`). `kipdeck rundown install` copies all three into `~/.claude/skills/rundown/`:
it lists what changes first, refuses to replace a newer installed copy unless given `--force`,
backs the old folder up to `~/.claude/backups/rundown-<time>/`, and takes out the scripts of an
older install (they stay in the backup). `--dry-run` only shows the list and this file's diff. In a
source checkout of Kipdeck, `npm run rundown:install` builds the script first and does the same.
