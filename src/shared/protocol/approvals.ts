// Approvals: an agent asking permission to run a tool, taken from its CLI's permission hook (Claude
// Code's PermissionRequest) rather than read off its screen. Each request has an id, and an answer
// names that id, so an answer can only ever reach the request it was given for (see server/approvals.ts).

/** Why a request deserves a second look (shared/approval.ts riskTags). */
export type ApprovalRisk = 'destructive' | 'network' | 'outside' | 'secrets';

/** One open permission request, as the inbox shows it. */
export interface ApprovalView {
  /** The request's own id: an answer names it, and an answer to a request that's gone is refused. */
  id: string;
  workerId: string;
  floor: string;
  /** What it wants in a few words: "Run rm -rf dist", "Edit src/app.ts" (shared/approval.ts approvalTitle). */
  title: string;
  /** The tool it wants to run: "Bash", "Edit", "WebFetch", an MCP tool's name. */
  tool: string;
  /** The command it wants to run, for a shell tool. */
  command?: string;
  /** The files or URL it names. */
  paths: string[];
  /** What it says the call is for, when it says. */
  description?: string;
  /** Where it runs (the agent's working folder). */
  cwd?: string;
  risks: ApprovalRisk[];
  /** The rule "Allow always" adds ("Bash(npm test:*)"); none when the agent offers no rule for this call. */
  always?: string;
  at: number;
}

/** How a request was answered: allow just this call, allow it and every call like it, or say no. */
export type ApprovalDecision = 'once' | 'always' | 'deny';

export type ApprovalsClientMsg =
  /** The open requests, and keep me told: answered with 'approvals'. The inbox sends it on each welcome. */
  | { t: 'approvals.get' }
  /**
   * Answers request `id`. 'deny' carries `reason` back to the agent. 'release' hands the request back
   * to the agent's own terminal prompt, for someone who'd rather answer there.
   */
  | { t: 'approval.answer'; id: string; decision: ApprovalDecision | 'release'; reason?: string };

export type ApprovalsServerMsg =
  /** Every open request, whenever one opens or goes (sent to everyone who asked with 'approvals.get'). */
  { t: 'approvals'; items: ApprovalView[] };
