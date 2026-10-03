#!/usr/bin/env bash
# The Base Sepolia side of Proof of Merge in one command, once the wallets are funded:
#
#   1. checks the node is Base Sepolia (chain id 84532) and the wallets hold test ETH
#   2. registers the attestation schema on the EAS SchemaRegistry predeploy (deployments/base-sepolia.json)
#   3. optionally deploys the MergeAttestor fallback (--fallback)
#   4. runs the smoke test: attest, attest a revert, read back, leaderboard, revoke both
#   5. for x402: checks the payer's Circle test USDC, or deploys TestUSDC minted to the payer (--test-usdc)
#   6. optionally pays for one held task on a running office (--office <url> --repo owner/name)
#
# Testnet only. Keys are read from files in $CHAIN_KEY_DIR (default ~/.config/agent-office-chain) and
# never printed; only public addresses are. Usage:
#
#   onchain/attest/scripts/deploy-sepolia.sh [--fallback] [--test-usdc] [--office https://office.example --repo owner/name]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
X402="$(cd "$HERE/../x402" && pwd)"
KEYS="${CHAIN_KEY_DIR:-$HOME/.config/agent-office-chain}"
RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"
USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e
MIN_WEI=500000000000000 # 0.0005 ETH: enough for the schema, a contract and a few attestations
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

FALLBACK=0 TEST_USDC=0 OFFICE="" REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fallback) FALLBACK=1 ;;
    --test-usdc) TEST_USDC=1 ;;
    --office) OFFICE="$2"; shift ;;
    --repo) REPO="$2"; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

case "$RPC" in
  https://sepolia.base.org|https://base-sepolia-rpc.publicnode.com) ;;
  *) echo "BASE_SEPOLIA_RPC must be https://sepolia.base.org or https://base-sepolia-rpc.publicnode.com" >&2; exit 2 ;;
esac

addr() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!/^0x[0-9a-fA-F]{40}$/.test(j.address))process.exit(1);console.log(j.address)' "$1"; }
for f in base-deployer base-attester base-payer base-office; do
  [ -f "$KEYS/$f.json" ] || { echo "Missing $KEYS/$f.json (a testnet key file, mode 0600)" >&2; exit 1; }
done
DEPLOYER=$(addr "$KEYS/base-deployer.json")
ATTESTER=$(addr "$KEYS/base-attester.json")
PAYER=$(addr "$KEYS/base-payer.json")
OFFICE_WALLET=$(addr "$KEYS/base-office.json")

CHAIN=$(cast chain-id --rpc-url "$RPC" --rpc-timeout 20)
[ "$CHAIN" = "84532" ] || { echo "Refusing: $RPC is chain $CHAIN, not Base Sepolia (84532)" >&2; exit 1; }

short=0
for who in "deployer:$DEPLOYER" "attester:$ATTESTER"; do
  name=${who%%:*} a=${who#*:}
  bal=$(cast balance "$a" --rpc-url "$RPC" --rpc-timeout 20)
  echo "$name $a: $(cast from-wei "$bal") ETH"
  if [ "$(node -e 'console.log(BigInt(process.argv[1]) < BigInt(process.argv[2]) ? 1 : 0)' "$bal" "$MIN_WEI")" = 1 ]; then short=1; fi
done
if [ "$short" = 1 ]; then
  cat >&2 <<EOF

Fund these Base Sepolia addresses with test ETH first (a browser faucet, e.g. the Coinbase Developer
Platform faucet or https://www.alchemy.com/faucets/base-sepolia), then run this again:
  deployer  $DEPLOYER
  attester  $ATTESTER
EOF
  exit 1
fi

[ -d "$HERE/node_modules" ] || (cd "$HERE" && npm ci)
[ -d "$X402/node_modules" ] || (cd "$X402" && npm ci)
(cd "$HERE" && npm run build >/dev/null)

echo "== schema"
(cd "$HERE" && node_modules/.bin/tsx scripts/register-schema.ts --rpc "$RPC" --key-file "$KEYS/base-deployer.json" --attester-key-file "$KEYS/base-attester.json")

if [ "$FALLBACK" = 1 ]; then
  echo "== MergeAttestor fallback"
  (cd "$HERE" && node_modules/.bin/tsx scripts/deploy-fallback.ts --rpc "$RPC" --key-file "$KEYS/base-deployer.json" --attester-key-file "$KEYS/base-attester.json")
fi

echo "== smoke test (EAS)"
(cd "$HERE" && node_modules/.bin/tsx scripts/smoke.ts --name base-sepolia --rpc "$RPC" --key-file "$KEYS/base-attester.json")
if [ "$FALLBACK" = 1 ]; then
  echo "== smoke test (fallback)"
  (cd "$HERE" && node_modules/.bin/tsx scripts/smoke.ts --name base-sepolia --rpc "$RPC" --key-file "$KEYS/base-attester.json" --mode event)
fi

echo "== x402"
ASSET=$USDC
usdc=$(cast call "$USDC" 'balanceOf(address)(uint256)' "$PAYER" --rpc-url "$RPC" --rpc-timeout 20 | awk '{print $1}')
echo "payer $PAYER holds $usdc atomic units of Circle test USDC"
if [ "$usdc" = 0 ]; then
  if [ "$TEST_USDC" = 1 ]; then
    ASSET=$(cd "$X402" && node_modules/.bin/tsx scripts/deploy-test-usdc.ts --rpc "$RPC" --key-file "$KEYS/base-deployer.json" --mint-to "$PAYER" --amount 100)
    echo "TestUSDC (a stand-in, not Circle's) at $ASSET, 100 minted to the payer"
  else
    echo "Get test USDC for the payer at https://faucet.circle.com (Base Sepolia, $PAYER), or run again with --test-usdc." >&2
  fi
fi

cat <<EOF

Start the office with:
  --attest --attest-key-file $KEYS/base-attester.json
  --x402 --x402-pay-to $OFFICE_WALLET --x402-repos <owner/name>$( [ "$ASSET" != "$USDC" ] && echo " --x402-asset $ASSET" )
EOF

if [ -n "$OFFICE" ]; then
  [ -n "$REPO" ] || { echo "--office needs --repo owner/name" >&2; exit 2; }
  echo "== paying for one held task on $OFFICE"
  (cd "$X402" && X402_PAYER_KEY_FILE="$KEYS/base-payer.json" node_modules/.bin/tsx src/cli.ts pay "$OFFICE" --repo "$REPO" --prompt "Proof of Merge end-to-end check: reply with a one-line summary of the README. No code changes." --max 0.10 $( [ "$ASSET" != "$USDC" ] && echo "--asset $ASSET" ))
fi
