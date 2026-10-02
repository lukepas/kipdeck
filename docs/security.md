# Security

What Agent Office defends against, what it doesn't, and how each protection works. Back to the [README](../README.md). The day-to-day advice (strong password, HTTPS, a dedicated user) is in [How it works](how-it-works.md#security-notes).

## Threat model

Anyone who signs in to the office can drive its agents, and through them run commands as the user that runs the office. So the office treats a sign-in like SSH access, and everything below is about keeping the people and code that have *not* been let in from getting that far. Five kinds of attacker are in scope:

1. **A repository.** Every floor is a checkout of a GitHub repository, and the office keeps that floor's state in the checkout's own `.agent-office/` folder. Whoever controls the repository controls what's in the checkout, including files and symlinks in `.agent-office/`. Opening a floor, or a pull request from a fork, must not let them write files elsewhere on the machine, start agents with their prompts, or run their code.
2. **Another website** open in the browser of someone who is signed in. It can make that browser send requests to the office (cross-site requests, login CSRF), or point a name of its own at the office's address (DNS rebinding) and talk to it as if it were the office's own page.
3. **A link someone pastes** into the office: the team webhook, or a web page for a terminal's tab. The office posts to the webhook from its own machine, which can usually reach things nobody outside can: its own ports, the LAN, a cloud's metadata service.
4. **A stolen cookie**, from a shared computer or a browser someone forgot to sign out of.
5. **A prompt-injected agent.** A worker reads issues, pull requests and files written by others. Text there can talk it into running commands, so what it can reach (the office's environment, other people's PRs) is kept small.

