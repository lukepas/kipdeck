// The action's entry point (bundled to dist/index.mjs): reads what GitHub hands a JavaScript action,
// runs it, and writes the outputs, the job summary and, when asked, a comment on the pull request.
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DEVNET_RPC, DEVNET_USDC_MINT, SolanaEscrow, TEST_MINT } from '../../solana/sdk/src/index.js';
import { GitHub } from './github.js';
import { readInputs, type Env } from './inputs.js';
import { outputFile, outputsOf, reportMarkdown, worthAComment } from './report.js';
import { run, type Deps, type Logger } from './run.js';

/** Workflow command data, escaped as @actions/core does, so a value can't start a command of its own. */
export function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

export interface MainOptions {
  env?: Env;
  /** Where lines go (stdout): log lines and workflow commands. */
  write?: (line: string) => void;
  /** Tests: stand-ins for GitHub, the escrow, the attestor. */
  deps?: Partial<Deps>;
}

/** Runs the action; the exit code. */
export async function main(o: MainOptions = {}): Promise<number> {
  const env = o.env ?? process.env;
  const write = o.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const log: Logger = {
    info: (line) => write(line),
    notice: (line) => write(`::notice::${escapeData(line)}`),
    warning: (line) => write(`::warning::${escapeData(line)}`),
  };
  try {
    const inputs = readInputs(env, write);
    const repo = env.GITHUB_REPOSITORY;
    if (!repo) throw new Error('GITHUB_REPOSITORY is not set: this runs inside a GitHub Actions job');
    const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const github = o.deps?.github ?? new GitHub({ token: inputs.githubToken, repo, apiUrl: env.GITHUB_API_URL });
    const rpc = inputs.rpcUrl ?? (inputs.cluster === 'localnet' ? 'http://127.0.0.1:8899' : DEVNET_RPC);
    const escrow = o.deps?.escrow ?? new SolanaEscrow({ programId: inputs.programId, rpc, cluster: inputs.cluster, mint: inputs.mint ?? DEVNET_USDC_MINT, testMint: inputs.mint === TEST_MINT });
    const result = await run(inputs, { eventName: env.GITHUB_EVENT_NAME ?? '', event, repo }, { github, escrow, log, ...(o.deps?.makeAttestor ? { makeAttestor: o.deps.makeAttestor } : {}) });

    if (result.status !== 'done') log.notice(result.reason ?? result.status);
    const actionRepo = env.GITHUB_ACTION_REPOSITORY;
    const actionRef = env.GITHUB_ACTION_REF;
    const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const report = reportMarkdown(result, {
      repo,
      programId: inputs.programId,
      cluster: inputs.cluster,
      explorer: (sig) => escrow.explorer(sig),
      ...(actionRepo && actionRef ? { cosignUrl: `${server}/${actionRepo}/raw/${actionRef}/onchain/action/dist/ao-bounty.mjs` } : {}),
    });
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${report}\n`);
    else write(report);
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, outputFile(outputsOf(result), `ao_${randomUUID()}`));
    if (inputs.comment && result.pr && worthAComment(result) && github.comment) {
      try {
        await github.comment(result.pr, report);
      } catch (err) {
        log.warning(`couldn't comment on PR #${result.pr} (${(err as Error).message}): give the job "pull-requests: write", or set comment: false`);
      }
    }
    return 0;
  } catch (err) {
    write(`::error::${escapeData((err as Error).message)}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
