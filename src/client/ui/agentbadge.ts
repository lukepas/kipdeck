import { agentBadge, type Nameable } from '../../shared/agentname';
import { h } from './dom';

/**
 * The agent CLI an agent runs, as a small chip beside its name ("Claude Code", "Codex", "Shell"):
 * where a row in a window (Mission control, the Deck's lists) names an agent by its task
 * (shared/agentname.ts). The inbox's rows wear the two-letter mark instead (home/list.ts).
 */
export function agentBadgeChip(a: Pick<Nameable, 'kind' | 'provider'>): HTMLElement {
  const label = agentBadge(a);
  return h('span.agent-badge', { title: `Runs ${label}` }, label);
}
