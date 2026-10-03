// x402-office: hire an Agent Office worker for a task from a shell, check on it, and run a facilitator
// or the MCP server. The payer's key is read from the key file X402_PAYER_KEY_FILE names, and nothing
// of it is ever printed.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chainFacilitator, MockFacilitator, serveFacilitator } from './facilitator.js';
import { keyFileAddress, readEvmKey } from './keyfile.js';
import { serveMcp } from './mcp.js';
import { isMainnet, networkByName, NETWORKS } from './networks.js';
import { officeOffer, payForTask, sayStatus, taskStatus } from './office.js';

export const USAGE = `Usage:
  x402-office price <office-url>                  what a task costs there
  x402-office pay <office-url> --repo owner/name (--issue N | --prompt "...")
        [--harness claude|codex|cursor|pi] [--max 0.10] [--network base-sepolia|anvil] [--asset 0x...]
                                                  pay for a task and queue it (key file: X402_PAYER_KEY_FILE)
  x402-office status <status-url>                 where a paid task stands
  x402-office address                             the address X402_PAYER_KEY_FILE pays from
  x402-office facilitator [--port 4402]           serve the mock facilitator (nothing goes on chain)
  x402-office facilitator --rpc <url> --chain-id N --key-file <path> [--port 4402]
                                                  serve a facilitator that settles on a testnet or local node
  x402-office mcp                                 serve the MCP tools on stdio (see README)`;

export class UsageError extends Error {}

function flags(args: string[], valued: string[]): { opts: Record<string, string>; words: string[] } {
  const opts: Record<string, string> = {};
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) {
      words.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const flag = eq > 0 ? a.slice(0, eq) : a;
    if (!valued.includes(flag)) throw new UsageError(`Unknown option: ${flag}`);
    if (eq > 0) opts[flag] = a.slice(eq + 1);
    else if (i + 1 < args.length) opts[flag] = args[++i];
    else throw new UsageError(`${flag} needs a value`);
  }
  return { opts, words };
}

function payerFile(env: Record<string, string | undefined>): string {
  const file = env.X402_PAYER_KEY_FILE;
  if (!file) throw new Error('Set X402_PAYER_KEY_FILE to the path of a testnet key file (mode 0600) holding test USDC');
  return file;
}

export interface CliIo {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  out?: (s: string) => void;
  err?: (s: string) => void;
}

/** Runs the command; resolves to its exit code. */
export async function main(argv: string[], io: CliIo = {}): Promise<number> {
  const env = io.env ?? process.env;
  const f = io.fetch ?? fetch;
  const out = io.out ?? ((s: string) => process.stdout.write(`${s}\n`));
  const err = io.err ?? ((s: string) => process.stderr.write(`${s}\n`));
  const [cmd, ...rest] = argv;
  try {
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      out(USAGE);
      return 0;
    }
    if (cmd === 'price') {
      const { words } = flags(rest, []);
      if (words.length !== 1) throw new UsageError('price takes the office URL');
      const o = await officeOffer(words[0], f);
      for (const a of o.accepts) out(`${o.price} USDC per task on ${a.label}, paid to ${a.payTo}`);
      out(`Repositories: ${o.repos.join(', ') || 'none yet'}. An office admin approves each paid task before it starts.`);
      return 0;
    }
    if (cmd === 'pay') {
      const { opts, words } = flags(rest, ['--repo', '--issue', '--prompt', '--harness', '--max', '--network', '--asset']);
      if (words.length !== 1) throw new UsageError('pay takes the office URL');
      if (!opts['--repo']) throw new UsageError('Say which repository: --repo owner/name');
      const issue = opts['--issue'] ? Number(opts['--issue']) : undefined;
      if (issue !== undefined && (!Number.isSafeInteger(issue) || issue <= 0)) throw new UsageError('--issue is an issue number');
      if (!issue && !opts['--prompt']?.trim()) throw new UsageError('Say what the task is: --issue N or --prompt "..."');
      const network = networkByName(opts['--network'] ?? 'base-sepolia');
      if (!network || network.kind !== 'evm') throw new UsageError(`--network is one of ${Object.keys(NETWORKS).filter((k) => networkByName(k)?.kind === 'evm').join(', ')}`);
      const paid = await payForTask(
        words[0],
        { repo: opts['--repo'], ...(issue ? { issue } : {}), ...(opts['--prompt'] ? { prompt: opts['--prompt'] } : {}), ...(opts['--harness'] ? { harness: opts['--harness'] } : {}) },
        { account: readEvmKey(payerFile(env)), maxAmount: opts['--max'] ?? '0.10', network: network.caip2, ...(opts['--asset'] ? { asset: opts['--asset'] } : {}), fetch: f },
      );
      out(paid.statusUrl);
      err(`Paid and queued task ${paid.taskId} (${paid.status}: an office admin approves it)${paid.settlement?.transaction ? `, transaction ${paid.settlement.transaction}` : ''}`);
      return 0;
    }
    if (cmd === 'status') {
      const { words } = flags(rest, []);
      if (words.length !== 1) throw new UsageError('status takes the status URL pay printed');
      out(sayStatus(await taskStatus(words[0], f)));
      return 0;
    }
    if (cmd === 'address') {
      out(keyFileAddress(payerFile(env)));
      return 0;
    }
    if (cmd === 'facilitator') {
      const { opts } = flags(rest, ['--port', '--rpc', '--chain-id', '--key-file']);
      const port = opts['--port'] ? Number(opts['--port']) : 4402;
      let served;
      if (opts['--rpc']) {
        const chainId = Number(opts['--chain-id']);
        if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new UsageError('--chain-id is the chain id (31337 for anvil, 84532 for Base Sepolia)');
        if (isMainnet(`eip155:${chainId}`)) throw new UsageError('Testnets and local nodes only');
        if (!opts['--key-file']) throw new UsageError('--key-file is the facilitator wallet that pays the gas');
        served = await serveFacilitator(chainFacilitator({ account: readEvmKey(opts['--key-file']), rpc: opts['--rpc'], chainId }), { port });
        out(`x402 facilitator on ${served.url}, settling on chain ${chainId} through ${opts['--rpc']}`);
      } else {
        served = await serveFacilitator(new MockFacilitator({ networks: [NETWORKS['base-sepolia'].caip2, NETWORKS.anvil.caip2] }), { port });
        out(`Mock x402 facilitator on ${served.url} (verify, settle, supported). Nothing it settles is on chain.`);
      }
      out(`Start the office with --x402-facilitator ${served.url}`);
      await new Promise(() => {});
    }
    if (cmd === 'mcp') {
      await serveMcp({ env, fetch: f });
      return 0;
    }
    throw new UsageError(`Unknown command: ${cmd}`);
  } catch (e) {
    err(`x402-office: ${(e as Error).message}`);
    if (e instanceof UsageError) err(`\n${USAGE}`);
    return e instanceof UsageError ? 2 : 1;
  }
}

const invoked = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invoked) process.exitCode = await main(process.argv.slice(2));