Out of scope: anyone who is signed in. They can already open a shell at a desk. Per-person accounts keep work attributed and Claude plans separate, but every worker runs as the same OS user, so they don't keep teammates' secrets from each other (see [How it works](how-it-works.md#security-notes)).

## Files the repository controls

All of the office's state files go through `src/server/safefs.ts`:

- **Tracked files are ignored.** A state file that git tracks (`git ls-files .agent-office`) came with the repository, not from an office, so it is never read. Files are matched by device and inode, not by name: on macOS and Windows a repository can ship `.Agent-Office/config.json` (or, on macOS, a name spelled with a Kelvin sign or the "ff" ligature), which is the same file on disk as `.agent-office/config.json` but not one git lists for that name. The office logs which ones it ignored when the floor opens. This covers the task queue (`queue.json`, which would otherwise hire workers with the repository's prompts as soon as the floor opens), the saved workers (`workers.json`), the meetings, the prompts, the webhook, the accounts, the building's `floors.json` and `cloning.json`, and everything else. An office started in a project refuses to start at all if that project ships `.agent-office/config.json`, which would carry a password and signing secret someone else knows.
- **Symlinks are refused.** A floor won't open when its `.agent-office/` or `.agent-office/worktrees/` is a symlink, and neither will an office started in such a project. A symlinked state file, or a symlinked folder on the way to one, is neither read nor written through.
- **Clean-ups don't follow symlinks.** The office clears out folders of its own as it goes: files dropped into terminals (`drops/`), saved scrollback, whiteboard pictures nothing shows any more, and the folders of revoked accounts. It only lists and deletes in one when every folder on the way from `.agent-office/` is real, so a `drops` symlink to a home folder can't have that home folder emptied.
- **Writes don't follow symlinks.** A state file is written to a new file next to it and renamed into place, which replaces a symlink rather than writing through it. Logs and the chat are appended with `O_NOFOLLOW`.
- **Saved paths are checked.** A meeting or worker read back from saved state must have an id the office could have made (letters, digits, `-` and `_`), a worktree under `.agent-office/worktrees/` on a real branch name (never one that reads as a flag, like `--upload-pack=...`), and files inside its checkout once symlinks are followed. A session id that reads as a flag is dropped, and the custom agent only comes back on an office whose own agent is custom. Before the office copies a meeting's notes or deletes a folder, it checks, with symlinks followed, that both ends are where they should be.
- **Clones.** A clone under way, as `cloning.json` keeps it for the next office, is only picked up when its checkout is `<projects>/<owner>/<name>` of its repository and its log is a file in `.agent-office/clones/`. A symlinked `clones/` folder is never written or deleted through. Pi's extension and every hook script and settings file the office writes for an agent go through the same writes.
- **`agent-office prune`** refuses a symlinked worktrees folder, and even with `--force` only deletes folders that stay inside it once symlinks are followed.

## Adding floors

Opening a floor runs everything above against what its repository ships. Admins can add a floor for any repository the office's GitHub login can see. A member can only add one the office's login can push to (GitHub's `viewerPermission` is `ADMIN`, `MAINTAIN` or `WRITE`), so nobody but an admin opens a stranger's public repository as a floor.

## Pull requests from outside

**Fix comments & merge** and **Fix conflicts & merge** hand a pull request to a worker that checks its branch out, installs it and runs it, with the office's sign-ins. For a pull request from a fork, or one whose author GitHub doesn't confirm can push to the repository (`admin`, `maintain` or `write`), the PR window says why it won't, and the merge box warns about it, instead. The author's permission is asked of GitHub (`repos/<owner>/<repo>/collaborators/<login>/permission`) and kept for ten minutes. When GitHub won't say, the answer is no, and the office asks again the next time the PR is opened. **Review** and **Ask a worker** still work: they only read the pull request with `gh pr view` and `gh pr diff`.

The office enforces this on its side too, not only in the PR window. Any prompt that would have a worker check out a pull request (`gh pr checkout <n>`, or fetching `pull/<n>/head`) is refused for an untrusted PR, wherever it comes from: a desk, the task queue, a prompt typed to a running agent, or a board agent through `office-queue` or `office-workers`. So text in a PR can't talk the PR board's agent into queueing its own checkout. The PR agent's brief says the same, so it explains why and leaves it to a person. A prompt that checks a branch out some other way (plain `git fetch` of a fork's branch) isn't caught: keep that in mind on repositories that take PRs from strangers.

## Other websites

- **Host allowlist.** The office only answers to the names it's reached at: any IP address, `localhost` (and `*.localhost`), this machine's name, `AGENT_OFFICE_PUBLIC_HOST` (the domain, with `deploy/provision.sh --domain`), the Tailscale name, and any names given with `--allowed-host` or `AGENT_OFFICE_ALLOWED_HOSTS` (a leading dot allows every name under it). A request or WebSocket for any other name gets `421 Misdirected Request`, which says how to add the name if it's really yours. Behind `--trust-proxy`, `X-Forwarded-Host` is checked instead of `Host`.
- **WebSocket and file POST Origin.** A socket, a whiteboard picture and a file dropped into a terminal are only taken when its `Origin` names an allowed host, and is the very host and port the request came in on. A rebinding name that matches its own `Host` fails the first check; another server on the same machine (a dev server on another port) fails the second.
- **Sign-in and sign-out.** `POST /api/login`, `/api/join`, `/api/claim`, `/api/link`, `/api/logout` and `/api/password` refuse a request whose `Origin` is another site, or that the browser marks `Sec-Fetch-Site: cross-site`. A script with no `Origin` (curl) still works, since it can't be tricked into sending someone's cookie. Cookies are `HttpOnly` and `SameSite=Lax`, and `Secure` over https.
- **No framing.** Pages say `X-Frame-Options: DENY` and `frame-ancestors 'none'`, and every JSON answer says `X-Frame-Options: DENY` and `nosniff`.
- **Content-Security-Policy.** The office's pages (`/`, `/lite`, `/login`, `/claim`, `/join`) only run scripts from the office itself: no inline scripts and no `eval`, so HTML that slipped into a PR body or a terminal can't run. The policy, with a comment for each exception, is in `src/server/csp.ts`: WebAssembly for the whiteboard's fonts, inline styles, images from https (GitHub's attachments in PR bodies), Excalidraw's CJK font from esm.sh, media only from the office itself and `blob:` (voice), https frames for a terminal's web tabs and whiteboard embeds, and the office's own WebSocket. Nothing can frame the office (`frame-ancestors 'none'`). The pages were checked in a browser under this policy: the 3D office, the 2D view, a worker's terminal, the whiteboard, voice and a terminal's web tab all work with no violation reported.

## Links the office fetches

The only link the office fetches on someone's say-so is the team webhook (the picture proxy went with the wall pictures). It goes through `src/server/netguard.ts`. It resolves the link's name itself, in the connection's own lookup, and refuses the whole name when any address it resolves to is loopback, private (`10/8`, `172.16/12`, `192.168/16`), carrier-grade NAT and Tailscale (`100.64/10`), link-local and cloud metadata (`169.254/16`, `fe80::/10`), unique local (`fc00::/7`, which holds AWS's `fd00:ec2::254`), multicast, documentation or reserved. IPv6 forms that carry an IPv4 address are checked too: IPv4-mapped (`::ffff:a.b.c.d`) and NAT64 (`64:ff9b::/96`) by the address inside them, and IPv4-compatible (`::/96`), IPv4-translated (`::ffff:0:0:0/96`), 6to4 (`2002::/16`) and Teredo (`2001::/32`) are refused outright. Checking the address the connection really goes to means a name that resolves to a public address once and a private one the next time (DNS rebinding) gets nowhere. Redirects are followed one at a time, at most five, and each target is checked again, scheme included.

The webhook is also https only (its path is the secret), is never redirected, and only admins can change it. An http webhook saved before this is dropped when the office starts.

## Terminal web tabs

A web page pinned beside a worker's terminal (**+ Web page**) stays in that browser: the office never fetches it. It must be https (http pages reach the LAN and are mixed content, and the CSP's `frame-src https:` blocks them anyway), have no user name or password in its address, and not be the office's own origin, which would run signed in as you beside the terminal. The frame is sandboxed with `allow-scripts allow-same-origin allow-forms allow-popups`: the page keeps its own origin so a linked chat can sign in, which gives it nothing of the office's, and popups it opens stay sandboxed (no `allow-popups-to-escape-sandbox`). It can't navigate the office's tab or reach the camera, microphone or clipboard.

