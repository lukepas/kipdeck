// What an approval says, worked out from a permission hook's payload: the tool, the command or files,
// where it runs, the risk tags, the rule "Allow always" would add, and the answer as the hook wants it
// back. Pure, so the tests read it directly; server/approvals.ts holds the requests and the inbox's
// Approval card (client/home/approval.ts) shows them.
import type { ApprovalDecision, ApprovalRisk, ApprovalView } from './protocol/approvals.js';

/** The longest reason a deny carries back to the agent. */
export const DENY_REASON_MAX = 2000;

/** The tags in the order a card shows them (the inbox's words for them are in client/home/approval.ts). */
export const RISK_ORDER: readonly ApprovalRisk[] = ['destructive', 'network', 'outside', 'secrets'];

const DESTRUCTIVE: RegExp[] = [
  /\brm\s+(?:-[a-zA-Z]*[rRf][a-zA-Z]*\b|--recursive\b|--force\b)/,
  /\brmdir\b/,
  /\bgit\s+(?:reset\s+--hard|clean\s+-[a-zA-Z]*f|branch\s+-D|checkout\s+--\s|checkout\s+\.|restore\b|stash\s+(?:drop|clear)|filter-branch|filter-repo)/,
  /\bgit\s+push\b.*(?:--force\b|--force-with-lease\b|\s-f\b|--delete\b|\s:\S)/,
  /\b(?:drop|truncate)\s+(?:table|database|schema)\b/i,
  /\b(?:mkfs|shred|fdisk)\b|\bdd\s+if=|\bdiskutil\s+erase/,
  /\bsudo\b/,
  /\bch(?:mod|own)\s+-R\b/,
  /\bfind\b.*\s-delete\b/,
  /\bkill(?:all)?\s+-9\b|\bpkill\b/,
  /\b(?:npm|pnpm|yarn)\s+unpublish\b/,
  /\bdocker\s+(?:rm|rmi|system\s+prune|volume\s+rm)\b/,
  /\b(?:terraform|tofu)\s+(?:apply|destroy)\b|\bkubectl\s+delete\b/,
  /(?:^|[^>])>\s*\/dev\/(?:sd|disk|nvme)/,
];

const NETWORK =
  /\b(?:curl|wget|ssh|scp|sftp|rsync|ncat|nc|telnet|ftp)\b|https?:\/\/|\bgit\s+(?:push|pull|fetch|clone|ls-remote)\b|\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|publish|update|upgrade)\b|\bnpx\s|\bpip3?\s+install\b|\bgh\s+[a-z]|\bdocker\s+(?:pull|push|login)\b|\bbrew\s+install\b|\bcargo\s+(?:install|publish)\b/;

/** Tools that reach the network by themselves. */
const NETWORK_TOOLS = /^(?:WebFetch|WebSearch)$/;

