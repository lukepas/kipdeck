// The page's plain controls: the theme button, Copy, Try the demo, the top bar's backdrop, and the
// magnetic primary button. Each works with a keyboard and without motion.
import { env } from '../engine/env';

export function themeButton() {
  const root = document.documentElement;
  document.getElementById('theme')?.addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') === 'dark' || (!root.hasAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode: the choice lasts this visit.
    }
  });
}

/** Says something to a screen reader through the page's one polite live region. */
export function announce(text: string) {
  const el = document.getElementById('announce');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => (el.textContent = text), 30);
}

/** Copy buttons: the command, or a note that the browser would not. Copying answers nothing: only the visitor does. */
export function copyButtons(onCopy: (btn: HTMLElement) => void) {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') ?? '';
      const done = (ok: boolean) => {
        btn.textContent = ok ? 'Copied' : 'Select it';
        announce(ok ? 'Copied to the clipboard.' : 'The browser would not copy. Select the command and copy it.');
        btn.classList.toggle('done', ok);
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('done');
        }, 1600);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
      else done(false);
      onCopy(btn);
    });
  });
}

/** Commands set as their && steps, so a line breaks only between steps (and an address only after
 *  a slash), never inside a word. The text stays the same for copying and for a screen reader. */
export function commandSteps() {
  document.querySelectorAll<HTMLElement>('.cmd-text').forEach((el) => {
    if (el.children.length) return; // the Labs command holds its own buttons
    const steps = (el.textContent ?? '').split(' && ');
    if (steps.length < 2 && !/\/\//.test(steps[0])) return;
    el.replaceChildren(
      ...steps.flatMap((step, i) => {
        const span = document.createElement('span');
        span.className = 'step';
        // A break opportunity after each slash of an address (a <wbr> adds no text).
        step.split(/(?<=\/)(?=[^/])/).forEach((part, k) => {
          if (k) span.append(document.createElement('wbr'));
          span.append(part);
        });
        if (i < steps.length - 1) span.append(' &&');
        return i ? [' ', span] : [span];
      }),
    );
  });
}

/** Try the demo: the hosted demo when the build named one, else it copies the hero's command (the
 *  one that runs the demo) and lights it, so the next step is a paste. */
export function tryDemo() {
  const demo = document.querySelector<HTMLAnchorElement>('[data-link="demo"]');
  if (demo?.getAttribute('href') !== '#try-demo') return;
  demo.addEventListener('click', (e) => {
    e.preventDefault();
    const box = document.getElementById('try-demo')!;
    const copy = [...box.querySelectorAll<HTMLButtonElement>('.copy')].find((b) => b.offsetParent !== null);
    const r = box.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight) box.scrollIntoView({ block: 'center', behavior: env.reduced ? 'auto' : 'smooth' });
    box.classList.remove('lit');
    void box.offsetWidth;
    box.classList.add('lit');
    copy?.focus({ preventScroll: true });
    copy?.click();
  });
}

export function topBar() {
  // A sentinel at the very top of the page, watched, instead of a scroll listener that reads
  // scrollY: reading it inside a scroll can force a layout in the middle of a busy frame.
  const bar = document.getElementById('top')!;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:9px;pointer-events:none';
  document.body.prepend(probe);
  new IntersectionObserver(([e]) => bar.classList.toggle('scrolled', !e.isIntersecting)).observe(probe);
}
/** The primary button leans toward the pointer (fine pointers only, never with less motion). */
export function magnetic() {
  if (!env.finePointer || env.reduced) return;
  document.querySelectorAll<HTMLElement>('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      el.style.transform = `translate(${(x * 8).toFixed(2)}px, ${(y * 6).toFixed(2)}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  });
}
