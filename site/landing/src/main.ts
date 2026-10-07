// Boot: styles, the plain controls, then each section's scene as it comes near the viewport.
// Every section's final, readable state is in the HTML; scripts only add motion and the live wait.
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/story.css';
import './styles/rest.css';
import './styles/motion.css';
import { SCENES } from './scenes/index';
import { mountHero } from './scenes/hero';
import { countUp } from './engine/count';
import { env } from './engine/env';
import { themeButton, copyButtons, tryDemo, topBar, magnetic } from './ui/controls';
import { waitlist } from './ui/waitlist';
import { watchFilm } from './ui/watch';

const root = document.documentElement;
root.classList.add('js');
if (env.reduced) root.classList.add('calm-motion');

themeButton();
topBar();
tryDemo();
waitlist();
watchFilm();
magnetic();

// The hero mounts at once (it is on screen); the rest wait until they are close.
const hero = document.querySelector<HTMLElement>('[data-scene="hero"]');
const heroScene = hero ? (mountHero(hero) as ReturnType<typeof mountHero>) : null;
copyButtons((btn) => {
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
      if (id !== 'hero') SCENES[id]?.(el);
    }
  },
  { rootMargin: '50% 0px' },
);
document.querySelectorAll<HTMLElement>('[data-scene]').forEach((s) => near.observe(s));

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
document.querySelectorAll<HTMLElement>('.label, h2.display, .lede, .measured li, .rv').forEach((el) => {
  if (el.closest('.hero')) return;
  el.classList.add('rv');
  seen.observe(el);
});
