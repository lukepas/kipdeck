// The page's plain controls: the theme button, Copy, Try the demo, the top bar's backdrop, and the
// magnetic primary button. Each works with a keyboard and without motion.
import { env } from '../engine/env';
import { wait } from './wait';

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

/** Copy buttons: the command, or a note that the browser would not. Copying answers the waiting agent too. */
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
      wait.clear();
      onCopy(btn);
    });
  });
}

/** Try the demo: the hosted demo when the build named one, else the command that runs it from the clone. */
export function tryDemo() {
  const demo = document.querySelector<HTMLAnchorElement>('[data-link="demo"]');
  if (demo?.getAttribute('href') === '#try-demo') {
    demo.addEventListener('click', (e) => {
      e.preventDefault();
      const box = document.getElementById('try-demo')!;
      box.classList.add('shown');
      box.querySelector<HTMLButtonElement>('.copy')?.focus({ preventScroll: true });
    });
  }
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
