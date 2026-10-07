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

/** Copy buttons: the command, or a note that the browser would not. Copying answers the waiting agent too. */
export function copyButtons(onCopy: (btn: HTMLElement) => void) {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') ?? '';
      const done = (ok: boolean) => {
        btn.textContent = ok ? 'Copied' : 'Select it';
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
  const bar = document.getElementById('top')!;
  let on = false;
  const check = () => {
    const next = window.scrollY > 8;
    if (next !== on) bar.classList.toggle('scrolled', (on = next));
  };
  addEventListener('scroll', check, { passive: true });
  check();
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
