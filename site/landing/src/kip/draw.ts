// Kip's drawing, the same as the investor deck's (deck/site/kip.js): cream fur, tall leaf
// ears, a quilted slate vest, a knitted scarf and the merge wand (a short rod tipped with the
// Kipdeck chevron, brand green or teal). One inline SVG, viewBox 0 0 100 130, feet on y=128.
// The paths, colours and pivots are copied as they are; only the pictograms' inline style moved
// into the .k-pict class, since the page's Content-Security-Policy blocks style attributes.

export const COLORS: Record<string, string> = { rose: '#F3A6BC', pink: '#FF2E63', cyan: '#2DD4D4', teal: '#2DD4D4', amber: '#FFB020', green: '#3DDC97' };
export const GLOWS = ['green', 'teal'] as const;

export function bodySVG(id: number, scarf?: string): string {
  const sc = scarf === 'amber' ? '#D9A24A' : 'var(--kip-knit)';
  const scD = scarf === 'amber' ? '#B9832F' : '#6F7C91';
  const defs = GLOWS.map((g) => {
    const c = COLORS[g];
    return `<radialGradient id="kg-${g}-${id}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".45" stop-color="${c}" stop-opacity=".38"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  }).join('');
  // The Sprig: a short merge wand held up and forward from the paw, tipped with the Kipdeck chevron.
  // Per colour: a faint halo (stacked translucent strokes at 35%, no filter), a coloured stroke, the
  // chevron and a small tip glow. The white core sits on top.
  const ROD = 'x1="70.5" y1="90" x2="78.6" y2="77.4"';
  const CHEV = 'M75.1 77.3 L79.8 75.55 L80.2 80.5';
  const rod = GLOWS.map((g) => {
    const c = COLORS[g];
    return `<g class="k-g-${g}" opacity="0"><g opacity=".35"><g class="k-halo">` +
      `<line ${ROD} stroke="${c}" stroke-width="11" stroke-linecap="round" opacity=".14"/>` +
      `<line ${ROD} stroke="${c}" stroke-width="7" stroke-linecap="round" opacity=".3"/></g></g>` +
      `<line ${ROD} stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="${CHEV}" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }).join('');
  const glow = GLOWS.map((g) => `<circle class="k-g-${g}" cx="79" cy="76.5" r="7" fill="url(#kg-${g}-${id})" opacity="0"/>`).join('');
  // The pennant for flag(): drawn in a frame turned to the rod (32.7 deg), so it flies level when the
  // rod stands upright. Hidden unless the flag beat shows it.
  const pennant = '<g class="k-pennant" opacity="0" transform="rotate(32.7 79.8 75.55)"><g class="k-pen">' +
    '<path class="o" d="M79.8 75.55 l14 5 l-14 5 Z" fill="#3DDC97"/>' +
    '<path d="M81 78 l7.5 2.6" stroke="#F6EEDF" stroke-width="1" stroke-linecap="round" opacity=".7"/></g></g>';
  // Light trail for carry runs: ghost copies of the rod trailing straight back.
  const trail = '<g class="k-trail" opacity="0">' +
    `<use href="#kr-${id}" transform="translate(-19 1)" opacity=".14"/>` +
    `<use href="#kr-${id}" transform="translate(-12.5 .6)" opacity=".28"/>` +
    `<use href="#kr-${id}" transform="translate(-6 .3)" opacity=".5"/></g>`;
  const sprig = `<g class="k-sprig">${trail}<g id="kr-${id}">${rod}` +
    `<line class="k-leaf" ${ROD} stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>` +
    `<path d="${CHEV}" stroke="#FFFFFF" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>` +
    `<g class="k-glow" opacity=".7">${glow}</g>${pennant}` +
    '<path class="o" d="M67.6 100.5 L71.4 89.5" stroke="var(--kip-wood)" stroke-width="3.4" stroke-linecap="round"/>' +
    '<path d="M68.4 95.2 L70.6 96" stroke="var(--kip-slate)" stroke-width="2.2"/></g>';
  const eye = (x: number) => `<circle cx="${x}" cy="52" r="6.6" fill="var(--kip-iris)" stroke="var(--kip-pupil)" stroke-width=".8"/>`;
  const pupil = (x: number, side: string) =>
    `<g class="k-pupil${side}"><circle cx="${x}" cy="52" r="3.6" fill="var(--kip-pupil)"/><circle cx="${x + 2}" cy="49.8" r="1.9" fill="var(--kip-glint)"/><circle cx="${x - 2}" cy="54.2" r=".8" fill="var(--kip-glint)"/></g>`;
  const lids = (x: number, side: string) =>
    `<path class="k-lid${side}" d="M${x - 7} 45 H${x + 7} V51 A7 7 0 0 1 ${x - 7} 51 Z" fill="var(--kip-fur)"/>` +
    `<path class="k-low${side}" d="M${x - 7} 59 V53 A7 7 0 0 1 ${x + 7} 53 V59 Z" fill="var(--kip-fur)"/>`;
  const ear = (bx: number, rot: number, side: string) => {
    const t = `transform="rotate(${rot} ${bx} 37)"`;
    return `<g class="k-ear${side}">` +
      `<path class="o" ${t} d="M${bx - 5.4} 15 C${bx - 7.5} 20 ${bx - 7.5} 30 ${bx} 37 C${bx + 7.5} 30 ${bx + 7.5} 20 ${bx + 5.4} 15" fill="var(--kip-fur)"/>` +
      `<ellipse class="k-in${side}" ${t} cx="${bx}" cy="24" rx="3.5" ry="9" fill="var(--kip-knit)"/>` +
      `<g class="k-tip${side}"><path class="o" ${t} d="M${bx - 5.8} 17 C${bx - 5.4} 10 ${bx - 3} 6 ${bx} 4 C${bx + 3} 6 ${bx + 5.4} 10 ${bx + 5.8} 17" fill="var(--kip-fur)"/></g>` +
      '</g>';
  };
  const limb = (x1: number, y1: number, x2: number, y2: number) => {
    const d = `M${x1} ${y1} L${x2} ${y2}`;
    return `<path d="${d}" stroke="var(--kip-ink)" stroke-width="10.6" stroke-linecap="round"/><path d="${d}" stroke="var(--kip-fur)" stroke-width="9" stroke-linecap="round"/>`;
  };
  const paw = (x: number) =>
    `<circle class="o" cx="${x}" cy="97" r="7" fill="var(--kip-vest)"/><path d="M${x - 5.2} 92.6 Q${x} 89.6 ${x + 5.2} 92.6" stroke="var(--kip-belly)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 130" aria-hidden="true" focusable="false"><defs>${defs}</defs>` +
    '<g class="k-root">' +
      '<g class="k-fx-g"><g class="k-speed" opacity="0"><path d="M2 84 H18 M-2 94 H14 M4 104 H16" stroke="var(--kip-knit)" stroke-width="2" stroke-linecap="round"/></g>' +
      '<g class="k-dust" opacity="0"><circle cx="22" cy="126" r="4" fill="var(--kip-tan)" opacity=".55"/><circle cx="14" cy="122" r="3" fill="var(--kip-tan)" opacity=".4"/><circle cx="8" cy="127" r="2.4" fill="var(--kip-tan)" opacity=".3"/></g></g>' +
      `<g class="k-scarf-tails"><path d="M60 75 C68 73 74 75 80 70" stroke="var(--kip-ink)" stroke-width="5.6" stroke-linecap="round" fill="none"/><path d="M60 75 C68 73 74 75 80 70" stroke="${sc}" stroke-width="4.2" stroke-linecap="round" fill="none"/>` +
        `<path d="M60 77 C67 78 73 81 79 78" stroke="var(--kip-ink)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M60 77 C67 78 73 81 79 78" stroke="${scD}" stroke-width="3.6" stroke-linecap="round" fill="none"/></g>` +
      '<g class="k-tail"><circle class="o" cx="68" cy="111" r="6" fill="var(--kip-fur)"/><circle class="o" cx="72.5" cy="106.5" r="5" fill="var(--kip-fur)"/><circle class="o" cx="75.5" cy="102.5" r="4" fill="var(--kip-belly)"/></g>' +
      '<g class="k-legL"><rect class="o" x="34" y="106" width="8" height="18" rx="3" fill="var(--kip-slate)"/><ellipse class="o" cx="38" cy="124" rx="9" ry="5.5" fill="var(--kip-slate)"/></g>' +
      '<g class="k-legR"><rect class="o" x="58" y="106" width="8" height="18" rx="3" fill="var(--kip-slate)"/><ellipse class="o" cx="62" cy="124" rx="9" ry="5.5" fill="var(--kip-slate)"/></g>' +
      `<g class="k-armL">${limb(35, 80, 31, 95)}${paw(31)}</g>` +
      '<g class="k-torso">' +
        '<path class="o" d="M50 73 C64 73 70 92 68 102 C66 110 58 112 50 112 C42 112 34 110 32 102 C30 92 36 73 50 73Z" fill="var(--kip-vest)"/>' +
        '<path d="M38 84 L42 97 M35.5 94 L39.5 106 M62 84 L58 97 M64.5 94 L60.5 106" stroke="var(--kip-vest-dark)" stroke-width=".9"/>' +
        '<path d="M44 74 C44 88 41 100 38.5 110.5 C42 111.8 46 112 50 112 C54 112 58 111.8 61.5 110.5 C59 100 56 88 56 74 Z" fill="var(--kip-fur)"/>' +
        '<ellipse cx="50" cy="100" rx="10" ry="10" fill="var(--kip-belly)"/>' +
        '<path d="M44 74 C44 88 41 100 38.5 110.5 M56 74 C56 88 59 100 61.5 110.5" stroke="var(--kip-vest-dark)" stroke-width="1.3" fill="none"/>' +
        '<rect x="33.6" y="98" width="6" height="4.6" rx="1" fill="var(--kip-vest-dark)"/><rect x="60.4" y="98" width="6" height="4.6" rx="1" fill="var(--kip-vest-dark)"/>' +
        '<circle cx="43.6" cy="90" r="1.6" fill="var(--kip-brass)"/><circle cx="58.6" cy="88" r="2.6" fill="var(--kip-slate)" stroke="var(--kip-brass)" stroke-width=".8"/>' +
      '</g>' +
      `<g class="k-scarf"><ellipse class="o" cx="50" cy="75" rx="13" ry="4.5" fill="${sc}"/>` +
        '<path d="M40.5 72 V78 M45.5 70.8 V79.3 M50.5 70.6 V79.4 M55.5 70.9 V79.2" stroke="var(--kip-belly)" stroke-width="1.5" opacity=".85"/>' +
        '<path d="M38 77.5 Q50 81.5 62 77.5" stroke="var(--kip-tan)" stroke-width=".9" fill="none"/>' +
        `<rect class="o" x="57" y="77" width="6" height="13" rx="2" transform="rotate(12 60 77)" fill="${sc}"/>` +
        '<path d="M56.3 84 L62 85.2" stroke="var(--kip-belly)" stroke-width="1.4" transform="rotate(12 60 77)"/>' +
        `<circle class="o" cx="60" cy="76" r="4.5" fill="${sc}"/></g>` +
      '<g class="k-head"><g class="k-look">' +
        ear(39, -15, 'L') + ear(61, 15, 'R') +
        '<ellipse class="o" cx="50" cy="54.5" rx="24" ry="21" fill="var(--kip-fur)"/>' +
        '<g class="k-tuft"><path d="M50 35 C47 30 48.5 26 51.5 24" stroke="var(--kip-ink)" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M50 35 C47 30 48.5 26 51.5 24" stroke="var(--kip-fur)" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle class="o" cx="53" cy="22" r="2.7" fill="var(--kip-tan)"/></g>' +
        '<g class="k-face">' +
          '<ellipse cx="50" cy="64.5" rx="11" ry="6.8" fill="var(--kip-belly)"/>' +
          '<circle cx="36" cy="60" r=".8" fill="var(--kip-tan)"/><circle cx="38.6" cy="61.6" r=".8" fill="var(--kip-tan)"/><circle cx="41.2" cy="60.2" r=".8" fill="var(--kip-tan)"/>' +
          '<circle cx="64" cy="60" r=".8" fill="var(--kip-tan)"/><circle cx="61.4" cy="61.6" r=".8" fill="var(--kip-tan)"/><circle cx="58.8" cy="60.2" r=".8" fill="var(--kip-tan)"/>' +
          eye(40) + eye(60) +
          `<g class="k-pupils">${pupil(40, 'L')}${pupil(60, 'R')}</g>` +
          lids(40, 'L') + lids(60, 'R') +
          '<ellipse cx="50" cy="61" rx="3.3" ry="2" fill="var(--kip-slate)"/>' +
          '<path class="k-mouth" d="M46.6 66.2 Q50 69.4 53.4 66.2" stroke="var(--kip-slate)" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
          '<ellipse class="k-mouthO" cx="50" cy="67.6" rx="2.6" ry="2.4" fill="#5A2F35" opacity="0"/>' +
        '</g>' +
      '</g></g>' +
      `<g class="k-armR">${sprig}${limb(65, 80, 69, 95)}${paw(69)}</g>` +
    '</g></svg>';
}

