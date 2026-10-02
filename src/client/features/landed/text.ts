import type { Landing } from '../../../shared/protocol';

/** What a milestone says, as a toast and a notification: a title, and what's under it. */
export function landedText(kind: Landing, pr: number | undefined, by: string | undefined, title: string | undefined): { title: string; body: string } {
  if (kind === 'queue') return { title: 'The task queue is done', body: 'Every task on it is finished.' };
  const which = pr === undefined ? 'A pull request' : `PR #${pr}`;
  return { title: `${which} merged${by ? ` by ${by}` : ''}`, body: title ?? '' };
}
