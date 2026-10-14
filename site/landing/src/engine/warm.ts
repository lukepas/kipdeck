// The sections that skip rendering until they come near (content-visibility: auto, styles/perf.css)
// pay for their first style and layout when they arrive: the whole section at once, in the middle of
// a scroll, which on a slow phone is a frame over 50 ms each time one comes in. So once the opening
// has played, each is rendered once while the browser is idle, one section at a time, and handed
// straight back to content-visibility. It is kept for one rendered frame so the browser records its
// real size (the auto keyword): afterwards it skips rendering off screen as before, the scrollbar is
// true from then on, and its arrival costs only what changed since.
//
// Which sections skip is read from the computed style, so styles/perf.css stays the one list.

const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50));

/** Renders each deferred section once, one per idle moment. */
export function warmSections(root: ParentNode = document) {
  const left = [...root.querySelectorAll<HTMLElement>('main > *')].filter((el) => getComputedStyle(el).contentVisibility === 'auto');
  const next = () => {
    const el = left.shift();
    if (!el) return;
    el.classList.add('warming');
    void el.offsetHeight; // its layout, now, in this idle moment
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.classList.remove('warming');
        idle(next);
      }),
    );
  };
  idle(next);
}
