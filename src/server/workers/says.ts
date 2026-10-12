// What the agent manager says about an agent in a toast or its terminal, naming it the one way every
// surface does (shared/agentname.ts): by its task, or by its CLI before it has one. Kept here so
// manager.ts, acp.ts and terminal.ts share the words.
import { agentBadge, agentRef } from '../../shared/agentname.js';
import { NAV } from '../../shared/copy.js';
import type { WorkerInfo } from '../../shared/protocol.js';

/** Why an agent whose owner isn't signed in to Claude didn't start. */
export function signInNeeded(info: WorkerInfo): string {
  return `whoever deployed ${agentRef(info)} (${info.createdBy}) isn't signed in to Claude - they can sign in under ${NAV.signins}, then press R here`;
}

/** The toast when a conversation Claude no longer has couldn't be picked up again. */
export function resumeFailed(info: WorkerInfo): string {
  return `The last conversation of ${agentRef(info)} couldn't be resumed - starting a fresh one`;
}

/** The dim line its terminal ends with when it exits: "[Claude Code exited with code 1 - press R to resume]". */
export function exitedLine(info: WorkerInfo, code: number, hint: string): string {
  return `\r\n\x1b[2m[${agentBadge(info)} exited with code ${code}${hint}]\x1b[0m\r\n`;
}

/**
 * What prompting an agent that isn't running returns. Callers compare against it to wake the agent
 * with the prompt instead (gate, mission, the HTTP actions), so it lives here once.
 */
export const NOT_RUNNING = 'That agent is not running';

/** What a browser opening the terminal of an agent that isn't running sees first. */
export function notRunning(info: WorkerInfo, hint: string): string {
  return `\x1b[2m${agentBadge(info)} is not running.${hint}\x1b[0m\r\n`;
}
