# Run it on a server for your team

Kipdeck gives you full control and clarity over every AI coding agent you run, in one place. This page puts it on a server, so the whole team works from the same place.

One script each for [AWS](#deploy-to-aws-ec2), [Azure](#deploy-to-azure), [Railway](#deploy-to-railway), [Fly.io](#deploy-to-flyio) and [Dokploy](#deploy-to-dokploy), the one-line setup for [any Ubuntu or Debian server](#deploy-to-any-ubuntu-or-debian-server), or by hand behind Caddy or nginx. Back to the [README](../README.md).

On your own computer you don't need any of this: `kipdeck` in your repository (`npx kipdeck` once it is on npm; until then from a linked clone, see the README's [From source](../README.md#from-source)). A team office is reached through an SSH tunnel or Tailscale, and everyone signs in with a password or their own account; the terminal's sign-in links only work on the machine the office runs on.

## One line on your own server

Run this on any Ubuntu or Debian server, as root or as a user with sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/deploy/provision.sh | bash
```

Or run it from your computer without logging in first: `ssh root@203.0.113.7 'curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/deploy/provision.sh | bash'`.

It takes a few minutes the first time:

1. Installs Node.js 22, git, the GitHub CLI and **Claude Code**. Run as root, it creates an `agentoffice` user and runs the office as that user, so workers never run as root.
2. Clones Kipdeck into `/opt/agent-office` (the folder keeps its name from before the rename) and runs it under systemd. `Restart=always` brings it back after a crash or a reboot, and `KillMode=process` keeps workers running through a restart. It listens on `127.0.0.1:4600` only. The office keeps its data in `~/agent-office` and clones projects into `~/workspace/<owner>/<repo>`.
3. Sets up **👥 Invite teammates**. Teammates' SSH keys log in as a separate `office` user that can only forward to the office port: no shell, no other ports.
4. Offers to sign the GitHub CLI in, if it's running in a terminal.
5. Prints how to get in:

```
  On your computer, open a tunnel and leave it running:

    ssh -N -L 4600:localhost:4600 root@203.0.113.7

  then open http://localhost:4600/claim?t=…
  It shows the office password once: write it down.
```

Everything goes through SSH, so there are no certificates to manage, and `localhost` counts as a secure origin, so voice and screen sharing work. Claude signs in from the office: the first worker asks you to type `/login` in its terminal. If GitHub isn't signed in yet, run `gh auth login` from a shell at any desk (**B**). Do both while you're in on the office password: those are the machine's own sign-ins. Teammates you give [accounts](../README.md#add-users) sign in to their own Claude and GitHub in **☰ → 🔐 Your sign-ins**, and their workers run on their own plan. To update, run the same line again, or use **⬆️ Upgrade the office** in the **☰** menu. Options go after `bash -s --`: `--project owner/repo` clones a first floor, and `--help` lists the rest.

**On your own domain.** Point a DNS record at the server, open ports 80 and 443, and add `--domain`:

```bash
curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/deploy/provision.sh | bash -s -- --domain office.example.com
```

It installs [Caddy](https://caddyserver.com), which gets a certificate from Let's Encrypt by itself and serves the office on https://office.example.com. The claim link is then `https://office.example.com/claim?t=…`. Give teammates an invite link each from **🔑 Accounts**.

**On your Tailscale network.** No domain, and no ports to open: add `--tailscale`, and the server joins your tailnet and serves the office on `https://agent-office.<your-tailnet>.ts.net` with [Tailscale Serve](https://tailscale.com/kb/1312/serve), which brings its own certificate:

```bash
curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/deploy/provision.sh | bash -s -- --tailscale
```

It prints a link to add the machine to your tailnet (or pass `--tailscale-auth-key tskey-auth-…`), and the first time, one that turns on MagicDNS and HTTPS Certificates for the tailnet. It waits for each. `--tailscale-hostname` names the machine (`agent-office` by default). Then anyone on your tailnet opens the link, and workers' web servers get links of their own, `https://agent-office.<your-tailnet>.ts.net:<port>`, still behind the office sign-in. For someone outside your tailnet, share the machine with them from Tailscale's Machines page. Re-running the script keeps it on the tailnet. Turn off key expiry for the machine on that page, or it drops off after 180 days. The details, and what else the tailnet can reach on the machine, are in the [AWS reference](aws.md#tailscale), since `deploy/aws.sh up --tailscale` does the same thing.

**Setting it up by hand** (another distribution, or your own proxy): run `agent-office`, which listens on `127.0.0.1` only, and reach it through `ssh -L 4600:localhost:4600 you@server`. Or put it behind HTTPS on a domain, which voice and screen sharing need, with Caddy:

```caddy
# /etc/caddy/Caddyfile
office.example.com {
    reverse_proxy 127.0.0.1:4600
}
```

```bash
agent-office setup --projects ~/workspace --project owner/repo   # once; or pick projects in the office
agent-office --host 127.0.0.1 --trust-proxy --password "$(openssl rand -base64 18)"
```

Caddy proxies WebSockets out of the box. With nginx, forward the Host and Upgrade headers:

```nginx
location / {
    proxy_pass http://127.0.0.1:4600;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1d;
}
```

To keep Kipdeck running, use a systemd unit. It keeps the name `agent-office.service` from before the rename, so the deploy scripts and servers set up earlier still find it:

```ini
# /etc/systemd/system/agent-office.service
[Unit]
Description=Kipdeck
After=network.target

[Service]
User=dev
WorkingDirectory=/home/dev
# generate with: openssl rand -base64 24
Environment=AGENT_OFFICE_PASSWORD=<a long random password>
ExecStart=/usr/bin/env agent-office --host 127.0.0.1 --trust-proxy
Restart=on-failure
# Restarting the office leaves the workers' terminals running for the next one to pick up.
KillMode=process

[Install]
WantedBy=multi-user.target
```

If you don't have a domain, `--self-signed` serves HTTPS directly. Browsers will warn once per person.

**Voice across strict NATs.** Peers connect directly using public STUN. If some teammates can't hear each other (common on corporate networks), run a TURN server such as coturn and pass `--turn turn:user:pass@turn.example.com:3478`, or set `AGENT_OFFICE_TURN` (several separated by spaces), which is how an office in a container (Railway, Fly.io, Dokploy) gets one. When a call can't connect at all, the office says so in a toast instead of leaving people talking to silence. The TURN username and password only go to browsers that have signed in (with the welcome on the office's WebSocket), are never written to the office's logs, and are never passed on to workers (every `AGENT_OFFICE_*` variable is kept out of a worker's environment).

## Deploy to AWS (EC2)

One script, using only the AWS CLI. You need the **AWS CLI signed in** (`aws configure` or `aws sso login`), `ssh`, `curl` and a clone of this repo:

```bash
git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck
deploy/aws.sh up --project your-org/your-repo --claude-token "$(claude setup-token)"
```

In about two minutes, `up`:

1. Launches a **t3.xlarge** (4 vCPU, 16 GiB) Ubuntu 24.04 instance with a 50 GiB disk and a fixed Elastic IP.
2. Creates a security group that opens **only SSH, only to your IP**. The office listens on `127.0.0.1:4600` on the machine and is never on the internet. Everyone reaches it through an SSH tunnel, so there are no certificates to manage, and voice and screen sharing work.
3. Runs [`deploy/provision.sh`](../deploy/provision.sh) on it: Node 22, git, the GitHub CLI, Claude Code and the office, under systemd, so it comes back after a crash or reboot and workers keep running through a restart.
4. Opens a tunnel and your browser at http://localhost:4600. **The first page shows the office password once. Write it down.**

`--project` is optional: it clones that repo as the first floor. Leave it out and pick projects in the elevator.

**Signing in the agents.** `--claude-token` uses your Claude subscription; `--anthropic-api-key <key>` uses an API key instead. Leave both out and run `/login` in the first worker's terminal. Codex and OpenCode aren't installed by the script: `deploy/aws.sh ssh` and install them yourself.

**GitHub.** Your local `gh auth token` is copied to the machine so the office can clone private repos, show the boards and push PRs. Anyone in the office can use it, so pass `--github-token <fine-grained token>` or `--no-github-token` to limit that.

**On Tailscale, no tunnels.** If your team uses [Tailscale](https://tailscale.com), add `--tailscale`:

```bash
deploy/aws.sh up --tailscale --project your-org/your-repo --claude-token "$(claude setup-token)"
```

The machine joins your tailnet, and Tailscale Serve puts the office on `https://agent-office.<your-tailnet>.ts.net` with a real certificate. Anyone on your tailnet just opens that link: no terminal to keep open, no SSH keys, no IPs to allow, and voice and screen sharing work. `up` opens Tailscale's page to add the machine (or pass `--tailscale-auth-key tskey-auth-...`) and, the first time, the page that turns on HTTPS for your tailnet. SSH stays open to your IP only, for `deploy/aws.sh` itself. More in [docs/aws.md](aws.md#tailscale).

Day to day:

```bash
deploy/aws.sh open                # tunnel + open the office (Ctrl-C closes the tunnel)
deploy/aws.sh status              # machine, address, is the office up, who's invited
deploy/aws.sh logs                # follow the office's logs
deploy/aws.sh ssh                 # a shell on the machine
deploy/aws.sh update              # install the latest Kipdeck and restart
deploy/aws.sh resize t3.2xlarge   # bigger or smaller machine, same address
deploy/aws.sh pause               # stop the machine; only the disk and IP are billed
deploy/aws.sh resume              # start it again and open it
deploy/aws.sh destroy             # delete everything it created (asks first)
```

You can also upgrade from inside the office: **Update Kipdeck** (Ctrl+K). Other flags (`--region`, `--instance-type`, `--disk`, `--name` for several offices) are in `deploy/aws.sh help`, and the details are in [docs/aws.md](aws.md).

**The workers' dev servers, on your computer.** The office runs on the server, so a worker's `npm run dev` listens there. Run this on your own computer and leave it running, and every web server a worker starts opens on the same port on yours, by itself (`http://localhost:5173` is the worker's), and closes when the worker stops it:

```bash
agent-office tunnel                       # while `deploy/aws.sh open` (or a teammate's ssh command) is running
agent-office tunnel office@203.0.113.7    # or by itself: it opens the tunnel to the office too
```

It works with every way of running the office on a server, and needs the `agent-office` command on your computer: [docs/tunnel.md](tunnel.md).

## Deploy to Azure

The same thing on an Azure VM, using only the Azure CLI. You need the **Azure CLI signed in** (`az login`), `ssh`, `curl` and a clone of this repo:

```bash
git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck
deploy/azure.sh up --project your-org/your-repo --claude-token "$(claude setup-token)"
```

`up` puts everything in a resource group of its own, `agent-office`, and launches a **Standard_D4as_v5** VM (4 vCPU and 16 GiB, like the t3.xlarge on AWS, at about the same price) with Ubuntu 24.04, a 64 GiB Premium SSD and a static IP. Its firewall opens **only SSH, only to your IP**. Then it runs the same [`deploy/provision.sh`](../deploy/provision.sh) and opens the office through an SSH tunnel at http://localhost:4600. **The first page shows the office password once. Write it down.**

Every command from the AWS script works the same, with `deploy/azure.sh` in its place: `open`, `status`, `logs`, `ssh`, `update`, `invite`, `allow`, `service`, `resize Standard_D8as_v5`, `pause` (deallocates the VM, so only the disk and IP are billed), `resume` and `destroy` (deletes the resource group). One more, `connect`, lets a second computer manage the office. `--location` picks the region (default: your `az` default location, else `eastus`), `--subscription` the subscription and `--size` the VM size. The details are in [docs/azure.md](azure.md).

## Deploy to Railway

No machine to look after: one script, using the Railway CLI. You need the **Railway CLI 5 or newer, logged in** (`railway login`), `ssh`, `curl`, Node.js and a clone of this repo:

```bash
git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck
deploy/railway.sh up --claude-token "$(claude setup-token)"
```

In about five minutes, `up`:

1. Creates a Railway project with one service, built from this checkout with [`deploy/container/Dockerfile`](../deploy/container/Dockerfile): Node 22, git, the GitHub CLI and sshd, with Claude Code installed on first start.
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

The details, and what's on the volume, are in [docs/railway.md](railway.md).

## Deploy to Fly.io

The same container on a [Fly.io](https://fly.io) machine, using flyctl. You need **flyctl logged in** (`fly auth login`), `ssh`, `curl`, Node.js and a clone of this repo:

```bash
git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck
deploy/fly.sh up --claude-token "$(claude setup-token)"
```

In a few minutes, `up`:

1. Creates a Fly app with one machine, a `shared-cpu-4x` with 8 GB in the region nearest you, built from this checkout with the same [`deploy/container/Dockerfile`](../deploy/container/Dockerfile) as on Railway.
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

`--region`, `--org`, `--vm-size`, `--memory`, `--disk` and `--name` (for several offices) are in `deploy/fly.sh help`. The details, and what's on the volume, are in [docs/fly.md](fly.md).

The public, read-only demo (`kipdeck --demo --read-only`, scripted agents, no volume) is a different, smaller app: see [A public read-only demo](fly.md#a-public-read-only-demo).

## Deploy to Dokploy

Already run a [Dokploy](https://dokploy.com) server? One script puts the office on it, through Dokploy's API. You need an **API key** (Dokploy: **Settings → Profile → API/CLI Keys**, with rate limiting off), `ssh`, `curl`, `git`, Node.js and a clone of this repo:

```bash
git clone https://github.com/zbagdzevicius/kipdeck && cd kipdeck
export DOKPLOY_API_KEY=<your key>
deploy/dokploy.sh up --url https://dokploy.example.com --claude-token "$(claude setup-token)"
```

In about five minutes, `up`:

1. Creates a Dokploy project with one application, and uploads this checkout for Dokploy to build with [`deploy/container/Dockerfile`](../deploy/container/Dockerfile), the same image as on Railway.
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

The details, and what's on the volume, are in [docs/dokploy.md](dokploy.md).

## Deploy to any Ubuntu or Debian server

Another cloud, or your own machine? Run one line on the server, as root or as a user with sudo:

```bash
curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/deploy/provision.sh | bash
```

It installs Node 22, git, the GitHub CLI, Claude Code and the office as a systemd service. Run as root, it creates an `agentoffice` user to run the office, so workers never run as root. The office listens on `127.0.0.1:4600` only, and the script ends by printing the SSH tunnel command and a link that shows the office password once. Run the same line again to update.

For HTTPS on your own domain, point a DNS record at the server and add `bash -s -- --domain office.example.com`: it sets up Caddy, which gets the certificate by itself. To put it on your Tailscale network instead, add `bash -s -- --tailscale`. Setting it up by hand behind Caddy or nginx is [at the top of this page](#one-line-on-your-own-server).
