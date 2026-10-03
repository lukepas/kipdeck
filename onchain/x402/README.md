# onchain/x402: hire an office worker for one task over x402

Part of the Proof of Merge fork of [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT, by webdevcody / AgentSystemLabs). Testnets only: Base Sepolia, Solana devnet through the x402.org facilitator, and a local anvil node for tests. There is no mainnet network in this package, and a mainnet chain id is refused wherever a network is chosen.

An outside agent (or a person with a shell) pays a small amount of test USDC to put one task on an office's queue: a GitHub issue of a repository the office takes paid work on, or a prompt. The office answers `402 Payment Required` with what it wants, the payer signs an EIP-3009 `TransferWithAuthorization`, and the office has a facilitator verify and settle it. The task then waits on the queue, held, until an office admin reads it and approves it. The office side lives in `src/server/x402/` and is described in [docs/x402.md](../../docs/x402.md).

## What is here

| Path | What it does |
| --- | --- |
| `src/networks.ts` | The network table (Base Sepolia, Solana devnet, anvil), header names, amount helpers, `isMainnet` |
| `src/keyfile.ts` | Reads a testnet key from a file path (mode 0600 or tighter). Errors never include the key |
| `src/payer.ts` | `payFetch`: request, read the 402, pick an offer within a dollar limit, sign with `@x402/evm`, retry |
| `src/facilitator.ts` | `MockFacilitator` (checks signatures for real, settles in memory), `chainFacilitator` (`@x402/evm`'s facilitator settling on anvil or a testnet), `serveFacilitator` (HTTP on 127.0.0.1) |
| `src/office.ts` | Client for the office's `/api/x402` endpoints |
| `src/mcp.ts` | MCP server on stdio: `office_price`, `hire_worker`, `task_status` |
| `src/cli.ts` | `x402-office` CLI |
| `contracts/TestUSDC.sol` | EIP-3009 token with USDC's EIP-712 domain ("USDC", "2"), for anvil. Refuses to deploy on mainnets |
| `scripts/deploy-test-usdc.ts` | Deploys TestUSDC to Base Sepolia and mints to the payer, when Circle's test USDC can't be had |

Signing and verification use `viem` 2.57 and `@x402/core`, `@x402/evm`, `@x402/svm` 2.28. Nothing here is hand-rolled crypto.

## Use it

```sh
cd onchain/x402
npm install
npm run check          # typecheck, forge test, node tests (anvil must be on PATH)
```

Keys are files, never environment values. Point `X402_PAYER_KEY_FILE` at a key file (`{"address","privateKey"}` or one line of hex, mode 0600) of a wallet holding Base Sepolia test USDC:

```sh
export X402_PAYER_KEY_FILE=$HOME/.config/agent-office-chain/base-payer.json
npx tsx src/cli.ts price https://office.example
npx tsx src/cli.ts pay https://office.example --repo acme/app --issue 42 --max 0.10
npx tsx src/cli.ts status '<status url it printed>'
```

### MCP

```json
{
  "mcpServers": {
    "agent-office": {
      "command": "npx",
      "args": ["tsx", "/path/to/onchain/x402/src/cli.ts", "mcp"],
      "env": { "X402_OFFICE_URL": "https://office.example", "X402_PAYER_KEY_FILE": "/home/me/.config/agent-office-chain/base-payer.json", "X402_MAX_AMOUNT": "0.10" }
    }
  }
}
```

Without `X402_PAYER_KEY_FILE`, `hire_worker` answers with the office's `PaymentRequired` and the calling agent can pay through `_meta["x402/payment"]`.

### Facilitators for local runs

```sh
npx tsx src/cli.ts facilitator                         # mock: checks signatures, settles nothing on chain
npx tsx src/cli.ts facilitator --rpc http://127.0.0.1:8545 --chain-id 31337 --key-file <gas wallet key file>
```

The second runs `@x402/evm`'s own facilitator against a local anvil node, so `transferWithAuthorization` really runs on the TestUSDC contract. `test/anvil.test.ts` does exactly that.

## Tests

- `forge test`: TestUSDC's EIP-3009 (one use per nonce, the signature covers amount and payee, the time window, minters only, no mainnet deploy).
- `npm test`: payments signed with `@x402/evm`, the mock facilitator's refusals, mainnet refusal, the spending limit, key files, the CLI and MCP tools, a full settle on anvil, and (`test/office.test.ts`) paying the office's own gateway end to end: a held task on a real office queue, and a 402 for a payer who can't cover it.

## Base Sepolia

`../attest/scripts/deploy-sepolia.sh` does the Sepolia side of Proof of Merge in one command once the wallets are funded. For x402 on Sepolia the office uses Circle's test USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`) from [faucet.circle.com](https://faucet.circle.com), settled by `https://x402.org/facilitator`. TestUSDC is only deployed there if real test USDC can't be had.
