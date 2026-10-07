// In-page jumps (the top bar's links, the footer's, the skip link) that land where they aim. The
// sections between here and there may not have rendered yet (content-visibility holds an estimated
// size for each until it has), and once they render at their real size the target can drift. So
// after a jump the target is checked a few times as those sections settle, and put back in place.

/** How far the target may sit from where it should be before it is put back (px). */
const SLACK = 8;

export function steadyAnchors() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
    const id = link?.getAttribute('href')?.slice(1);
    if (!id || id === 'try-demo') return;
    const target = document.getElementById(id);
    if (!target) return;
    const want = () => parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    let checks = 0;
    const settle = () => {
      if (Math.abs(target.getBoundingClientRect().top - want()) > SLACK) target.scrollIntoView({ block: 'start', behavior: 'instant' });
      if (++checks < 4) setTimeout(settle, 200 * checks);
    };
    requestAnimationFrame(() => requestAnimationFrame(settle));
  });
}
