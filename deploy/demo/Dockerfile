# The hosted demo (docs/demo.md, docs/fly.md#a-public-read-only-demo): `kipdeck --demo --read-only`
# on port 8080, for anyone with the address. Visitors are signed in to watch; nothing they send changes
# anything, and a scripted reviewer answers and merges. There is no agent CLI, no sign-in and no model
# in the image: the agents are the demo's own scripted stand-ins, on a throwaway repository. Nothing
# needs to outlive a restart, so there is no volume.
#
# Build it from the repository root: docker build -f deploy/demo/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /opt/kipdeck
COPY package.json package-lock.json ./
# No install scripts: `prepare` would build before the sources are here.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
# git for the throwaway repository and the merges, tini to reap the stand-ins' processes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git tini ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /usr/sbin/nologin demo
COPY --from=build /opt/kipdeck /opt/kipdeck
USER demo
WORKDIR /home/demo
ENV HOME=/home/demo AGENT_OFFICE_NO_OPEN=1 KIPDECK_TELEMETRY=0
EXPOSE 8080
# --trust-proxy: Fly's proxy ends TLS, so the session cookie is marked Secure from its X-Forwarded-Proto.
# The names it answers to come from AGENT_OFFICE_ALLOWED_HOSTS (fly.toml).
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/kipdeck/bin/agent-office.js", "--demo", "--read-only", "--home", "/home/demo/office", "--host", "0.0.0.0", "--port", "8080", "--trust-proxy", "--no-open"]
