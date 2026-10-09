# Install Kipdeck (the inbox for your AI coding agents) from npm on Windows and start it:
#
#   irm <this repository's raw install.ps1 URL> | iex
#
# It installs the npm package `kipdeck` (built ahead: nothing is compiled on your machine) with
# `npm install --global`, which puts a `kipdeck` command on your PATH. Run it again to update.
# It never installs anything else: the agent CLIs (Claude Code, Codex, Cursor) are yours to install.
# `npx kipdeck` does the same without installing anything.
#
# Environment:
#   KIPDECK_VERSION        install this version (e.g. 0.2.0) instead of the newest
#   KIPDECK_INSTALL_ONLY   1: install, but don't start it
#   KIPDECK_TARBALL        install this package tarball (from `npm pack`) instead of the registry's


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

$version = if ($env:KIPDECK_VERSION) { $env:KIPDECK_VERSION } else { 'latest' }
$spec = "kipdeck@$version"
if ($env:KIPDECK_TARBALL) {
  if (-not (Test-Path $env:KIPDECK_TARBALL)) { Fail "no such file: $($env:KIPDECK_TARBALL)" }
  $spec = (Resolve-Path $env:KIPDECK_TARBALL).Path
}

Write-Host "==> Installing $spec" -ForegroundColor Cyan
npm install --global --no-audit --no-fund --loglevel=error $spec
if ($LASTEXITCODE -ne 0) { Fail "npm couldn't install $spec (see above)" }

if ($env:KIPDECK_INSTALL_ONLY -eq '1') {
  Write-Host '==> Installed. Start it in a project folder with: kipdeck' -ForegroundColor Cyan
  exit 0
}
Write-Host '==> Starting Kipdeck' -ForegroundColor Cyan
kipdeck @args
