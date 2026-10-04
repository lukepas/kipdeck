// What a run tells people: the job summary, the comment on the pull request, and the step outputs.
import type { RunResult } from './run.js';

export interface ReportContext {
  repo: string;
  programId: string;
  cluster: string;
  /** A link to a transaction in an explorer. */
  explorer: (signature: string) => string | undefined;
  /** Where the ao-bounty bundle the approver runs can be fetched from, when known. */
  cosignUrl?: string;
}

const link = (ctx: ReportContext, sig: string) => {
  const url = ctx.explorer(sig);
  return url ? `[${sig.slice(0, 8)}...](${url})` : `\`${sig}\``;
};

/** Markdown for the job summary and the pull request comment. */
export function reportMarkdown(r: RunResult, ctx: ReportContext): string {
  const lines: string[] = [`### Bounty escrow${r.pr ? `: PR #${r.pr}` : ''}`, ''];
  if (r.status !== 'done') {
    lines.push(`${r.status === 'refused' ? 'Not attested' : 'Nothing to do'}: ${r.reason}`);
    return lines.join('\n');
  }
  if (!r.issues.length) lines.push('This pull request closes no issue of this repository, so it claims no bounty.');
  for (const i of r.issues) {
    const head = `- **#${i.issue}**${i.amount ? ` (${i.amount})` : ''}: `;
    if (i.released) lines.push(`${head}paid to \`${i.wallet}\` (${i.walletSource}). Claim ${i.claimed ? link(ctx, i.claimed) : 'made earlier'}, release ${link(ctx, i.released)}.`);
    else if (i.prepared) lines.push(`${head}claimed for \`${i.wallet}\` (${i.walletSource})${i.claimed ? ` in ${link(ctx, i.claimed)}` : ''}. A release signed by the attester waits for the approver (below).`);
    else if (i.wallet) lines.push(`${head}claimed for \`${i.wallet}\` (${i.walletSource})${i.claimed ? ` in ${link(ctx, i.claimed)}` : ''}. ${i.note ?? ''}`.trimEnd());
    else lines.push(`${head}${i.note ?? 'nothing done'}`);
  }
  const waiting = r.issues.filter((i) => i.prepared);
  if (waiting.length) {
    const tool = ctx.cosignUrl ? `[\`ao-bounty.mjs\`](${ctx.cosignUrl})` : '`onchain/action/dist/ao-bounty.mjs`';
    lines.push(
      '',
      `**For the approver.** Each release below waits on your durable nonce, so it stays valid until you send it (or anything else that advances that nonce). Save one to \`release.txt\`, check it with ${tool} (Node 20 or later, nothing to install), then send it:`,
      '',
      '```sh',
      `node ao-bounty.mjs cosign --tx @release.txt --repo ${ctx.repo} --program ${ctx.programId} --backend solana-${ctx.cluster} --approver-key ~/.config/agent-office-chain/solana-approver.json`,
      `node ao-bounty.mjs cosign --tx @release.txt --repo ${ctx.repo} --program ${ctx.programId} --backend solana-${ctx.cluster} --approver-key ~/.config/agent-office-chain/solana-approver.json --yes true`,
      '```',
      '',
      'The first command only shows what it pays and to whom; it reads the bounty from the chain and refuses a transaction that does anything else. Sending one release advances the nonce, so any other waiting release goes stale: re-run this workflow (Actions, Run workflow, with the PR number) to prepare it again.',
    );
    for (const i of waiting) lines.push('', `<details><summary>Release for #${i.issue} (nonce account ${i.nonceAccount})</summary>`, '', '```', i.prepared!, '```', '', '</details>');
  }
  if (r.attestation) lines.push('', `Proof of Merge on Base Sepolia: [${r.attestation.uid.slice(0, 10)}...](${r.attestation.link})`);
  return lines.join('\n');
}

/** Whether the run did something worth a comment on the pull request. */
export function worthAComment(r: RunResult): boolean {
  return r.status === 'done' && r.issues.some((i) => i.bounty);
}

/** The step outputs. */
export function outputsOf(r: RunResult): Record<string, string> {
  const prepared = r.issues.find((i) => i.prepared)?.prepared ?? '';
  return {
    status: r.status,
    pr: r.pr ? String(r.pr) : '',
    claimed: String(r.issues.filter((i) => i.claimed).length),
    released: String(r.issues.filter((i) => i.released).length),
    'prepared-release': prepared,
    'attestation-uid': r.attestation?.uid ?? '',
    result: JSON.stringify({ status: r.status, reason: r.reason, pr: r.pr, issues: r.issues, attestation: r.attestation }),
  };
}

/** GITHUB_OUTPUT's multi-line form: name<<delimiter, the value, the delimiter. */
export function outputFile(values: Record<string, string>, delimiter: string): string {
  return Object.entries(values)
    .map(([k, v]) => {
      if (v.includes(delimiter)) throw new Error(`the output ${k} contains its delimiter`);
      return `${k}<<${delimiter}\n${v}\n${delimiter}\n`;
    })
    .join('');
}
