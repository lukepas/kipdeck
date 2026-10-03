// A throwaway anvil node for a test: started on a free port, stopped when the test ends. Its first
// dev account (anvil's published test key, worthless anywhere else) deploys and pays the gas.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createWalletClient, http, publicActions, type Abi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chainOf } from '../../src/facilitator.js';

/** anvil's first dev account: a key every Foundry install prints, so never fund it anywhere real. */
export const ANVIL_KEY: Hex = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const root = path.join(import.meta.dirname, '..', '..');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

export interface Anvil {
  rpc: string;
  proc: ChildProcess;
  stop(): Promise<void>;
}

export async function startAnvil(): Promise<Anvil> {
  const port = await freePort();
  const proc = spawn('anvil', ['--port', String(port), '--silent', '--chain-id', '31337'], { stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
  const rpc = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1000) });
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error('anvil did not start within 20 seconds (is Foundry installed?)');
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    rpc,
    proc,
    stop: () =>
      new Promise((r) => {
        if (proc.exitCode !== null) return r();
        proc.once('exit', () => r());
        proc.kill();
      }),
  };
}

/** The compiled TestUSDC (forge build runs first when it isn't built yet). */
export function testUsdcArtifact(): { abi: Abi; bytecode: Hex } {
  const file = path.join(root, 'out', 'TestUSDC.sol', 'TestUSDC.json');
  if (!existsSync(file)) execFileSync('forge', ['build'], { cwd: root, stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
  const j = JSON.parse(readFileSync(file, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export function devWallet(rpc: string, key: Hex = ANVIL_KEY) {
  return createWalletClient({ account: privateKeyToAccount(key), chain: chainOf(31337, rpc, 'anvil'), transport: http(rpc) }).extend(publicActions);
}

/** Deploys TestUSDC and returns its address. */
export async function deployTestUsdc(rpc: string): Promise<Hex> {
  const w = devWallet(rpc);
  const { abi, bytecode } = testUsdcArtifact();
  const hash = await w.deployContract({ abi, bytecode });
  const receipt = await w.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('TestUSDC did not deploy');
  return receipt.contractAddress;
}
