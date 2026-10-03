// A throwaway anvil node for a test, on a free port, with the chain id the test asks for (84532 to
// stand in for Base Sepolia, anything else to check the guard).
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';

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

export async function startAnvil(chainId = 84532): Promise<Anvil> {
  const port = await freePort();
  const proc = spawn('anvil', ['--port', String(port), '--silent', '--chain-id', String(chainId)], { stdio: 'ignore', env: { ...process.env, FOUNDRY_DISABLE_NIGHTLY_WARNING: '1' } });
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
