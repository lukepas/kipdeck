// Branches and worktrees in the Rundown window: the default branch along the bottom, each branch a lane
// forking off where it left it, ahead and behind, a worktree's unit by it (shared/rundown/branches.ts).
import { laneLayout } from '../../../shared/rundown/branches';
import type { GitFacts } from '../../../shared/rundown/schema';
import { h } from '../dom';
import { s } from './svg';

export function branchLanes(git: GitFacts, def: string | null, now: Date): HTMLElement {
  const L = laneLayout(git.branches, def, git.worktrees, now);
  const X0 = 16;
  const X1 = 420;
  const RH = 26;
  const n = L.lanes.length;
  const svg = s('svg', { class: 'rd-lanes', viewBox: `0 0 900 ${16 + n * RH}`, role: 'img', 'aria-label': `Branches off ${def ?? 'the default branch'}` });
  const x = (u: number) => X0 + u * (X1 - X0);
  const baseY = 14 + (n - 1) * RH;
  L.lanes.forEach((l, i) => {
    const y = l.isDefault ? baseY : 14 + (n - 1 - i) * RH;
    const cls = l.isDefault ? 'ln def' : l.merged ? 'ln mg' : 'ln';
    const end = l.isDefault ? x(l.to) : Math.max(x(l.to), x(l.from) + 22);
    if (!l.isDefault) svg.append(s('path', { class: cls, d: `M${x(l.from)} ${baseY} C ${x(l.from) + 14} ${baseY}, ${x(l.from) + 4} ${y}, ${x(l.from) + 18} ${y}` }));
    svg.append(s('line', { class: cls, x1: l.isDefault ? x(0) : x(l.from) + 18, y1: y, x2: end, y2: y }), s('circle', { class: l.isDefault ? 'tip def' : 'tip', cx: end, cy: y, r: 4 }));
    const meta = `${l.isDefault ? '' : `+${l.ahead} / -${l.behind} · `}${l.date.slice(0, 10)}${l.merged && !l.isDefault ? ' · merged' : ''}`;
    svg.append(s('text', { x: X1 + 14, y: y + 4, class: l.merged && !l.isDefault ? 'mg' : '' }, l.name.length > 32 ? `${l.name.slice(0, 29)}...` : l.name, s('tspan', { class: 'meta' }, `  ${meta}`), l.worktree ? s('tspan', { class: 'wt' }, `  worktree${l.worktree.owner ? ` ${l.worktree.owner}` : ''}`) : null));
  });
  return h('div.rd-scroll', {}, svg, L.rest.length ? h('p.rd-note', {}, `And ${L.rest.length} more: ${L.rest.map((b) => b.name).join(', ')}`) : null);
}
