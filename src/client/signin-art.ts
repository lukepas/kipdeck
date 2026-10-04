// What the sign-in pages (login, join, claim) share besides their sheet: a line drawing of the deck
// plan behind the card (the mission table, four arcs of consoles facing it, the ready line with one
// unit lit Signal orange on it, the column bubbles), and the credit in the footer. Static, drawn once.

const NS = 'http://www.w3.org/2000/svg';

/** One SVG element with its attributes. */
function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** The deck plan, in plan units (1 = 1 m), 36 by 26 like the floor. */
export function deckPlan(): SVGSVGElement {
  // The plan sits right of the middle, so the card on the left leaves the table and the lit unit in view.
  const svg = el('svg', { class: 'plot-art', viewBox: '-34 -16.5 53 33', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' }) as SVGSVGElement;
  const grid = el('g', { class: 'pa-grid' });
  // Past the plan's own box too: the page shows it wherever the window is wider or taller.
  for (let x = -70; x <= 70; x++) grid.append(el('line', { x1: x, y1: -50, x2: x, y2: 50, class: x % 5 ? 'minor' : 'major' }));
  for (let z = -50; z <= 50; z++) grid.append(el('line', { x1: -70, y1: z, x2: 70, y2: z, class: z % 5 ? 'minor' : 'major' }));
  svg.append(grid);
  // The slab, and its column bubbles A-H along the top and 1-6 down the side.
  const deck = el('g', { class: 'pa-deck' });
  deck.append(el('rect', { x: -18, y: -13, width: 36, height: 26, rx: 0.2 }));
  'ABCDEFGH'.split('').forEach((letter, i) => {
    const x = -15.75 + i * 4.5;
    deck.append(el('line', { x1: x, y1: -13, x2: x, y2: 13, class: 'col' }));
    deck.append(el('circle', { cx: x, cy: -14, r: 0.6, class: 'bubble' }));
    const t = el('text', { x, y: -13.78, class: 'bubble-t' });
    t.textContent = letter;
    deck.append(t);
  });
  for (let i = 0; i < 6; i++) {
    const z = -10.8 + i * 4.33;
    deck.append(el('line', { x1: -18, y1: z, x2: 18, y2: z, class: 'col' }));
    deck.append(el('circle', { cx: -19, cy: z, r: 0.6, class: 'bubble' }));
    const t = el('text', { x: -19, y: z + 0.22, class: 'bubble-t' });
    t.textContent = String(i + 1);
    deck.append(t);
  }
  // The mission table and its goal wedges.
  deck.append(el('circle', { cx: 0, cy: 0, r: 3.2, class: 'table' }));
  deck.append(el('circle', { cx: 0, cy: 0, r: 2.2, class: 'table-in' }));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    deck.append(el('line', { x1: 0, y1: 0, x2: Math.cos(a) * 3.2, y2: Math.sin(a) * 3.2, class: 'table-in' }));
  }
  // Four pods: arcs of four consoles at 7.5 m, each turned to face the table, and the ready line inside them.
  for (let pod = 0; pod < 4; pod++) {
    const mid = (pod * Math.PI) / 2 + Math.PI / 4;
    for (let s = 0; s < 4; s++) {
      const a = mid + (s - 1.5) * 0.24;
      const x = Math.cos(a) * 7.5;
      const z = Math.sin(a) * 7.5;
      const deg = (a * 180) / Math.PI + 90;
      deck.append(el('rect', { x: x - 0.8, y: z - 0.35, width: 1.6, height: 0.7, class: 'console', transform: `rotate(${deg} ${x} ${z})` }));
    }
    const r = 4.6;
    const a0 = mid - 0.42;
    const a1 = mid + 0.42;
    deck.append(el('path', { d: `M${Math.cos(a0) * r} ${Math.sin(a0) * r}A${r} ${r} 0 0 1 ${Math.cos(a1) * r} ${Math.sin(a1) * r}`, class: 'ready' }));
    const label = el('text', { x: Math.cos(mid) * 10, y: Math.sin(mid) * 10 + 0.4, class: 'pod-t' });
    label.textContent = 'ABCD'[pod];
    deck.append(label);
  }
  // One unit on the ready line, needs you: the Signal diamond.
  const a = Math.PI / 4 - 0.1;
  const ux = Math.cos(a) * 4.6;
  const uz = Math.sin(a) * 4.6;
  deck.append(el('circle', { cx: ux, cy: uz, r: 1.1, class: 'unit-ring' }));
  deck.append(el('path', { d: `M${ux} ${uz - 0.55}L${ux + 0.55} ${uz}L${ux} ${uz + 0.55}L${ux - 0.55} ${uz}Z`, class: 'unit-needs' }));
  svg.append(deck);
  return svg;
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
  a.textContent = 'Built on agent-office by webdevcody - MIT';
  foot.append(a);
  document.body.append(foot);
}
