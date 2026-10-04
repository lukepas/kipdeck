import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MockEscrow, parseAmount } from '../../solana/sdk/src/index.js';
import { escapeData, main } from '../src/main.js';
import { outputFile } from '../src/report.js';
import { REPO, approver, attester, env, funder, github, keyJson, kp } from './support.js';

const NOW = 1_800_000_000;

async function escrow() {
  const e = new MockEscrow({ now: () => NOW });
  const keys = { attester: attester.publicKey, approver: approver.publicKey };
  await e.open({ repo: REPO, issue: 12 }, { expiryTs: NOW + 86_400, ...keys }, funder);
  await e.fund({ repo: REPO, issue: 12, ...keys }, parseAmount('40', 6), funder);
  return e;
}

/** A job's environment: the inputs, the event file, and the files GitHub collects outputs and the summary from. */
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function job(inputs: Record<string, string> = {}, event: unknown = { action: 'closed', pull_request: { number: 31 } }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bounty-action-'));
  dirs.push(dir);
  const files = { event: path.join(dir, 'event.json'), output: path.join(dir, 'output'), summary: path.join(dir, 'summary.md') };
  writeFileSync(files.event, JSON.stringify(event));
  writeFileSync(files.output, '');
  writeFileSync(files.summary, '');
  const e = { ...env(inputs), GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: files.event, GITHUB_OUTPUT: files.output, GITHUB_STEP_SUMMARY: files.summary, GITHUB_ACTION_REPOSITORY: 'acme/agent-office', GITHUB_ACTION_REF: 'v1' };
  return { env: e, files };
}

/** GITHUB_OUTPUT's name<<delimiter blocks, read back. */
function outputs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2\n/gm;
  for (const m of text.matchAll(re)) out[m[1]] = m[3];
  return out;
}

test('a run writes its outputs, the job summary and a comment on the pull request', async () => {
  const { env: e, files } = job({ 'approver-key': keyJson(approver) });
  const gh = github();
  const lines: string[] = [];
  const code = await main({ env: e, write: (l) => lines.push(l), deps: { github: gh, escrow: await escrow() } });
  assert.equal(code, 0);
  const out = outputs(readFileSync(files.output, 'utf8'));
  assert.equal(out.status, 'done');
  assert.equal(out.pr, '31');
  assert.equal(out.claimed, '1');
  assert.equal(out.released, '1');
  assert.equal(out['prepared-release'], '');
  assert.equal(JSON.parse(out.result).issues[0].issue, 12);
  const summary = readFileSync(files.summary, 'utf8');
  assert.match(summary, /### Bounty escrow: PR #31/);
  assert.match(summary, /\*\*#12\*\* \(40 test USDC\): paid to `.+` \(wallets-file\)/);
  assert.equal(gh.comments.length, 1);
  assert.equal(gh.comments[0].issue, 31);
  // The secrets were masked first.
  assert.equal(lines[0], `::add-mask::${keyJson(attester)}`);
});

test('a prepared release reaches the approver with the commands to check and send it', async () => {
  const { env: e, files } = job({ 'approver-nonce-account': kp(9).publicKey });
  const m = await escrow();
  const withPrepare = Object.assign(m, { prepareRelease: async () => 'UFJFUEFSRUQ=' });
  const gh = github();
  assert.equal(await main({ env: e, write: () => {}, deps: { github: gh, escrow: withPrepare } }), 0);
  const out = outputs(readFileSync(files.output, 'utf8'));
  assert.equal(out['prepared-release'], 'UFJFUEFSRUQ=');
  const body = gh.comments[0].body;
  assert.match(body, /For the approver/);
  assert.match(body, /node ao-bounty\.mjs cosign --tx @release\.txt --repo acme\/widgets --program JAH6ZioohUJmhnTESy5TpedBPLuiGviZLhYFyQsyVQs6 --backend solana-devnet/);
  assert.match(body, /https:\/\/github\.com\/acme\/agent-office\/raw\/v1\/onchain\/action\/dist\/ao-bounty\.mjs/);
  assert.match(body, /UFJFUEFSRUQ=/);
});

test('nothing to do is a notice and a green job, with no comment', async () => {
  const { env: e, files } = job({}, { action: 'closed', pull_request: { number: 31 } });
  const gh = github();
  gh.pulls.get(31)!.merged = false;
  const lines: string[] = [];
  assert.equal(await main({ env: e, write: (l) => lines.push(l), deps: { github: gh, escrow: await escrow() } }), 0);
  assert.ok(lines.includes('::notice::PR #31 was closed without merging'));
  assert.equal(outputs(readFileSync(files.output, 'utf8')).status, 'skipped');
  assert.equal(gh.comments.length, 0);
});

test("a failure is an ::error:: line and a red job, and a comment that can't be posted is only a warning", async () => {
  const { env: e } = job({ cluster: 'mainnet-beta' });
  const lines: string[] = [];
  assert.equal(await main({ env: e, write: (l) => lines.push(l) }), 1);
  assert.match(lines.at(-1)!, /^::error::cluster is devnet or localnet/);

  const { env: e2 } = job();
  const gh = github();
  gh.comment = async () => {
    throw new Error('GitHub answered 403 to POST');
  };
  const lines2: string[] = [];
  assert.equal(await main({ env: e2, write: (l) => lines2.push(l), deps: { github: gh, escrow: await escrow() } }), 0);
  assert.ok(lines2.some((l) => l.startsWith("::warning::couldn't comment on PR #31 (GitHub answered 403 to POST)")));
});

test('workflow command data is escaped, and an output never contains its delimiter', () => {
  assert.equal(escapeData('a%b\r\nc'), 'a%25b%0D%0Ac');
  assert.equal(outputFile({ a: 'x\ny' }, 'EOF1'), 'a<<EOF1\nx\ny\nEOF1\n');
  assert.throws(() => outputFile({ a: 'EOF1' }, 'EOF1'), /contains its delimiter/);
});
