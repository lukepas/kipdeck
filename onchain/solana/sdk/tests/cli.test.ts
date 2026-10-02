import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';
import { MOCK_PROGRAM_ID, findBountyPda, keypairFromSeed } from '../src/index.js';

async function run(...argv: string[]): Promise<string[]> {
  const out: string[] = [];
  assert.equal(await main(argv, (l) => out.push(l)), 0);
  return out;
}

test('the CLI opens, funds, claims, releases and shows bounties on the mock', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-bounty-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const key = (name: string, n: number) => {
    const kp = keypairFromSeed(new Uint8Array(32).fill(n));
    const file = path.join(dir, `${name}.json`);
    writeFileSync(file, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
    return { file, address: kp.publicKey };
  };
  const [att, app, funder, op] = [key('attester', 1), key('approver', 2), key('funder', 3), key('operator', 4)];
  const mock = ['--backend', 'mock', '--mock-file', path.join(dir, 'mock.json')];
  assert.deepEqual(await run('show', '--repo', 'o/r', ...mock), ['no bounties on o/r']);
  assert.match((await run('open', '--repo', 'O/R', '--issue', '7', '--attester', att.address, '--approver', app.address, '--keypair', funder.file, ...mock))[0], /^opened: mock-tx-1$/);
  await run('fund', '--repo', 'o/r', '--issue', '7', '--amount', '12.5', '--keypair', funder.file, ...mock);
  await run('claim', '--repo', 'o/r', '--issue', '7', '--pr', '3', '--wallet', op.address, '--keypair', att.file, ...mock);
  await run('release', '--repo', 'o/r', '--issue', '7', '--pr', '3', '--keypair', att.file, '--approver-key', app.file, '--merged-by-id', '99', ...mock);
  const [line] = await run('show', '--repo', 'o/r', ...mock);
  assert.match(line, new RegExp(`^#7 {2}12\\.5 USDC {2}released {2}expires \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d {2}1 funder {2}PR #3 -> ${op.address} {2}paid 12\\.5`));
  assert.deepEqual(await run('address', '--repo', 'o/r', '--issue', '7', ...mock), [findBountyPda(MOCK_PROGRAM_ID, 'o/r', 7).address]);
});

test('the CLI says what is missing or wrong, and has no mainnet backend', async (t) => {
  const program = process.env.BOUNTY_PROGRAM_ID;
  delete process.env.BOUNTY_PROGRAM_ID;
  t.after(() => program !== undefined && (process.env.BOUNTY_PROGRAM_ID = program));
  await assert.rejects(main(['fund', '--backend', 'mock']), /--mock-file is needed/);
  await assert.rejects(main(['show', '--repo']), /--repo needs a value/);
  await assert.rejects(main(['show', '--repo', 'o/r', '--backend', 'solana-devnet'], () => {}), /--program .* is needed/);
  await assert.rejects(main(['show', '--repo', 'o/r', '--backend', 'solana-mainnet'], () => {}), /unknown backend/);
  assert.equal(await main(['help'], () => {}), 0);
});

test('the CLI runs as a command and exits non-zero on an error', () => {
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
  const help = execFileSync(process.execPath, ['--import', 'tsx', cli, 'help'], { encoding: 'utf8' });
  assert.match(help, /ao-bounty: bounties for GitHub issues/);
  assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', cli, 'nope', '--backend', 'mock', '--mock-file', path.join(tmpdir(), 'x.json')], { stdio: 'pipe' }), (e: any) => e.status === 1 && /unknown command nope/.test(String(e.stderr)));
});