/** Pictograms live outside the flip, so they never read mirrored. Shapes only, never words. */
export function pictSVG(): string {
  const z = (c: string, x: number, y: number, s: number) =>
    `<g class="k-${c}" opacity="0"><path transform="translate(${x} ${y}) scale(${s})" d="M0 0 H6 L0 7 H6" stroke="var(--kip-knit)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return '<svg class="k-pict" viewBox="0 0 100 130" aria-hidden="true" focusable="false">' +
    '<g class="k-heart" opacity="0"><path d="M50 16 C42 10 42 2 47 2 C49 2 50 4 50 5 C50 4 51 2 53 2 C58 2 58 10 50 16Z" fill="#FF2E63"/></g>' +
    '<g class="k-bang" opacity="0"><rect x="76" y="2" width="4.4" height="13" rx="2.2" fill="#FF2E63"/><circle cx="78.2" cy="20" r="2.4" fill="#FF2E63"/></g>' +
    z('z1', 72, 30, 1) + z('z2', 80, 18, 1.3) + z('z3', 90, 4, 1.6) +
    '<g class="k-talk" opacity="0"><path d="M80 34 l8 -5 M82 42 h10 M80 50 l8 5" stroke="var(--kip-knit)" stroke-width="2" stroke-linecap="round"/></g>' +
    '</svg>';
}
