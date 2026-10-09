// What an agent asks, when its hook names only the tool it asks with. Codex's request_user_input (and a
// Claude Code AskUserQuestion without its questions) say nothing of the question, so every view showed
// "Needs an answer" at best. The question is on its terminal, though: read it there, the way the 2D
// inbox's question card does (shared/question.ts), and keep it as the worker's activity, so the
// ranking, the callouts over the units, the rail and the alerts all say it in words. Pure.
import { spokenActivity } from '../../shared/attention.js';
import { readQuestion } from '../../shared/question.js';
import type { WorkerStatus } from '../../shared/protocol.js';

/** The most characters of the question kept as the activity (the hooks' own limit, see providers/claude.ts). */
export const ASKED_MAX = 80;

/**
 * The question on `screen` (the terminal's visible text) for a worker that needs an answer and has
 * nothing in words yet (no activity, or only the asking tool's name), cut to ASKED_MAX characters.
 * Undefined when it doesn't need one, already says what it asks, or nothing on screen reads as a question.
 */
export function askedOnScreen(status: WorkerStatus, activity: string | undefined, screen: string): string | undefined {
  if (status !== 'needs_input' || spokenActivity(activity) !== undefined) return undefined;
  const q = readQuestion(screen.split('\n'));
  const text = q?.text.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > ASKED_MAX ? `${text.slice(0, ASKED_MAX - 3).trimEnd()}...` : text;
}
