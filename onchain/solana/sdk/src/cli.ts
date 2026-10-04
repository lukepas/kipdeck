#!/usr/bin/env node
/**
 * ao-bounty: open, fund, inspect, claim, release and refund bounties from a terminal, on devnet, a
 * local validator, or the mock. `ao-bounty help` lists the commands. Keys are read from files only.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cosignRelease, inspectPreparedRelease } from './cosign.js';
import { DEVNET_USDC_MINT, TEST_MINT, isAddress, readKeypair, type Keypair } from './keys.js';
import { MockEscrow } from './mock.js';
import { SolanaEscrow } from './solana.js';
import { findBountyPda, normalizeRepo } from './layout.js';
import { DEVNET_RPC } from './rpc.js';
import { formatAmount, parseAmount, type Bounty, type BountyEscrow, type BountyRef, type Receipt, type Signer } from './types.js';

export const KEY_DIR = path.join(os.homedir(), '.config', 'agent-office-chain');

const HELP = `ao-bounty: bounties for GitHub issues, paid when a person merges the office's pull request

Usage:
  ao-bounty <command> [options]

Commands:
  show     --repo <owner/name> [--issue <n>]          List a repository's bounties
  open     --repo --issue [--days <n>] --attester <a> --approver <a>
                                                      Open a bounty (default 30 days)
  fund     --repo --issue --amount <usdc>             Put money into an open bounty
  claim    --repo --issue --pr <n> --wallet <a>       Bind a PR and the wallet to pay (attester)
  release  --repo --issue --pr <n> --approver-key <file> [--merge-sha <sha>] [--merged-by-hash <hex>]
                                                      Pay out (attester's key plus approver's key)
  refund   --repo --issue [--funder <a>]              Crank contributions back after expiry
  cancel   --repo --issue [--approver-key <file>]     Call a bounty off (its creator, or the approver)
  address  --repo --issue --attester <a> --approver <a>
                                                      Print a bounty's account address
  cosign   --tx <base64|@file> --approver-key <file> [--repo <owner/name>] [--yes true]
                                                      Check a release the attester prepared (the
                                                      GitHub Action does), then sign and send it as
                                                      the approver; without --yes it only shows it

Options:
  --backend <b>    solana-devnet (default), solana-localnet or mock
  --program <id>   The deployed program (env BOUNTY_PROGRAM_ID)
  --rpc <url>      RPC endpoint (env SOLANA_RPC, default ${DEVNET_RPC}; localnet http://127.0.0.1:8899)
  --keypair <file> Key to sign and pay with (env SOLANA_KEYPAIR, default ${path.join(KEY_DIR, 'solana-attester.json')})
  --mint <a>       The token (default devnet USDC; "test" for the test mint ${TEST_MINT})
  --nonce <n>      Which bounty on the issue (default 0)
  --attester <a>, --approver <a>
                   Which keys the bounty was opened with (both are in its address); needed when
                   another bounty on the issue has the same nonce under other keys
  --mock-file <f>  The mock's state file
`;

type Flags = Record<string, string>;

function parse(argv: string[]): { cmd: string; flags: Flags } {
  const [cmd = 'help', ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`unexpected ${a}`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
    flags[a.slice(2)] = v;
    i++;
  }
  return { cmd, flags };
}

function need(flags: Flags, name: string): string {
  const v = flags[name];
  if (v === undefined) throw new Error(`--${name} is needed`);
  return v;
}

function int(flags: Flags, name: string): number {
  const n = Number(need(flags, name));
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--${name} must be a whole number above zero`);
  return n;
}

function address(flags: Flags, name: string): string {
  const v = need(flags, name);
  if (!isAddress(v)) throw new Error(`--${name} isn't a Solana address`);
  return v;
}

function mintOf(flags: Flags): string {
  const m = flags.mint ?? DEVNET_USDC_MINT;
  return m === 'test' ? TEST_MINT : m;
}

function escrowOf(flags: Flags): BountyEscrow {
  const backend = flags.backend ?? 'solana-devnet';
  if (backend === 'mock') return new MockEscrow({ file: need(flags, 'mock-file') });
  if (backend !== 'solana-devnet' && backend !== 'solana-localnet') throw new Error(`unknown backend ${backend}: solana-devnet, solana-localnet or mock`);
  const programId = flags.program ?? process.env.BOUNTY_PROGRAM_ID;
  if (!programId) throw new Error('--program (or BOUNTY_PROGRAM_ID) is needed: the deployed escrow');
  const cluster = backend === 'solana-localnet' ? 'localnet' : 'devnet';
  const rpc = flags.rpc ?? process.env.SOLANA_RPC ?? (cluster === 'localnet' ? 'http://127.0.0.1:8899' : DEVNET_RPC);
  return new SolanaEscrow({ programId, rpc, cluster, mint: mintOf(flags) });
}

function signer(flags: Flags, escrow: BountyEscrow, name = 'keypair', fallback = path.join(KEY_DIR, 'solana-attester.json')): Signer {
  const file = flags[name] ?? (name === 'keypair' ? process.env.SOLANA_KEYPAIR : undefined) ?? fallback;
  if (escrow.network === 'mock') return { publicKey: readKeypair(file).publicKey };
  return readKeypair(file);
}

function refOf(flags: Flags): BountyRef {
  const keys = flags.attester || flags.approver ? { attester: address(flags, 'attester'), approver: address(flags, 'approver') } : {};
  return { repo: normalizeRepo(need(flags, 'repo')), issue: int(flags, 'issue'), nonce: flags.nonce ? Number(flags.nonce) : 0, ...keys };
}

function describe(b: Bounty, decimals: number, symbol: string): string {
  const when = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');
  const parts = [`#${b.issue}${b.nonce ? `/${b.nonce}` : ''}`, `${formatAmount(b.total, decimals)} ${symbol}`, b.state, `expires ${when(b.expiryTs)}`, `${b.funderCount} funder${b.funderCount === 1 ? '' : 's'}`];
  if (b.prNumber) parts.push(`PR #${b.prNumber} -> ${b.claimantWallet}`);
  if (b.state === 'released' && b.paid !== undefined) parts.push(`paid ${formatAmount(b.paid, decimals)}`);
  parts.push(b.address);
  return parts.join('  ');
}

export async function main(argv: string[], out: (line: string) => void = console.log): Promise<number> {
  const { cmd, flags } = parse(argv);
  if (cmd === 'help' || cmd === '--help') {
    out(HELP);
    return 0;
  }
  const escrow = escrowOf(flags);
  const done = (what: string, r: Receipt) => {
    out(`${what}: ${r.signature}`);
    const link = escrow.explorer(r.signature);
    if (link) out(link);
  };
  switch (cmd) {
    case 'show': {
      const repo = normalizeRepo(need(flags, 'repo'));
      const { decimals, symbol } = await escrow.token();
      const all = (await escrow.list(repo)).filter((b) => !flags.issue || b.issue === Number(flags.issue));
      if (!all.length) out(`no bounties on ${repo}`);
      for (const b of all) out(describe(b, decimals, symbol));
      return 0;
    }
    case 'address': {
      const ref = refOf(flags);
      out(findBountyPda(escrow.programId, ref.repo, ref.issue, ref.nonce ?? 0, { attester: address(flags, 'attester'), approver: address(flags, 'approver') }).address);
      return 0;
    }
    case 'open': {
      const ref = refOf(flags);
      const days = flags.days ? Number(flags.days) : 30;
      const expiryTs = (await escrow.now()) + Math.round(days * 86_400);
      done('opened', await escrow.open(ref, { expiryTs, attester: address(flags, 'attester'), approver: address(flags, 'approver'), mint: mintOf(flags) }, signer(flags, escrow)));
      return 0;
    }
    case 'fund': {
      const ref = refOf(flags);
      const { decimals } = await escrow.token();
      done('funded', await escrow.fund(ref, parseAmount(need(flags, 'amount'), decimals), signer(flags, escrow)));
      return 0;
    }
    case 'claim': {
      done('claimed', await escrow.claim(refOf(flags), { prNumber: int(flags, 'pr'), wallet: address(flags, 'wallet') }, signer(flags, escrow)));
      return 0;
    }
    case 'release': {
      const approver = signer(flags, escrow, 'approver-key', path.join(KEY_DIR, 'solana-approver.json'));
      const by = flags['merged-by-hash'];
      if (by !== undefined && !/^[0-9a-f]{64}$/i.test(by)) throw new Error('--merged-by-hash is 32 bytes of hex (mergedByHash(id, secret))');
      const params = { prNumber: int(flags, 'pr'), mergeSha: flags['merge-sha'], mergedByHash: by };
      done('released', await escrow.release(refOf(flags), params, signer(flags, escrow), approver));
      return 0;
    }
    case 'refund': {
      const ref = refOf(flags);
      const cranker = signer(flags, escrow);
      const funders = flags.funder ? [address(flags, 'funder')] : (await escrow.contributions(ref)).filter((c) => !c.refunded).map((c) => c.funder);
      if (!funders.length) out('nothing left to refund');
      for (const f of funders) done(`refunded ${f}`, await escrow.refund(ref, f, cranker));
      return 0;
    }
    case 'cancel': {
      const approver = flags['approver-key'] ? signer(flags, escrow, 'approver-key') : undefined;
      done('cancelled', await escrow.cancel(refOf(flags), signer(flags, escrow), approver));
      return 0;
    }
    case 'cosign': {
      if (!(escrow instanceof SolanaEscrow)) throw new Error('cosign needs a cluster (solana-devnet or solana-localnet)');
      const tx = need(flags, 'tx');
      const b64 = tx.startsWith('@') ? readFileSync(tx.slice(1), 'utf8') : tx;
      const repo = flags.repo ? normalizeRepo(flags.repo) : undefined;
      const r = await inspectPreparedRelease(escrow, b64, { repo });
      const { decimals, symbol } = await escrow.token();
      out(`pays ${formatAmount(r.amount, decimals)} ${symbol} to ${r.claimant} for PR #${r.prNumber}${repo ? ` on ${repo}` : ''}, issue #${r.bounty.issue}`);
      out(`bounty ${r.bounty.address}, merge ${r.mergeSha ?? 'not recorded'}${r.nonceAccount ? `, durable nonce ${r.nonceAccount}` : ''}`);
      if (flags.yes !== 'true') {
        out('not sent: add --yes true to sign it as the approver and send it');
        return 0;
      }
      const approver = signer(flags, escrow, 'approver-key', path.join(KEY_DIR, 'solana-approver.json')) as Keypair;
      done('released', await cosignRelease(escrow, b64, approver, { repo }));
      return 0;
    }
    default:
      throw new Error(`unknown command ${cmd} (ao-bounty help lists them)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: Error) => {
      console.error(`ao-bounty: ${err.message}`);
      process.exit(1);
    },
  );
}
