// What the sign-in pages (login, join, claim) share besides their sheet: the deck plan behind the
// card, drawn by the same Plot the 2D view uses (shared/plot.ts), with a few units at their consoles
// and one lit Signal orange on the ready line; and the credit in the footer. Static, drawn once.
import { UPSTREAM_CREDIT } from '../shared/copy';
import { Plot } from './shared/plot';

/** The deck plan as the sign-in pages show it. */
export function deckPlan(): SVGSVGElement {
  const plot = new Plot({ kind: 'art', milestones: [{ done: true }, { done: true }, { done: false, active: true }, { done: false }], deck: 'Deck 1' });
  plot.setUnits([
    { id: 'u1', deskId: 'desk-6', name: '', level: 'needs-you' },
    { id: 'u2', deskId: 'desk-11', name: '', level: 'review' },
    { id: 'u3', deskId: 'desk-1', name: '', level: 'working' },
    { id: 'u4', deskId: 'desk-3', name: '', level: 'working' },
    { id: 'u5', deskId: 'desk-8', name: '', level: 'working' },
    { id: 'u6', deskId: 'desk-10', name: '', level: 'working' },
    { id: 'u7', deskId: 'desk-14', name: '', level: 'working' },
    { id: 'u8', deskId: 'desk-15', name: '', level: 'working' },
  ]);
  return plot.el;
}

/** Puts the deck plan behind the page, and the credit under it. */
export function mountSigninArt() {
  document.body.prepend(deckPlan());
  const foot = document.createElement('footer');
  foot.className = 'credit';
  const a = document.createElement('a');
  a.href = 'https://github.com/AgentSystemLabs/agent-office';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = UPSTREAM_CREDIT;
  foot.append(a);
  document.body.append(foot);
}
