# Install Kipdeck (the inbox for your AI coding agents) from its newest release on Windows and start it:
#
#   irm https://raw.githubusercontent.com/zbagdzevicius/kipdeck/main/install.ps1 | iex
#
# It installs the newest release's package, built ahead by the Release workflow (nothing is compiled
# on your machine), with `npm install --global`, which puts a `kipdeck` command on your PATH. Run it
# again to update. It never installs anything else: the agent CLIs (Claude Code, Codex, Cursor) are
# yours to install. Kipdeck is not on npm yet; the newest release is
#
#   https://github.com/zbagdzevicius/kipdeck/releases/latest/download/kipdeck.tgz
#
# and `npx <that address>` runs it without installing anything.
#
# Environment:
#   KIPDECK_VERSION        install this release (e.g. 0.1.70) instead of the newest
#   KIPDECK_INSTALL_ONLY   1: install, but don't start it
#   KIPDECK_TARBALL        install this package tarball (a path or an https address) instead


$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
  Write-Host "kipdeck: $message" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'Kipdeck needs Node.js 20 or newer. Get it from https://nodejs.org, then run this again.'
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) { Fail "Kipdeck needs Node.js 20 or newer, and this is $(node -v). Update it, then run this again." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'Kipdeck needs npm, which comes with Node.js.' }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "warning: git isn't installed. Kipdeck needs it for projects and each agent's branch." -ForegroundColor Yellow
}
if (-not ((Get-Command claude -ErrorAction SilentlyContinue) -or (Get-Command codex -ErrorAction SilentlyContinue) -or (Get-Command cursor-agent -ErrorAction SilentlyContinue))) {
  Write-Host 'warning: no Claude Code, Codex or Cursor CLI on your PATH. Agents need one of them, e.g. npm install -g @anthropic-ai/claude-code' -ForegroundColor Yellow
}

$releases = 'https://github.com/zbagdzevicius/kipdeck/releases'
$spec = "$releases/latest/download/kipdeck.tgz"
if ($env:KIPDECK_VERSION) { $spec = "$releases/download/v$($env:KIPDECK_VERSION.TrimStart('v'))/kipdeck.tgz" }
if ($env:KIPDECK_TARBALL) {
  if ($env:KIPDECK_TARBALL -like 'https://*') {
    $spec = $env:KIPDECK_TARBALL
  } else {
    if (-not (Test-Path $env:KIPDECK_TARBALL)) { Fail "no such file: $($env:KIPDECK_TARBALL)" }
    $spec = (Resolve-Path $env:KIPDECK_TARBALL).Path
  }
}

Write-Host "==> Installing $spec" -ForegroundColor Cyan
npm install --global --no-audit --no-fund --loglevel=error $spec
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'To run it straight from the repository instead (Node.js 20+ and git; the'
  Write-Host 'first run builds it, a few minutes), in your repository:'
  Write-Host ''
  Write-Host '  cd ~\code\your-project; npx github:zbagdzevicius/kipdeck'
  Write-Host ''
  Write-Host 'Or from a clone, with a kipdeck command on your PATH:'
  Write-Host ''
  Write-Host '  git clone https://github.com/zbagdzevicius/kipdeck'
  Write-Host '  cd kipdeck; npm install; npm link'
  Write-Host '  cd ~\code\your-project; kipdeck'
  Write-Host ''
  Fail "npm couldn't install $spec (see above)"
}

if ($env:KIPDECK_INSTALL_ONLY -eq '1') {
  Write-Host '==> Installed. Start it in a project folder with: kipdeck' -ForegroundColor Cyan
  exit 0
}
Write-Host '==> Starting Kipdeck' -ForegroundColor Cyan
kipdeck @args