## What workers get

- **An environment allowlist.** Workers don't inherit the office's whole environment. `src/server/worker-env.ts` passes what a terminal, a login shell and the usual toolchains need (`PATH`, `HOME`, locale, proxies, version managers), the variables the agents and git sign in with (`ANTHROPIC_*`, `CLAUDE_CODE_*`, `OPENAI_API_KEY`, `GH_TOKEN`, and the Codex, OpenCode, Grok, Muse, Pi and dsh settings), and AWS or Google credentials only when Claude Code is set to use Bedrock or Vertex. Anything else the office was started with, a database URL or a cloud key exported for something else, stays with it. `--worker-env NAME,PREFIX_*` (or `AGENT_OFFICE_WORKER_ENV`) lets more through, and `--inherit-env` (or `AGENT_OFFICE_INHERIT_ENV=1`) goes back to passing everything.
- **No sandbox.** Every worker runs as the office's OS user, on the machine, with the floor's checkout. The Docker sandbox from the `launch/docker-sandbox` branch isn't part of this version. For isolation, run the office itself in a container or VM of its own (see [self-hosting](self-hosting.md)).

## Admin-only actions

Changing the team webhook, upgrading the office, editing the office's prompts, the worker limit, taking a floor off and managing accounts need an admin. The office checks each on its side; Settings and the upgrade panel say so to members.

## Sessions

- A sign-in lasts 7 days (it was 14). `AGENT_OFFICE_SESSION_DAYS` sets it, from 1 to 90.
- **Signing out ends the session on the office's side too**, so a copy of the cookie stops working. With the shared password, that one sign-in is revoked by its id, and the list survives a restart (`.agent-office/revoked-sessions.json`). With an account, every sign-in of that account ends: each account has a session generation, and signing out moves it on. So does a new password (Settings, **You**, **Password**, or `POST /api/password` with `current` and `password`, which answers with a fresh cookie for the browser that asked), and `agent-office accounts signout <name>`. Open WebSockets of a session that ended are closed within seconds.
- Changing the shared password still signs out everyone who used it, revoking an account still signs it out at once, and switching the shared password off still signs out everyone who came in with it.

## Reporting a problem

Found a way around any of this? Please report it privately to the maintainers rather than in a public issue.
