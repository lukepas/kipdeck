# Upstream partnership

Agent Office is webdevcody's project, MIT-licensed, and he says in the README that it is built for his own workflow and changes fast. The fork only works long-term if it stays close to upstream, so the first contact gives something useful and asks for nothing. The collaboration proposal comes second and is easy to decline.

Two facts shape how to approach it:

- The repository's `CLAUDE.md` says PRs from anyone other than webdevcody are merged only when he links them, after a security review. So open an issue first, let him decide whether he wants the change, and only then open the PR he links.
- `docs/how-it-works.md` (Security notes) already states the threat model: anyone who can sign in can run commands as the office user. Some of the fixes below are defense in depth under that model, not vulnerabilities. Say so plainly; overselling a finding to a maintainer who wrote the threat model burns trust.

Send security details privately first if the repository has a security policy or advisory channel. None of the items below lets someone who is not signed in do anything, so a public issue is acceptable if there is no private channel, but ask first anyway.

## First message

Where: a GitHub issue titled "Offer: a few security hardening PRs", or a DM if he prefers. Keep it short.

Hi Cody,

I have been running a fork of Agent Office for a team setup and made a handful of hardening changes along the way. I would like to offer them back, one small PR each, and only the ones you want:

1. Team notifications webhook: only admins can set or change it. Right now any signed-in member can point it at their own URL, while the other office-wide settings (prompts, worker limit, default worker) are already admin-only.
2. Security headers on the app shell: a Content-Security-Policy, HSTS when the request is HTTPS, and a Permissions-Policy that allows only the microphone and screen capture the office uses.
3. Sign-in throttling per account name as well as per IP, so guessing one account from many addresses hits a limit.
4. Webhook URLs must be https (loopback excepted), since the secret is in the path.
5. An opt-in flag that stops the picture fetcher and the webhook from reaching private and link-local addresses, for deployments where workers run in a sandbox and so do not already have the machine's network reach. Off by default, because your threat model notes that a shell worker can already curl anything.

Each one has tests and a line in docs/how-it-works.md. None is urgent: nothing lets a signed-out visitor in. Happy to adjust them to your style, or drop any you do not want. If you would rather I open them as issues first so you can link the ones you want, I will do that.

Thanks for building this and for putting it under MIT.

[Your name]
[GitHub handle]

## Second message: the collaboration proposal

Send only after at least one PR has been merged or clearly welcomed, and after your employer clearance (see employer-clearance-request.md) says you may do this.

Hi Cody,

Thanks for merging [PR]. A separate question, and no is a fine answer.

I am based in the EU (Lithuania) and I am seeing interest from companies here in running teams of coding agents, but they need three things the open-source office does not try to provide: hosting in an EU region with a data processing agreement, someone to call when it breaks, and help setting up the workflow (queue, review rules, cost limits). I would like to offer that as a paid service on top of Agent Office, and I would rather do it with you than beside you.

Some shapes this could take, from lightest to heaviest:

- I build and support EU hosting and training under my own name, credit the project clearly, send every general fix upstream, and do not use the Agent Office name or logo for the service.
- The same, plus a share of hosting or support revenue to you, or a fixed monthly sponsorship through GitHub Sponsors, in return for nothing more than an occasional heads-up before breaking changes.
- A listed "EU hosting and support partner" link in the README, if you are comfortable with that, and joint write-ups of what works.

What I would not do: fork the product direction, relicense anything, or use your name in marketing without asking.

If any of this is interesting, a 30-minute call would be enough to see whether it fits. If not, I will keep sending fixes either way.

[Your name]

## PR description drafts

One PR per fix, each branched from freshly fetched `origin/main`. Reconcile file paths and line numbers with the final diff on the `launch/security-hardening` branch before sending; the references below are to `main` at commit 665aeec. Drop any item that branch did not implement.

### PR 1: Only admins can change the team webhook

Title: Only admins can set or remove the team notifications webhook

The `notify.webhook` message (`src/server/server.ts`, the `case 'notify.webhook'` handler near line 2054) lets any signed-in person set or clear the office's Slack or Discord webhook. The other office-wide settings, such as prompts, the worker limit and the default worker, already check `meOf(c.accountId).admin`. This adds the same check.

Why it matters: a member can redirect every "needs input" and "done" notification, which include a line of each worker's output, to a URL they control, or silently switch notifications off for the team. They can already run commands as the office user, so this is not a new capability, but it is an easy-to-miss one that bypasses the admin role the office already has.

Changes:
- Non-admins get "Only admins can change team notifications" and the setting is left alone.
- The Settings panel hides the field for non-admins, like the other admin-only settings. `notify.test` stays open to everyone.
- `--webhook` on the command line is unchanged.

