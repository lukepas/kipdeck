/**
 * The bundled action (dist/index.mjs) and the approver's cosign (dist/ao-bounty.mjs) end to end, as
 * separate processes, against solana-test-validator running the built escrow program, with a fake
 * GitHub API on a loopback port. Skips, and says why, without the validator or the built program.
 *
 *   npm run test:e2e          (onchain/solana: npm run build:program first)
 *
 * Every key is made up here; nothing is read from ~/.config/agent-office-chain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  NONCE_ACCOUNT_LEN,
  Rpc,
  SolanaEscrow,
  TEST_MINT,
  TOKEN_PROGRAM_ID,
  addressBytes,
  associatedTokenAddress,
  buildCreateAta,
  buildCreateNonceAccount,
  compileMessage,
  concat,
  keypairFromSeed,
  parseAmount,
  signTransaction,
  u64le,
  type Keypair,
  type TxInstruction,
} from '../../../solana/sdk/src/index.js';

const run = promisify(execFile);
const root = path.join(import.meta.dirname, '..', '..');
const PROGRAM_SO = path.join(root, '..', 'solana', 'target', 'deploy', 'bounty_escrow.so');
const haveValidator = spawnSync('solana-test-validator', ['--version'], { stdio: 'ignore' }).status === 0;
const skip = !haveValidator ? 'solana-test-validator is not on PATH' : !existsSync(PROGRAM_SO) ? 'build the program first: cd onchain/solana && npm run build:program' : false;

const REPO = 'acme/widgets';
const fresh = (): Keypair => keypairFromSeed(randomBytes(32));
const usdc = (n: string) => parseAmount(n, 6);

/** A mint account at the test mint's address, as `--account` loads it: initialized, 6 decimals, `authority` mints. */
function mintDump(authority: string): string {
  const data = new Uint8Array(82);
  data.set([1, 0, 0, 0], 0);
  data.set(addressBytes(authority), 4);
  data[44] = 6;
  data[45] = 1;
  return JSON.stringify({ pubkey: TEST_MINT, account: { lamports: 1_461_600, data: [Buffer.from(data).toString('base64'), 'base64'], owner: TOKEN_PROGRAM_ID, executable: false, rentEpoch: 0, space: 82 } });
}

/** SPL Token MintTo. */
const mintTo = (dest: string, authority: string, amount: bigint): TxInstruction => ({
  programId: TOKEN_PROGRAM_ID,
  keys: [
    { pubkey: TEST_MINT, isSigner: false, isWritable: true },
    { pubkey: dest, isSigner: false, isWritable: true },
    { pubkey: authority, isSigner: true, isWritable: false },
  ],
  data: concat(Uint8Array.of(7), u64le(amount)),
});

interface Pr {
  number: number;
  body: string;
  head: string;
}

/** A GitHub API on loopback: pull requests merged by `maint` (write access), wallets file, comments. */
function fakeGitHub(pulls: Pr[], wallets: Record<string, string>) {
  const comments: { issue: number; body: string }[] = [];
  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== 'Bearer ghs_e2e') return send(401, { message: 'Bad credentials' });
    const url = new URL(req.url ?? '/', 'http://x');
    let m = /^\/repos\/acme\/widgets\/pulls\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const p = pulls.find((x) => x.number === Number(m![1]));
      if (!p) return send(404, {});
      return send(200, {
        number: p.number, state: 'closed', merged: true, merge_commit_sha: 'cd'.repeat(20), merged_by: { login: 'maint', id: 4242, type: 'User' },
        merged_at: '2026-10-04T10:00:00Z', created_at: '2026-10-04T09:00:00Z', user: { login: 'dev-one', id: 777, type: 'User' }, body: p.body,
        html_url: `https://github.com/${REPO}/pull/${p.number}`, base: { ref: 'main', sha: 'base1', repo: { full_name: REPO } }, head: { ref: 'f', repo: { full_name: p.head, fork: false } },
      });
    }
    if (req.method === 'GET' && url.pathname === '/repos/acme/widgets/collaborators/maint/permission') return send(200, { permission: 'write', role_name: 'write' });
    if (req.method === 'GET' && url.pathname === '/repos/acme/widgets/contents/.github/bounty-wallets.json' && url.searchParams.get('ref') === 'base1') {
      return send(200, { type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(wallets)).toString('base64') });
    }
    m = /^\/repos\/acme\/widgets\/issues\/(\d+)\/comments$/.exec(url.pathname);
    if (req.method === 'POST' && m) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        comments.push({ issue: Number(m![1]), body: JSON.parse(body).body });
        send(201, { id: comments.length });
      });
      return;
    }
    send(404, { message: 'Not Found' });
  });
  return { server, comments };
}