/** Files that usually hold keys or passwords (an example or template .env is left alone). */
const SECRETS =
  /(?:^|[\s/'"=])\.env(?!\.(?:example|sample|template|dist)\b)(?:\.[\w.-]+)?(?=$|[\s'"/;|&)])|\bid_(?:rsa|dsa|ecdsa|ed25519)\b|\.(?:ssh|aws|gnupg)(?:\/|\b)|\.npmrc\b|\.netrc\b|\.pypirc\b|\.docker\/config\.json|\.kube\/config|\.(?:pem|p12|pfx|key)\b|\bcredentials\b|\bsecrets?(?:\.(?:json|ya?ml|toml|env)\b|\/)|\bprintenv\b/i;

/** A shell command, without the quotes round each word. */
const words = (command: string): string[] => command.split(/[\s;|&()<>]+/).map((w) => w.replace(/^['"]+|['"]+$/g, '')).filter(Boolean);

/** `p` made absolute against `cwd` and tidied (`a/./b/../c` is `a/c`), POSIX style; `~` stays as it is. */
export function resolvePath(p: string, cwd: string): string {
  if (p.startsWith('~')) return p;
  const parts = (p.startsWith('/') ? p : `${cwd.replace(/\/+$/, '')}/${p}`).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

/** Whether `p` is somewhere outside `root`. */
function outside(p: string, root: string): boolean {
  if (/^\/dev\/(?:null|std(?:in|out|err)|tty)$/.test(p)) return false;
  if (p.startsWith('~')) return true;
  const r = resolvePath(root, '/');
  const abs = resolvePath(p, r);
  return abs !== r && !abs.startsWith(`${r}/`);
}

/** The paths a shell command names: words that start with /, ~ or .., or carry one after `=`. */
function commandPaths(command: string): string[] {
  const out: string[] = [];
  for (const w of words(command)) {
    const v = w.includes('=') ? w.slice(w.indexOf('=') + 1) : w;
    if (v.includes('://')) continue;
    if (/^(?:\/|~|\.\.(?:\/|$))/.test(v)) out.push(v);
  }
  return out;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/** The files or URL a tool call names. */
export function toolPaths(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['file_path', 'notebook_path', 'path', 'url']) {
    const v = str(input[k]);
    if (v) out.push(v);
  }
  if (Array.isArray(input.edits)) for (const e of input.edits) if (e && typeof e === 'object' && str((e as Record<string, unknown>).file_path)) out.push(String((e as Record<string, unknown>).file_path));
  return [...new Set(out)];
}

/** Why a tool call deserves a second look, in RISK_ORDER. `cwd` is where the agent works. */
export function riskTags(tool: string, input: Record<string, unknown>, cwd?: string): ApprovalRisk[] {
  const command = str(input.command) ?? '';
  const paths = toolPaths(input).filter((p) => !p.includes('://'));
  const found = new Set<ApprovalRisk>();
  if (command && DESTRUCTIVE.some((re) => re.test(command))) found.add('destructive');
  if (NETWORK_TOOLS.test(tool) || (command && NETWORK.test(command))) found.add('network');
  if (cwd && [...paths, ...commandPaths(command)].some((p) => outside(p, cwd))) found.add('outside');
  if ([command, ...paths].some((s) => s && SECRETS.test(s))) found.add('secrets');
  return RISK_ORDER.filter((r) => found.has(r));
}

/** A permission rule as Claude Code writes it: "Bash(npm test:*)", or the tool alone. */
interface Rule {
  toolName: string;
  ruleContent?: string;
}

/** One change to the agent's permissions (Claude Code's PermissionUpdate), kept as it came. */
export type PermissionUpdate = Record<string, unknown>;

/** The words for one permission update. */
function updateLabel(u: PermissionUpdate): string | undefined {
  if ((u.type === 'addRules' || u.type === 'replaceRules') && u.behavior === 'allow' && Array.isArray(u.rules)) {
    const rules = (u.rules as Rule[]).filter((r) => r && typeof r.toolName === 'string').map((r) => (r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName));
    return rules.length ? rules.join(', ') : undefined;
  }
  if (u.type === 'addDirectories' && Array.isArray(u.directories)) return `files in ${(u.directories as unknown[]).filter((d) => typeof d === 'string').join(', ')}`;
  if (u.type === 'setMode' && typeof u.mode === 'string') return u.mode === 'acceptEdits' ? 'every edit this session' : `mode ${u.mode}`;
  return undefined;
}

/**
 * What "Allow always" would add: the rules the agent itself offered for this call (Claude Code's
 * permission_suggestions), else, for a plain shell command, its first two words with anything after
 * ("npm test:*") for this session only. None for anything else: the card then offers no "always".
 */
export function alwaysRules(tool: string, input: Record<string, unknown>, suggestions: unknown): { updates: PermissionUpdate[]; label: string } | undefined {
  const offered = Array.isArray(suggestions) ? suggestions.filter((s): s is PermissionUpdate => !!s && typeof s === 'object') : [];
  const labelled = offered.map((u) => ({ u, label: updateLabel(u) })).filter((x): x is { u: PermissionUpdate; label: string } => !!x.label);
  if (labelled.length) return { updates: labelled.map((x) => x.u), label: labelled.map((x) => x.label).join('; ') };
  const command = str(input.command)?.trim();
  if (tool !== 'Bash' || !command || /[;&|<>`$()\n]/.test(command)) return undefined;
  const prefix = command.split(/\s+/).slice(0, 2).join(' ');
  const rule = { toolName: 'Bash', ruleContent: `${prefix}:*` };
  return { updates: [{ type: 'addRules', rules: [rule], behavior: 'allow', destination: 'session' }], label: `Bash(${rule.ruleContent})` };
}

/** A Claude Code PermissionRequest payload as the inbox shows it, or undefined when it names no tool. */
export function approvalView(payload: unknown, o: { id: string; workerId: string; floor: string; at: number }): { view: ApprovalView; updates?: PermissionUpdate[] } | undefined {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const tool = str(p.tool_name);
  if (!tool) return undefined;
  const input = (p.tool_input && typeof p.tool_input === 'object' ? p.tool_input : {}) as Record<string, unknown>;
  const cwd = str(p.cwd);
  const command = str(input.command);
  const always = alwaysRules(tool, input, p.permission_suggestions);
  const view: ApprovalView = {
    id: o.id,
    title: '',
    workerId: o.workerId,
    floor: o.floor,
    tool: clip(tool, 120),
    ...(command ? { command: clip(command, 2000) } : {}),
    paths: toolPaths(input).slice(0, 5).map((x) => clip(x, 300)),
    ...(str(input.description) ? { description: clip(String(input.description), 300) } : {}),
    ...(cwd ? { cwd: clip(cwd, 300) } : {}),
    risks: riskTags(tool, input, cwd),
    ...(always ? { always: clip(always.label, 200) } : {}),
    at: o.at,
  };
  view.title = approvalTitle(view);
  return { view, updates: always?.updates };
}

/** The same tool call: the tool's name and what it was given, for telling a request's call ran anyway. */
export function sameCall(a: { tool_name?: unknown; tool_input?: unknown }, b: { tool_name?: unknown; tool_input?: unknown }): boolean {
  return a.tool_name === b.tool_name && JSON.stringify(a.tool_input ?? null) === JSON.stringify(b.tool_input ?? null);
}

/** The words a deny without a reason carries back. */
export const DENIED_DEFAULT = 'Denied from the Kipdeck inbox.';

/** The hook's answer as Claude Code reads it off a PermissionRequest hook's output. */
export function claudeDecision(decision: ApprovalDecision, o: { updates?: PermissionUpdate[]; reason?: string } = {}): string {
  const body =
    decision === 'deny'
      ? { behavior: 'deny', message: o.reason?.trim() || DENIED_DEFAULT }
      : { behavior: 'allow', ...(decision === 'always' && o.updates?.length ? { updatedPermissions: o.updates } : {}) };
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: body } });
}

/** `s` cut to `n` characters, with ... when it was longer. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** A card's one-line title: "Run rm -rf dist", "Edit src/app.ts", "Fetch https://...". */
export function approvalTitle(v: Pick<ApprovalView, 'tool' | 'command' | 'paths'>): string {
  const first = v.paths[0];
  if (v.command) return `Run ${clip(v.command.split('\n')[0], 80)}`;
  if (/^(?:Edit|MultiEdit|Write|NotebookEdit)$/.test(v.tool) && first) return `${v.tool === 'Write' ? 'Write' : 'Edit'} ${clip(first, 80)}`;
  if (/^(?:WebFetch)$/.test(v.tool) && first) return `Fetch ${clip(first, 80)}`;
  if (first) return `${v.tool} ${clip(first, 80)}`;
  return `Use ${v.tool}`;
}
