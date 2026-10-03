// The office's background job for the public board, with --reputation-index <minutes>: every so often
// it runs onchain/indexer (its own process, through tsx) to rebuild leaderboard.json and dataset.json
// from the chain alone, the way anyone without the office would, and keeps the result in the data
// folder for GET /api/public/leaderboard?source=chain. The indexer reads public chain data only: it
// gets the public addresses of the office's attester and registrar, never a key, and an environment
// with nothing in it but PATH and HOME.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { tryStateJson } from '../safefs.js';
import type { ChainFlags } from './flags.js';
import { sdkCandidates } from './sdk.js';

const INDEXER = ['onchain', 'indexer', 'scripts', 'index.ts'];
/** A run that takes longer than this is stopped. */
const RUN_MS = 10 * 60_000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export interface IndexDeps {
  dataDir: string;
  flags: ChainFlags;
  minutes: number;
  /** The office's public addresses: whose attestations and identities count. */
  sources(): Promise<{ attesters: string[]; registrars: string[] }>;
  /** Tests: how the indexer is started, and no timer. */
  spawn?: (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcess;
  timer?: boolean;
}

export class ReputationIndex {
  readonly dir: string;
  last?: { at: number; ok: boolean; error?: string };
  private running?: Promise<void>;
  private timer?: NodeJS.Timeout;

  constructor(private deps: IndexDeps) {
    this.dir = path.join(deps.dataDir, 'reputation-index');
    if (deps.timer !== false) {
      this.timer = setInterval(() => void this.run(), Math.max(1, deps.minutes) * 60_000);
      this.timer.unref();
      setTimeout(() => void this.run(), 30_000).unref();
    }
  }

  stop() {
    clearInterval(this.timer);
  }

  /** What the indexer wrote last: the boards (leaderboard.json) or the dataset (dataset.json). */
  read(file: 'leaderboard.json' | 'dataset.json'): unknown {
    return tryStateJson(path.join(this.dir, file));
  }

  /** The arguments the indexer runs with, or why it can't run. */
  async args(): Promise<string[] | string> {
    const script = sdkCandidates(undefined, INDEXER).find((c) => existsSync(c));
    if (!script) return 'onchain/indexer is not there';
    const { attesters, registrars } = await this.deps.sources();
    const attester = attesters.find((a) => ADDRESS.test(a));
    if (!attester) return 'the attester\'s address is not known yet';
    const rpc = this.deps.flags.attest.rpc;
    const local = rpc.startsWith('http://127.0.0.1');
    return ['--import', 'tsx', script, '--network', local ? 'localnet' : 'base-sepolia', '--rpc', rpc, '--out', this.dir, '--attester', attester, ...registrars.filter((r) => ADDRESS.test(r)).flatMap((r) => ['--registrar', r]), ...(local ? ['--no-solana'] : [])];
  }

  /** One run, unless one is going already. */
  run(): Promise<void> {
    this.running ??= this.runNow().finally(() => (this.running = undefined));
    return this.running;
  }

  private async runNow() {
    const args = await this.args();
    if (typeof args === 'string') {
      this.last = { at: Date.now(), ok: false, error: args };
      return;
    }
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const cwd = path.dirname(path.dirname(args[2]));
    const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' };
    const start = this.deps.spawn ?? ((cmd, a, o) => spawn(cmd, a, { ...o, stdio: ['ignore', 'ignore', 'pipe'] }));
    const proc = start(process.execPath, args, { cwd, env });
    let err = '';
    proc.stderr?.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-600)));
    const code = await new Promise<number | null>((resolve) => {
      const kill = setTimeout(() => proc.kill(), RUN_MS);
      proc.once('exit', (c) => {
        clearTimeout(kill);
        resolve(c);
      });
      proc.once('error', () => resolve(-1));
    });
    this.last = code === 0 ? { at: Date.now(), ok: true } : { at: Date.now(), ok: false, error: (err.trim().split('\n').pop() ?? '').slice(0, 300) || `exit ${code}` };
  }
}
