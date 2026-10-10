#!/usr/bin/env bash
# Install Kipdeck (the inbox for your AI coding agents) from npm and start it, for anyone who would
# rather have a `kipdeck` command than type `npx kipdeck` each time:
#
#   curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/install.sh | bash
#
# Anything after `bash -s --` goes to Kipdeck, e.g. a port:
#
#   curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/install.sh | bash -s -- --port 4700
#
# Kipdeck is not on npm yet. Until it is, the registry install fails and this prints the steps that
# run it from source instead (or pass KIPDECK_TARBALL, a package built with `npm pack`).
#
# It installs the npm package `kipdeck` (built ahead: nothing is compiled on your machine) into
# ~/.local/share/kipdeck and links a `kipdeck` command into ~/.local/bin. Run it again to update.
# It never installs anything else: the agent CLIs (Claude Code, Codex, Cursor) are yours to install.
#
# Environment:
#   KIPDECK_VERSION        install this version (e.g. 0.2.0) instead of the newest
#   KIPDECK_PREFIX         where the package goes (default ~/.local/share/kipdeck)
#   KIPDECK_BIN_DIR        where the `kipdeck` command goes (default ~/.local/bin; empty: none)
#   KIPDECK_INSTALL_ONLY   1: install, but don't start it
#   KIPDECK_TARBALL        install this package tarball (from `npm pack`) instead of the registry's
set -euo pipefail

KIPDECK_VERSION="${KIPDECK_VERSION:-}"
KIPDECK_TARBALL="${KIPDECK_TARBALL:-}"
KIPDECK_INSTALL_ONLY="${KIPDECK_INSTALL_ONLY:-}"

PACKAGE="kipdeck"
PREFIX="${KIPDECK_PREFIX:-${XDG_DATA_HOME:-$HOME/.local/share}/kipdeck}"
BIN_DIR="${KIPDECK_BIN_DIR-$HOME/.local/bin}"

if [ -t 2 ]; then CYAN=$'\033[1;36m' YELLOW=$'\033[1;33m' RED=$'\033[1;31m' RESET=$'\033[0m'
else CYAN="" YELLOW="" RED="" RESET=""; fi
step() { printf '%s==>%s %s\n' "$CYAN" "$RESET" "$*" >&2; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() { printf '%skipdeck:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

check_requirements() {
  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) die "Kipdeck runs on macOS and Linux. On Windows, run this inside WSL." ;;
  esac
  have node || die "Kipdeck needs Node.js 20 or newer. Get it from https://nodejs.org (or nvm), then run this again."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Kipdeck needs Node.js 20 or newer, and this is $(node -v). Update it, then run this again."
  have npm || die "Kipdeck needs npm, which comes with Node.js."
  have git || warn "git isn't installed. Kipdeck needs it for projects and each agent's branch."
  if ! have claude && ! have codex && ! have cursor-agent; then
    warn "no Claude Code, Codex or Cursor CLI on your PATH. Agents need one of them, e.g."
    warn "  npm install -g @anthropic-ai/claude-code"
  fi
}

# What to run while the package is not on the registry: the README's "From source" steps.
from_source() {
  cat >&2 <<'EOF'

Kipdeck is not on npm yet. Run it from source (Node.js 20+ and git):

  git clone https://github.com/zbagdzevicius/kipdeck
  cd kipdeck && npm install && npm run build && npm link
  cd ~/code/your-project && kipdeck

EOF
}

main() {
  check_requirements
  local spec="$PACKAGE@${KIPDECK_VERSION:-latest}"
  if [ -n "${KIPDECK_TARBALL:-}" ]; then
    [ -f "$KIPDECK_TARBALL" ] || die "no such file: $KIPDECK_TARBALL"
    spec="$(cd "$(dirname "$KIPDECK_TARBALL")" && pwd)/$(basename "$KIPDECK_TARBALL")"
  fi
  step "Installing $spec into $PREFIX"
  mkdir -p "$PREFIX"
  if ! npm install --global --prefix "$PREFIX" --no-audit --no-fund --loglevel=error "$spec" >&2; then
    if [ -z "${KIPDECK_TARBALL:-}" ] && ! npm view "$PACKAGE" version >/dev/null 2>&1; then
      from_source
      die "$PACKAGE is not on npm yet: run it from source with the steps above"
    fi
    die "npm couldn't install $spec (see above)"
  fi
  local entry="$PREFIX/bin/kipdeck"
  [ -x "$entry" ] || die "the package didn't put a kipdeck command in $PREFIX/bin"

  local run="$entry"
  if [ -n "$BIN_DIR" ]; then
    mkdir -p "$BIN_DIR"
    if [ -e "$BIN_DIR/kipdeck" ] && [ ! -L "$BIN_DIR/kipdeck" ]; then
      warn "left $BIN_DIR/kipdeck alone: it isn't a link this script made"
    else
      ln -sfn "$entry" "$BIN_DIR/kipdeck"
      case ":$PATH:" in
        *":$BIN_DIR:"*) run="kipdeck" ;;
        *) warn "$BIN_DIR isn't on your PATH. Add it to run kipdeck directly next time." ;;
      esac
    fi
  fi

  if [ "${KIPDECK_INSTALL_ONLY:-}" = 1 ]; then
    step "Installed. Start it in a project folder with: $run"
    return 0
  fi
  step "Starting Kipdeck"
  # Piped into bash (curl ... | bash), stdin is the rest of this script: give Kipdeck the terminal
  # instead, so it can open itself in your browser, signed in.
  if [ ! -t 0 ] && [ -t 1 ] && (: </dev/tty) 2>/dev/null; then exec "$entry" "$@" </dev/tty; fi
  exec "$entry" "$@"
}

main "$@"
