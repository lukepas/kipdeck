#!/usr/bin/env bash
# Install Kipdeck (the inbox for your AI coding agents) from its newest release and start it, for
# anyone who would rather have a `kipdeck` command than type the npx command each time:
#
#   curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/install.sh | bash
#
# Anything after `bash -s --` goes to Kipdeck, e.g. a port:
#
#   curl -fsSL https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/install.sh | bash -s -- --port 4700
#
# It installs the newest release's package, built ahead by the Release workflow (nothing is compiled
# on your machine), into ~/.local/share/kipdeck and links a `kipdeck` command into ~/.local/bin. Run
# it again to update. It never installs anything else: the agent CLIs (Claude Code, Codex, Cursor)
# are yours to install. Kipdeck is not on npm yet; the newest release is
#
#   https://github.com/zbagdzevicius/kipdeck/releases/latest/download/kipdeck.tgz
#
# Environment:
#   KIPDECK_VERSION        install this release (e.g. 0.1.70) instead of the newest
#   KIPDECK_PREFIX         where the package goes (default ~/.local/share/kipdeck)
#   KIPDECK_BIN_DIR        where the `kipdeck` command goes (default ~/.local/bin; empty: none)
#   KIPDECK_INSTALL_ONLY   1: install, but don't start it
#   KIPDECK_TARBALL        install this package tarball (a path or an https address) instead
set -euo pipefail

KIPDECK_VERSION="${KIPDECK_VERSION:-}"
KIPDECK_TARBALL="${KIPDECK_TARBALL:-}"
KIPDECK_INSTALL_ONLY="${KIPDECK_INSTALL_ONLY:-}"

RELEASES="https://github.com/zbagdzevicius/kipdeck/releases"
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

# What to run when the release can't be installed: the README's "From source" steps.
from_source() {
  cat >&2 <<'EOF'

To run it straight from the repository instead (Node.js 20+ and git; the
first run builds it, a few minutes), in your repository:

  cd ~/code/your-project && npx github:zbagdzevicius/kipdeck

Or from a clone, with a kipdeck command on your PATH:

  git clone https://github.com/zbagdzevicius/kipdeck
  cd kipdeck && npm install && npm link
  cd ~/code/your-project && kipdeck

EOF
}

main() {
  check_requirements
  local spec="$RELEASES/latest/download/kipdeck.tgz"
  if [ -n "$KIPDECK_VERSION" ]; then spec="$RELEASES/download/v${KIPDECK_VERSION#v}/kipdeck.tgz"; fi
  if [ -n "$KIPDECK_TARBALL" ]; then
    case "$KIPDECK_TARBALL" in
      https://*) spec="$KIPDECK_TARBALL" ;;
      *)
        [ -f "$KIPDECK_TARBALL" ] || die "no such file: $KIPDECK_TARBALL"
        spec="$(cd "$(dirname "$KIPDECK_TARBALL")" && pwd)/$(basename "$KIPDECK_TARBALL")"
        ;;
    esac
  fi
  step "Installing $spec into $PREFIX"
  mkdir -p "$PREFIX"
  if ! npm install --global --prefix "$PREFIX" --no-audit --no-fund --loglevel=error "$spec" >&2; then
    from_source
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
