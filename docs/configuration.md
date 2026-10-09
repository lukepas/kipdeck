# Configuration

Kipdeck gives you full control and clarity over every AI coding agent you run, in one place. This page lists its settings: flags, environment variables and where it keeps its files.

Back to the [README](../README.md).

## Where the office keeps things

The office keeps its data in `~/agent-office` (`--home` or `AGENT_OFFICE_HOME` to move it) and clones projects next to it, as `~/agent-office/<owner>/<repo>`. To clone them somewhere else, like `~/Workspace`, an admin picks the **Workspace folder** in ⚙️ Settings → **🏢 Building** (or start with `--projects` or `AGENT_OFFICE_PROJECTS`). Floors you already have stay where they are, and a checkout of the same repository that's already in the new folder is used as it is. The list of floors is `~/agent-office/.agent-office/floors.json`, and each account's own Claude and GitHub sign-ins are in `~/agent-office/.agent-office/homes/<account>/` (revoking the account deletes them). With `--x402` or `--attest` the office also keeps its paid task ledger (`x402.json`) and its proof-of-merge outbox (`attestations.json`) in `~/agent-office/.agent-office/`. Each floor keeps its workers, queue, whiteboard, mission (`mission.json`, with the reminders someone snoozed or dismissed), timeline (`timeline.jsonl`, the last 2000 events) and worktrees in its own checkout's `.agent-office/`. Files an older office kept for features that are gone (`map.json`, `maps/`, `theme.json`, `arcade.json`, and per floor `decor.json`, `dog.json`, `jail.json`, `jukebox.json`) are left where they are and no longer read.

Started (with no `[dir]`) inside a git repository, a new office makes that repository its first project, where it is: no clone, and its agents' state in its own `.agent-office/` (kept out of git through `.git/info/exclude`). Started in another repository later, the setup card offers **Use <folder>**. The office also keeps, in its data folder, `local.json` (where it runs and its local key, for `kipdeck open` and `kipdeck attach`; mode 0600, gone when it stops) and `telemetry.json` (the usage-numbers switch, off as it ships; see [Security](security.md#anonymous-usage-numbers)).

Already have a checkout? Pick its repository anyway: a checkout of it that's already where the workspace folder would clone it is used as it is. You can still start the office in a project, `agent-office ~/code/my-project`: that project becomes a floor, and the office keeps its data in `~/code/my-project/.agent-office` as it did before there were floors. An office that already ran in a project carries on in it when you start `agent-office` there again. An admin can take that project off the building in the Floors window like any other floor.

## Command line