Tests: a member's `notify.webhook` is refused and leaves the saved webhook in place; an admin's goes through; the shared-password guest (who counts as admin) still works.

Docs: one line in docs/how-it-works.md, Security notes.

### PR 2: Security headers on the app shell

Title: Send CSP, HSTS and Permissions-Policy with the office page

`serveFile` (`src/server/server.ts` near line 782) already sends `nosniff`, `X-Frame-Options: DENY` and `no-referrer`. The page itself has no Content-Security-Policy, so any future HTML injection bug would run with the session's full reach, and there is no HSTS for offices served over HTTPS.

Changes:
- `Content-Security-Policy` on `index.html`: `default-src 'self'`, `connect-src 'self'` (the WebSocket is same-origin), `img-src 'self' data: blob:`, `media-src 'self' blob:`, `worker-src 'self' blob:`, `style-src 'self' 'unsafe-inline'` for the inline styles the client sets, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`. If the WebAssembly or a library needs `'wasm-unsafe-eval'`, it is added explicitly and noted in the code.
- `Strict-Transport-Security: max-age=15552000` only when `isSecure(req, cfg)` is true, so plain-HTTP localhost use is not affected.
- `Permissions-Policy: camera=(), geolocation=(), microphone=(self), display-capture=(self)`.
- First shipped as `Content-Security-Policy-Report-Only` for one release if you prefer, then enforced.

Tests: the headers are present on `/`, HSTS is absent over plain HTTP and present with `--tls` or a trusted `X-Forwarded-Proto: https`; a headless-browser load of the built client shows no CSP violations in the console.

Docs: Security notes in docs/how-it-works.md.

### PR 3: Throttle sign-in guesses per account name

Title: Limit password guesses per account name, not only per IP

`Auth.allowAttempt` (`src/server/auth.ts` near line 51) allows 10 attempts per 5 minutes per client IP. Someone with many addresses (an IPv6 /64 is enough) can keep guessing one account's password at that rate from each address.

Changes:
- A second counter keyed by the lower-cased account name: 20 failed attempts per 15 minutes, then 429 for that name only, whatever the IP. The shared-password path keeps the IP limit and adds a global limit of the same size, since it is one secret.
- A successful sign-in clears that name's counter.
- The counter map is bounded the same way the IP map is, so it cannot be used to grow memory.
- IPv6 clients are counted by /64 for the IP limit.

Trade-off, stated in the docs: an attacker can lock one named account out of password sign-in for 15 minutes. One-time sign-in links and existing sessions still work.

Tests: 21st guess on one name from rotating IPs is refused; a correct password after the window works; other names are unaffected; IPv6 addresses in one /64 share a bucket.

### PR 4: Webhook URLs must use https

Title: Require https for the team webhook (loopback excepted)

`Webhook.set` (`src/server/webhook.ts` near line 74) accepts `http:` URLs. Slack and Discord webhook URLs carry their secret in the path, so a plain-HTTP URL would send it, and every notification, in the clear.

Changes:
- `http:` is refused with "Use the https link Slack or Discord gave you" unless the host is `localhost`, `127.0.0.1` or `::1`, for people testing with a local receiver.
- A saved `http:` webhook from an older version keeps working but shows a warning in Settings.

Tests: https accepted, http refused, http to loopback accepted, the restored legacy value is kept.

### PR 5: Opt-in private-network guard for server-side fetches

Title: --block-private-fetch: keep the picture fetcher and webhook off private addresses

`/api/image` (`src/server/server.ts` near line 953, `src/server/decor.ts`) fetches any http(s) URL a signed-in person gives it, following redirects, and the webhook posts to any URL. docs/how-it-works.md explains why that is fine by default: a shell worker can already reach the same addresses. That stops being true when workers run in a container or VM without the host's network. There, the office process is the only thing with that reach, and the cloud metadata address (`169.254.169.254`) is the obvious target.

Changes:
- New `--block-private-fetch` flag (and config key), off by default.
- When on, the picture fetcher and the webhook resolve the host first and refuse loopback, RFC 1918, link-local, CGNAT (100.64.0.0/10), unique-local IPv6 and the metadata addresses. Redirects are followed manually, up to 5, and each hop is checked. The connection is made to the address that was checked, so DNS rebinding between check and connect does not work.
- Error text says which rule refused it.

Tests: each blocked range, a redirect from a public host to a private one, an IPv4-mapped IPv6 address, and a normal public image all behave as expected, using a local HTTP server and a stub resolver.

Docs: the flag in docs/configuration.md and a sentence in Security notes about when to turn it on.
