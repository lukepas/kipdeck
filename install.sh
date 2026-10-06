#!/usr/bin/env bash
# Install Mergeline (the inbox for your AI coding agents) from npm and start it, for anyone who would
# rather have a `mergeline` command than type `npx mergeline` each time:
#
#   curl -fsSL <this repository's raw install.sh URL> | bash
#
# Anything after `bash -s --` goes to Mergeline, e.g. a port:
#
#   curl -fsSL <...>/install.sh | bash -s -- --port 4700
#
# It installs the npm package `mergeline` (built ahead: nothing is compiled on your machine) into
# ~/.local/share/mergeline and links a `mergeline` command into ~/.local/bin. Run it again to update.
# It never installs anything else: the agent CLIs (Claude Code, Codex, Cursor) are yours to install.
#
# Environment:
#   MERGELINE_VERSION        install this version (e.g. 0.2.0) instead of the newest
#   MERGELINE_PREFIX         where the package goes (default ~/.local/share/mergeline)
#   MERGELINE_BIN_DIR        where the `mergeline` command goes (default ~/.local/bin; empty: none)
#   MERGELINE_INSTALL_ONLY   1: install, but don't start it
#   MERGELINE_TARBALL        install this package tarball (from `npm pack`) instead of the registry's
set -euo pipefail

PACKAGE="mergeline"
PREFIX="${MERGELINE_PREFIX:-${XDG_DATA_HOME:-$HOME/.local/share}/mergeline}"
BIN_DIR="${MERGELINE_BIN_DIR-$HOME/.local/bin}"

if [ -t 2 ]; then CYAN=$'\033[1;36m' YELLOW=$'\033[1;33m' RED=$'\033[1;31m' RESET=$'\033[0m'
else CYAN="" YELLOW="" RED="" RESET=""; fi
step() { printf '%s==>%s %s\n' "$CYAN" "$RESET" "$*" >&2; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die() { printf '%smergeline:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

check_requirements() {
  case "$(uname -s)" in
    Darwin | Linux) ;;
    *) die "Mergeline runs on macOS and Linux. On Windows, run this inside WSL." ;;
  esac
  have node || die "Mergeline needs Node.js 20 or newer. Get it from https://nodejs.org (or nvm), then run this again."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Mergeline needs Node.js 20 or newer, and this is $(node -v). Update it, then run this again."
  have npm || die "Mergeline needs npm, which comes with Node.js."
  have git || warn "git isn't installed. Mergeline needs it for projects and each agent's branch."
  if ! have claude && ! have codex && ! have cursor-agent; then
    warn "no Claude Code, Codex or Cursor CLI on your PATH. Agents need one of them, e.g."
    warn "  npm install -g @anthropic-ai/claude-code"
  fi
}

main() {
  check_requirements
  local spec="$PACKAGE@${MERGELINE_VERSION:-latest}"
  if [ -n "${MERGELINE_TARBALL:-}" ]; then
    [ -f "$MERGELINE_TARBALL" ] || die "no such file: $MERGELINE_TARBALL"
    spec="$(cd "$(dirname "$MERGELINE_TARBALL")" && pwd)/$(basename "$MERGELINE_TARBALL")"
  fi
  step "Installing $spec into $PREFIX"
  mkdir -p "$PREFIX"
  npm install --global --prefix "$PREFIX" --no-audit --no-fund --loglevel=error "$spec" >&2 ||
    die "npm couldn't install $spec (see above)"
  local entry="$PREFIX/bin/mergeline"
  [ -x "$entry" ] || die "the package didn't put a mergeline command in $PREFIX/bin"

  local run="$entry"
  if [ -n "$BIN_DIR" ]; then
    mkdir -p "$BIN_DIR"
    if [ -e "$BIN_DIR/mergeline" ] && [ ! -L "$BIN_DIR/mergeline" ]; then
      warn "left $BIN_DIR/mergeline alone: it isn't a link this script made"
    else
      ln -sfn "$entry" "$BIN_DIR/mergeline"
      case ":$PATH:" in
        *":$BIN_DIR:"*) run="mergeline" ;;
        *) warn "$BIN_DIR isn't on your PATH. Add it to run mergeline directly next time." ;;
      esac
    fi
  fi

  if [ "${MERGELINE_INSTALL_ONLY:-}" = 1 ]; then
    step "Installed. Start it in a project folder with: $run"
    return 0
  fi
  step "Starting Mergeline"
  # Piped into bash (curl ... | bash), stdin is the rest of this script: give Mergeline the terminal
  # instead, so it can open itself in your browser, signed in.
  if [ ! -t 0 ] && [ -t 1 ] && (: </dev/tty) 2>/dev/null; then exec "$entry" "$@" </dev/tty; fi
  exec "$entry" "$@"
}

main "$@"