```
kipdeck [dir] [options]      (npx kipdeck, or agent-office: the same command)

      --home <dir>        Where the office keeps its data without a [dir] (default ~/agent-office)
      --projects <dir>    Where new floors are cloned, as <dir>/<owner>/<repo> (default ~/agent-office;
                          also settable from ⚙️ Settings)
  -p, --port <n>          Port (env PORT): that port or nothing. Without it, 4600 or the next free one
  -H, --host <addr>       Bind address (default 127.0.0.1; 0.0.0.0 lets your network in)
      --password <pw>     Office password (env AGENT_OFFICE_PASSWORD). Without one, on 127.0.0.1 there is
                          nothing to type: the terminal's sign-in link, or `kipdeck open`
      --no-open           Don't open the office in your browser when it starts
      --agent <cmd>       Default agent command (default "claude")
      --agent-args <str>  Extra args for the configured agent, e.g. "--model opus"
      --dsh-profile <n>   DeepSeek Harness profile over ACP (default "acp")
      --tls-cert <file>   Serve HTTPS with this cert…
      --tls-key <file>    …and key
      --self-signed       Serve HTTPS with a generated self-signed cert
      --trust-proxy       Trust X-Forwarded-* (behind Caddy/nginx)
      --allowed-host <n>  Another name the office is reached at (repeatable, env AGENT_OFFICE_ALLOWED_HOSTS;
                          ".example.com" allows every name under it). IPs, localhost, this machine's name,
                          the public host and the tailnet name are always allowed
      --worker-env <names> More of the office's environment variables for workers, e.g. "AWS_PROFILE,SENTRY_*"
                          (repeatable, env AGENT_OFFICE_WORKER_ENV); workers get an allowlist by default
      --inherit-env       Pass workers the office's whole environment (env AGENT_OFFICE_INHERIT_ENV=1)
      --turn <url>        Add a TURN server for voice, e.g. turn:user:pass@host:3478
                          (env AGENT_OFFICE_TURN, several separated by spaces)
      --budget <usd>      Daily tracked Claude Code budget (OpenCode/Codex/Grok/Muse/DSH excluded)
      --budget-pause      ...and nobody can hire a new worker until the next day
      --max-workers <n>   Run at most n workers at once, across every floor (env AGENT_OFFICE_MAX_WORKERS)
      --webhook <url>     Post to this Slack / Discord webhook when a worker needs input, finishes or gets stuck
      --x402              Take paid tasks over x402, testnets only (see docs/x402.md), with
                          --x402-pay-to <0x>, --x402-repos <owner/name,...> and optionally --x402-price,
                          --x402-pay-to-solana, --x402-facilitator, --x402-asset (env AGENT_OFFICE_X402_*)
      --attest            Attest every office PR a person merges on Base Sepolia (see docs/proof-of-merge.md),
                          with optionally --attest-key-file, --attest-rpc, --attest-schema, --attest-mode,
                          --attest-contract, --attest-eas (env AGENT_OFFICE_ATTEST_*)
      --telemetry         Share anonymous usage numbers (env KIPDECK_TELEMETRY=1); off by default,
                          and KIPDECK_TELEMETRY_URL says where to (see docs/security.md)
      --no-telemetry      Never share them (also DO_NOT_TRACK=1 or KIPDECK_TELEMETRY=0)
      --demo              Five scripted agents on a throwaway repository in a temporary folder,
                          deleted when it stops: no agent CLI, sign-in or model (env KIPDECK_DEMO=1;
                          KIPDECK_DEMO_PACE=4 plays it four times faster). Not with a [dir]
      --read-only         With --demo only: the hosted demo. Whoever opens it is signed in to watch,
                          only GET requests and looking are taken, and a scripted reviewer answers,
                          merges and starts over (env KIPDECK_DEMO=read-only). See docs/demo.md
      --labs <names>      Hold labs on, comma separated: bridge, ops, meetings, voice, ambience,
                          proof, or all (env AGENT_OFFICE_LABS). All are off by default and admins
                          switch them from Labs in the office (see docs/labs.md). A chain flag
                          (--x402, --attest, --reputation) holds proof on
      --reputation        ERC-8004 identities and merge feedback for the office's agents, testnets
                          only (see docs/reputation.md); needs --attest. Optionally
                          --reputation-registrar-key-file, --reputation-card-base,
                          --reputation-identity, --reputation-registry, --reputation-index
                          (env AGENT_OFFICE_REPUTATION_*)

kipdeck open [--print] [--home <dir>]

  Opens the office running on this computer in your browser, signed in, with a new
  sign-in link that works once (--print prints it). For a lost tab or an expired
  sign-in: nobody on their own computer needs a password.

kipdeck attach [--agent claude|codex|cursor] [--session <id>] [--list] [--yes] [--home <dir>]

  Moves an agent you started in a terminal into the inbox. Quit it there first, then
  run this in the same folder: it finds that folder's newest Claude Code or Codex
  session (~/.claude/projects, ~/.codex/sessions) and the running office carries it
  on as one of its agents, in that folder (added as a project if it isn't one).
  Cursor needs --session (cursor-agent ls lists its chats).

kipdeck setup [--projects <dir>] [--project <owner/repo>]... [--home <dir>]

  Nothing asks this when the office starts any more (the setup card does): a
  walkthrough of the workspace folder, GitHub sign-in and repositories to clone as
  projects, on request. With --projects / --project it asks nothing, for scripts.
  Run it while the office is stopped.

agent-office prune [dir] [-n|--dry-run] [-f|--force]

  Removes leftover worker worktrees under .agent-office/worktrees/ and their
  office/* branches, in one floor's checkout (dir). Anything with uncommitted changes or unpushed commits is
  kept unless --force is given. A worker across several projects has worktrees of them in its
  own floor's workspace: prune each project to clear those out.

agent-office accounts [list | invite [name] [--admin] | revoke <name> | signout <name> | role <name> admin|member | password on|off] [-d <dir>]

  Invite, list and revoke people's own accounts, sign one out of every browser,
  and switch the shared password off or on. Works while the office runs.

agent-office tunnel [office@address | url] [--port <n>] [--office-port <n>] [--name <name>] [--password <pw>] [--no-open] [--insecure] [-- <ssh options>]

  On your own computer, for an office that runs somewhere else: every web server
  a worker starts there opens on the same port here, by itself, and closes when
  the worker stops it. Given an SSH address it opens the tunnel to the office too.
  See docs/tunnel.md.
```

Kipdeck was called Mergeline before. Its `MERGELINE_*` environment variables (`MERGELINE_DEMO`, `MERGELINE_DEMO_PACE`, `MERGELINE_TELEMETRY`, `MERGELINE_TELEMETRY_URL`) still work when the `KIPDECK_*` one is not set, and `MERGELINE_TELEMETRY=0` still keeps telemetry off. An office started from an older install and a newer `kipdeck open` still understand each other. The installers read their old `MERGELINE_*` settings too; an install made before the rename stays in `~/.local/share/mergeline` with its `mergeline` command until you remove it.

Sign-ins last 7 days; `AGENT_OFFICE_SESSION_DAYS` sets it, from 1 to 90. What each of these protects against is in [Security](security.md).
