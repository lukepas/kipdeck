#!/usr/bin/env bash
# One bounty end to end on a test cluster: deploy the escrow, make the test mint, open a bounty,
# fund it, claim it for a PR and release it with both the attester's and the approver's keys.
# Writes the program id and every transaction signature to deployments/<cluster>.json.
#
#   scripts/e2e.sh localnet   # against solana-test-validator on 127.0.0.1:8899
#   scripts/e2e.sh devnet     # against Solana devnet (the deployer needs about 2 devnet SOL)
#
# Testnets only: there is no mainnet option. Keys are read from $KEYS (default
# ~/.config/agent-office-chain, mode 0700, files 0600) and never printed: only public addresses are.
set -euo pipefail

CLUSTER="${1:-localnet}"
case "$CLUSTER" in
  localnet) URL=http://127.0.0.1:8899; BACKEND=solana-localnet ;;
  devnet) URL=https://api.devnet.solana.com; BACKEND=solana-devnet ;;
  *) echo "usage: $0 localnet|devnet (there is no mainnet option)" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "$0")/.." && pwd)"
KEYS="${KEYS:-$HOME/.config/agent-office-chain}"
for k in deployer program attester approver test-mint funder operator; do
  f="$KEYS/solana-$k.json"
  [ -f "$f" ] || { echo "missing $f (see README: Keys)" >&2; exit 1; }
  mode=$(stat -f %Lp "$f" 2>/dev/null || stat -c %a "$f")
  [ "$mode" = 600 ] || { echo "$f must be mode 600, is $mode" >&2; exit 1; }
done
addr() { solana-keygen pubkey "$KEYS/solana-$1.json"; }
DEPLOYER=$(addr deployer); PROGRAM=$(addr program); ATTESTER=$(addr attester); APPROVER=$(addr approver)
MINT=$(addr test-mint); FUNDER=$(addr funder); OPERATOR=$(addr operator)
SOL=(--url "$URL" --keypair "$KEYS/solana-deployer.json")

if [ "$CLUSTER" = devnet ]; then
  genesis=$(solana genesis-hash --url "$URL")
  [ "$genesis" = EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG ] || { echo "not devnet (genesis $genesis)" >&2; exit 1; }
fi

echo "deployer $DEPLOYER: $(solana balance "${SOL[@]}" "$DEPLOYER")"
if [ "$CLUSTER" = localnet ]; then
  solana airdrop 20 "$DEPLOYER" --url "$URL" >/dev/null
fi

SO="$HERE/target/deploy/bounty_escrow.so"
[ -f "$SO" ] || { echo "build it first: npm run build:program" >&2; exit 1; }
echo "deploying $PROGRAM"
# A buffer key of our own, so the CLI never makes (and prints the seed phrase of) a throwaway one.
BUFFER="$KEYS/solana-deploy-buffer.json"
if [ ! -f "$BUFFER" ]; then
  (umask 077 && solana-keygen new --no-bip39-passphrase --silent -o "$BUFFER" >/dev/null 2>&1)
fi
LOG=$(mktemp)
if ! solana program deploy "${SOL[@]}" "$SO" --program-id "$KEYS/solana-program.json" --buffer "$BUFFER" >"$LOG" 2>&1; then
  grep -vi "seed phrase\|recover" "$LOG" | tail -5 >&2
  rm -f "$LOG"
  echo "deploy failed; rerun to resume from the buffer" >&2
  exit 1
fi
rm -f "$LOG"

# Fees for the attester (it also pays the operator's token account on release) and the funder.
for who in "$ATTESTER" "$FUNDER"; do
  solana transfer "${SOL[@]}" --allow-unfunded-recipient "$who" 0.1 >/dev/null
done

TOK=(--url "$URL" --fee-payer "$KEYS/solana-deployer.json")
if ! spl-token supply "$MINT" --url "$URL" >/dev/null 2>&1; then
  echo "creating the test mint $MINT"
  spl-token create-token "${TOK[@]}" --mint-authority "$DEPLOYER" --decimals 6 "$KEYS/solana-test-mint.json" >/dev/null
fi
spl-token create-account "${TOK[@]}" --owner "$FUNDER" "$MINT" >/dev/null 2>&1 || true
spl-token mint "${TOK[@]}" --mint-authority "$KEYS/solana-deployer.json" "$MINT" 100 --recipient-owner "$FUNDER" >/dev/null

REPO=proof-of-merge/devnet-demo
ISSUE=$(date +%s)
cli() { (cd "$HERE" && node --import tsx sdk/src/cli.ts "$@" --backend "$BACKEND" --rpc "$URL" --program "$PROGRAM" --mint test --repo "$REPO" --issue "$ISSUE"); }
sig() { sed -n "s/^$1: //p" | head -1; }

OPEN=$(cli open --days 7 --attester "$ATTESTER" --approver "$APPROVER" --keypair "$KEYS/solana-funder.json" | sig opened)
FUND=$(cli fund --amount 25 --keypair "$KEYS/solana-funder.json" | sig funded)
CLAIM=$(cli claim --pr 1 --wallet "$OPERATOR" --keypair "$KEYS/solana-attester.json" | sig claimed)
RELEASE=$(cli release --pr 1 --keypair "$KEYS/solana-attester.json" --approver-key "$KEYS/solana-approver.json" | sig released)
SHOW=$(cli show)
echo "$SHOW"
BOUNTY=$(cli address --attester "$ATTESTER" --approver "$APPROVER")

OUT="$HERE/deployments/$CLUSTER.json"
node -e '
const [out, cluster, url, program, deployer, mint, attester, approver, funder, operator, repo, issue, bounty, open, fund, claim, release] = process.argv.slice(1);
const fs = require("fs");
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
const doc = {
  cluster, programId: program, upgradeAuthority: deployer, deployedAt: new Date().toISOString(),
  note: "Testnet only. The program was built with the test-mint feature, so it accepts devnet USDC and the test mint below. The upgrade authority is a single devnet key, kept so devnet redeploys stay possible: whoever holds it could replace the program, so this deployment is not custody-free. A mainnet deployment would need a multisig authority, then none.",
  seeds: prev.seeds ?? "bounty, sha256(repo), issue (u64 LE), nonce, attester, approver",
  ...(prev.upgrades ? { upgrades: prev.upgrades } : {}),
  testMint: mint, attester, approver,
  e2e: [...(prev.e2e ?? []), { at: new Date().toISOString(), repo, issue: Number(issue), bounty, funder, operator, amount: "25", note: "Demo bounty: no GitHub merge behind it; the attester checks run in the office and SDK tests.", signatures: { open, fund, claim, release } }].slice(-5),
};
fs.writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
' "$OUT" "$CLUSTER" "$URL" "$PROGRAM" "$DEPLOYER" "$MINT" "$ATTESTER" "$APPROVER" "$FUNDER" "$OPERATOR" "$REPO" "$ISSUE" "$BOUNTY" "$OPEN" "$FUND" "$CLAIM" "$RELEASE"
echo "recorded in $OUT"
[ -n "$RELEASE" ] || { echo "the release did not go through" >&2; exit 1; }
