// Boot: styles, the plain controls, then each section's scene as it comes near the viewport.
// Every section's final, readable state is in the HTML; scripts only add motion and the live wait.
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/story.css';
import './styles/rest.css';
import './styles/motion.css';
import './styles/pins.css';
import './styles/loop.css';
import './styles/scenes.css';
import './styles/labs.css';
import './styles/perf.css';
import { SCENES, preloadScenes } from './scenes/index';
import { mountHero } from './scenes/hero';
import { countUp } from './engine/count';
import { env, tier } from './engine/env';
import { themeButton, copyButtons, tryDemo, topBar, magnetic } from './ui/controls';
import { waitlist } from './ui/waitlist';
import { watchFilm } from './ui/watch';
import { soundButton, cue } from './ui/sound';
import { wait } from './ui/wait';
import { steadyAnchors } from './ui/anchors';

const root = document.documentElement;
root.classList.add('js');
if (env.reduced) root.classList.add('calm-motion');
// The scenes read "less motion" once, at boot. If the visitor changes it while the page is open,
// start again in the new mode rather than leave scenes half staged.
try {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => location.reload());
} catch {
  // An old browser without matchMedia events keeps the mode it booted in.
}
// The light tier (Save-Data, low memory, phones) drops what costs the GPU most, like the top bar's blur.
root.classList.add(`tier-${tier}`);

// The hero mounts at once (it is on screen); the rest wait until they are close.
const hero = document.querySelector<HTMLElement>('[data-scene="hero"]');
const heroScene = hero ? (mountHero(hero) as ReturnType<typeof mountHero>) : null;
themeButton();
topBar();
tryDemo();
// What is below the fold or behind a click wires up in the next task, so the opening's first frame
// is not held up by it.
steadyAnchors();
setTimeout(() => {
  waitlist();
  watchFilm();
  magnetic();
  soundButton();
  wait.on((since) => cue(since === null ? 'answer' : 'ask'));
}, 0);
copyButtons((btn) => {
  btn.classList.remove('ping');
  void btn.offsetWidth;
  btn.classList.add('ping');
  const r = btn.getBoundingClientRect();
  heroScene?.attend(r.left + r.width / 2, r.top + r.height / 2);
});

const near = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      near.unobserve(e.target);
      const el = e.target as HTMLElement;
      const id = el.dataset.scene!;
      if (id !== 'hero') void SCENES[id]?.().then((mount) => mount(el));
    }
  },
  { rootMargin: '100% 0px' },
);
const sections = [...document.querySelectorAll<HTMLElement>('[data-scene]')];
sections.forEach((s) => near.observe(s));
// Every other scene's chunk, fetched while the browser is idle once the opening has played, so none
// is fetched as its section arrives. With less motion no scene stages anything, so none is fetched.
if (!env.reduced) addEventListener('load', () => setTimeout(() => preloadScenes(sections.map((s) => s.dataset.scene!)), 2600), { once: true });
// The merge's ring (its canvas, context and compiled program) is made in the first idle moment
// after the opening, while the page is still at its top, so neither a scroll nor the merge pays for it.
if (!env.reduced && tier !== 'min') {
  addEventListener('load', () => setTimeout(() => {
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 0));
    idle(() => void import('./fx/shockwave').then((m) => m.warmShockwave()));
  }, 2900), { once: true });
}

// The hero's facts count up once the headline has landed.
setTimeout(() => document.querySelectorAll<HTMLElement>('.facts [data-count]').forEach((c) => countUp(c, 900)), 900);

// Reveals and counters: once, as each comes into view.
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      seen.unobserve(e.target);
      const el = e.target as HTMLElement;
      el.classList.add('in');
      el.querySelectorAll<HTMLElement>('[data-count]').forEach((c) => countUp(c));
      if (el.matches('[data-count]')) countUp(el);
    }
  },
  { rootMargin: '0px 0px -12% 0px' },
);
document.querySelectorAll<HTMLElement>('.label, h2.display, .lede, .rv').forEach((el) => {
  if (el.closest('.hero')) return;
  el.classList.add('rv');
  seen.observe(el);
});
