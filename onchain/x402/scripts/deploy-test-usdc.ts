// Deploys TestUSDC (6 decimals, USDC's EIP-712 domain, EIP-3009) to Base Sepolia as a stand-in when
// Circle's test USDC can't be had, and mints some to the payer, so an x402 task can be paid end to end
// on a real testnet. Refuses any chain but Base Sepolia (or a local anvil run with --chain-id 84532).
//
//   tsx scripts/deploy-test-usdc.ts --key-file ~/.config/agent-office-chain/base-deployer.json \
//     --mint-to 0x<payer address> [--amount 100] [--rpc https://sepolia.base.org]
//
// Prints the token's address: start the office with --x402-asset <it>.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createWalletClient, http, isAddress, publicActions, type Abi, type Hex } from 'viem';
import { chainOf } from '../src/facilitator.js';
import { readEvmKey } from '../src/keyfile.js';
import { parseAmount } from '../src/networks.js';

const argv = process.argv.slice(2);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rpc = opt('rpc') ?? 'https://sepolia.base.org';
const keyFile = opt('key-file');
const mintTo = opt('mint-to');
const amount = parseAmount(opt('amount') ?? '100');
if (!keyFile) throw new Error('--key-file <path>: the deployer, which pays the gas');
if (!mintTo || !isAddress(mintTo)) throw new Error('--mint-to <address>: who gets the test tokens');
if (!amount) throw new Error('--amount is a number of tokens');

const root = path.join(import.meta.dirname, '..');
const artifact = path.join(root, 'out', 'TestUSDC.sol', 'TestUSDC.json');
if (!existsSync(artifact)) execFileSync('forge', ['build'], { cwd: root, stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
const { abi, bytecode } = JSON.parse(readFileSync(artifact, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };

const w = createWalletClient({ account: readEvmKey(keyFile), chain: chainOf(84532, rpc, 'Base Sepolia'), transport: http(rpc, { timeout: 60_000 }) }).extend(publicActions);
const id = await w.getChainId();
if (id !== 84532) throw new Error(`Refusing: the node is on chain ${id}, not Base Sepolia (84532)`);
const hash = await w.deployContract({ abi, bytecode: bytecode.object });
const receipt = await w.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (!receipt.contractAddress) throw new Error(`TestUSDC did not deploy: ${hash}`);
const token = receipt.contractAddress;
const mint = await w.writeContract({ address: token, abi, functionName: 'mint', args: [mintTo, BigInt(amount)] });
await w.waitForTransactionReceipt({ hash: mint, timeout: 120_000 });
console.log(token);
