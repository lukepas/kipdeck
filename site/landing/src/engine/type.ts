// A typewriter: text arrives a character at a time, at a person's pace, with a caret while it
// types. Used where something is being said (an agent's question arriving). The element keeps its
// box (callers type into a single line that truncates), so typing never moves the layout.
import { every } from './loop';

export function typeInto(el: HTMLElement, text: string, cps = 48): Promise<void> {
  el.classList.add('typing');
  const start = performance.now();
  return new Promise((resolve) => {
    let shown = -1;
    const stop = every({
      write(_dt, now) {
        const n = Math.min(text.length, Math.floor(((now - start) / 1000) * cps));
        if (n !== shown) el.textContent = text.slice(0, (shown = n));
        if (n >= text.length) {
          stop();
          el.classList.remove('typing');
          resolve();
        }
      },
    });
  });
}