async function waitForRpc(rpc: Rpc, validator: ChildProcess, ms: number) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (validator.exitCode !== null) throw new Error(`solana-test-validator exited with ${validator.exitCode}`);
    try {
      if ((await rpc.call<string>('getHealth', [])) === 'ok') return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`solana-test-validator didn't answer in ${ms / 1000}s`);
    await new Promise((ok) => setTimeout(ok, 500));
  }
}

test('the bundled action claims and prepares a release, the approver cosigns it, and an approver key pays in one run', { skip, timeout: 240_000 }, async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bounty-action-e2e-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const [programKey, attester, approver, funder, author, nonceKey] = [fresh(), fresh(), fresh(), fresh(), fresh(), fresh()];
  const programId = programKey.publicKey;
  writeFileSync(path.join(dir, 'mint.json'), mintDump(funder.publicKey));

  const validator = spawn('solana-test-validator', ['--reset', '--quiet', '--ledger', path.join(dir, 'ledger'), '--bind-address', '127.0.0.1', '--rpc-port', String(port), '--faucet-port', String(port + 2), '--gossip-port', String(port + 3), '--dynamic-port-range', `${port + 10}-${port + 60}`, '--bpf-program', programId, PROGRAM_SO, '--account', TEST_MINT, path.join(dir, 'mint.json')], { stdio: 'ignore' });
  t.after(() => validator.kill('SIGKILL'));
  const url = `http://127.0.0.1:${port}`;
  const rpc = new Rpc(url);
  await waitForRpc(rpc, validator, 90_000);

  // Fees for everyone, and 100 test USDC for the funder.
  for (const k of [attester, approver, funder]) {
    const sig = await rpc.call<string>('requestAirdrop', [k.publicKey, 2_000_000_000, { commitment: 'confirmed' }]);
    for (let i = 0; i < 60 && (await rpc.signatureStatus(sig))?.confirmationStatus !== 'confirmed'; i++) await new Promise((ok) => setTimeout(ok, 250));
  }
  const escrow = new SolanaEscrow({ programId, rpc, cluster: 'localnet', mint: TEST_MINT, pollMs: 200 });
  const send = async (ixs: TxInstruction[], signers: Keypair[]) => {
    const { blockhash, lastValidBlockHeight } = await rpc.latestBlockhash();
    const { wire, signature } = signTransaction(compileMessage(signers[0].publicKey, ixs, blockhash), signers);
    await escrow.sendSigned(wire, signature, lastValidBlockHeight);
  };
  await send([buildCreateAta(funder.publicKey, funder.publicKey, TEST_MINT), mintTo(associatedTokenAddress(funder.publicKey, TEST_MINT), funder.publicKey, usdc('100'))], [funder]);
  const rent = BigInt(await rpc.call<number>('getMinimumBalanceForRentExemption', [NONCE_ACCOUNT_LEN]));
  await send(buildCreateNonceAccount(approver.publicKey, nonceKey.publicKey, approver.publicKey, rent), [approver, nonceKey]);

  // Two bounties, opened with the attester and approver the action is configured with.
  const keys = { attester: attester.publicKey, approver: approver.publicKey };
  const expiryTs = (await escrow.now()) + 7 * 86_400;
  for (const [issue, amount] of [[12, '25'], [13, '10']] as const) {
    await escrow.open({ repo: REPO, issue }, { expiryTs, ...keys }, funder);
    await escrow.fund({ repo: REPO, issue, ...keys }, usdc(amount), funder);
  }

  const { server, comments } = fakeGitHub(
    [
      { number: 31, body: 'Closes #12', head: REPO },
      { number: 32, body: 'Fixes #13', head: REPO },
      { number: 33, body: 'Fixes #13', head: 'mallory/widgets' },
    ],
    { 'dev-one': author.publicKey },
  );
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  /** One job running dist/index.mjs, as GitHub would start it. */
  const job = async (pr: number, inputs: Record<string, string>) => {
    const files = { event: path.join(dir, `event-${pr}.json`), output: path.join(dir, `out-${pr}`), summary: path.join(dir, `summary-${pr}.md`) };
    writeFileSync(files.event, JSON.stringify({ action: 'closed', pull_request: { number: pr } }));
    writeFileSync(files.output, '');
    const all = { 'github-token': 'ghs_e2e', cluster: 'localnet', 'rpc-url': url, 'program-id': programId, mint: TEST_MINT, approver: approver.publicKey, 'attester-key': JSON.stringify([...attester.secretKey]), ...inputs };
    const env: Record<string, string> = { PATH: process.env.PATH ?? '', GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: files.event, GITHUB_OUTPUT: files.output, GITHUB_STEP_SUMMARY: files.summary, GITHUB_API_URL: api };
    for (const [k, v] of Object.entries(all)) env[`INPUT_${k.toUpperCase()}`] = v;
    const { stdout } = await run(process.execPath, [path.join(root, 'dist', 'index.mjs')], { env, timeout: 90_000 });
    const out: Record<string, string> = {};
    for (const m of readFileSync(files.output, 'utf8').matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2\n/gm)) out[m[1]] = m[3];
    return { stdout, out, summary: existsSync(files.summary) ? readFileSync(files.summary, 'utf8') : '' };
  };
  const ref12 = { repo: REPO, issue: 12, ...keys };
  const ref13 = { repo: REPO, issue: 13, ...keys };

  // 1. No approver key: the action claims #12 and prepares a release on the approver's nonce.
  const first = await job(31, { 'approver-nonce-account': nonceKey.publicKey });
  assert.equal(first.out.status, 'done', first.stdout);
  assert.equal(first.out.claimed, '1');
  assert.equal(first.out.released, '0');
  assert.ok(first.out['prepared-release'].length > 100);
  // The key shows up once, in the command that masks it, and nowhere else in the log.
  const secret = JSON.stringify([...attester.secretKey]);
  assert.deepEqual(first.stdout.split('\n').filter((l) => l.includes(secret)), [`::add-mask::${secret}`]);
  const claimed = (await escrow.get(ref12))!;
  assert.equal(claimed.state, 'claimed');
  assert.equal(claimed.prNumber, 31);
  assert.equal(claimed.claimantWallet, author.publicKey);
  assert.match(comments.find((c) => c.issue === 31)!.body, /For the approver/);

  // 2. Later, on the approver's machine: check it, then sign and send it.
  const txFile = path.join(dir, 'release.txt');
  writeFileSync(txFile, first.out['prepared-release']);
  const keyFile = path.join(dir, 'approver.json');
  writeFileSync(keyFile, JSON.stringify([...approver.secretKey]), { mode: 0o600 });
  const cosign = (extra: string[]) => run(process.execPath, [path.join(root, 'dist', 'ao-bounty.mjs'), 'cosign', '--tx', `@${txFile}`, '--repo', REPO, '--program', programId, '--backend', 'solana-localnet', '--rpc', url, '--approver-key', keyFile, ...extra], { timeout: 90_000 });
  const look = await cosign([]);
  assert.match(look.stdout, new RegExp(`pays 25 test USDC to ${author.publicKey} for PR #31 on acme/widgets, issue #12`));
  assert.match(look.stdout, /not sent/);
  assert.equal((await escrow.get(ref12))!.state, 'claimed');
  const paid = await cosign(['--yes', 'true']);
  assert.match(paid.stdout, /^released: \w+/m);
  assert.equal((await escrow.get(ref12))!.state, 'released');
  assert.equal(await escrow.balance(author.publicKey), usdc('25'));

  // 3. A fork's merge on #13 is refused, and the chain is left as it was.
  const fork = await job(33, { 'approver-key': JSON.stringify([...approver.secretKey]) });
  assert.equal(fork.out.status, 'refused');
  assert.equal((await escrow.get(ref13))!.state, 'open');

  // 4. With the approver key as a secret, one run claims and pays #13.
  const oneGo = await job(32, { 'approver-key': JSON.stringify([...approver.secretKey]) });
  assert.equal(oneGo.out.status, 'done', oneGo.stdout);
  assert.equal(oneGo.out.claimed, '1');
  assert.equal(oneGo.out.released, '1');
  const b13 = (await escrow.get(ref13))!;
  assert.equal(b13.state, 'released');
  assert.equal(b13.mergeSha, 'cd'.repeat(20));
  assert.equal(await escrow.balance(author.publicKey), usdc('35'));
  assert.match(oneGo.summary, /\*\*#13\*\* \(10 test USDC\): paid to/);
});
