// Kip's drawing on the landing page: his body is the one every flat surface draws
// (src/shared/kip-art.ts, the same as the investor deck's deck/site/kip.js); the pictograms over him
// (a heart, a bang, his z's, his chatter) are the landing's own. Only the pictograms' inline style moved
// into the .k-pict class, since the page's Content-Security-Policy blocks style attributes.

export { bodySVG, COLORS, GLOWS } from '../../../../src/shared/kip-art.ts';

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
