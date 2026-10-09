// 10 Teams and the ask. A line runs down the middle like a zipper (one product, split into a free
// and a paid side) and each plan's top rule draws; both plans are readable the whole time. The five
// design-partner seats appear as empty diamonds: nobody has
// taken one yet, and the page says so. Pointing at or focusing "Apply as a design partner" (or the
// Team waitlist's email field, in a build that has one) pulls the dot grid behind it toward it. A
// join that really went through re-forms the agents into Kip's mark over the seats (the
// March to the Mark), sends a ring out, and fills a seat; nothing plays for a join that was not sent.
import { env, tier, token } from '../engine/env';
import { Spring } from '../engine/spring';
import { every } from '../engine/loop';
import { march } from '../fx/march';
import { shockwave } from '../fx/shockwave';
import { onArrive } from '../engine/arrive';

export function mountTeams(section: HTMLElement) {
  if (env.reduced) return;
  const plans = section.querySelector<HTMLElement>('.plans')!;
  const seats = section.querySelector<HTMLElement>('.seats')!;
  const ask = section.querySelector<HTMLElement>('.ask')!;
  const apply = section.querySelector<HTMLElement>('.apply-link');
  const input = section.querySelector<HTMLInputElement>('#email');
  // What the grid leans toward: the email field when the waitlist is shown, else the apply link.
  const target = () => (input && input.offsetParent !== null ? input : apply);

  plans.classList.add('staged');
  seats.classList.add('staged');
  onArrive(plans, () => plans.classList.add('go'));
  onArrive(seats, () => seats.classList.add('go'), 0.85);

  // ---- The dot grid that leans toward the field.
  if (tier !== 'min') {
    const canvas = document.createElement('canvas');
    canvas.className = 'ask-grid';
    canvas.setAttribute('aria-hidden', 'true');
    ask.prepend(canvas);
    const ctx = canvas.getContext('2d')!;
    const pull = new Spring(0, 70, 12);
    let w = 0, h = 0, dpr = 1, tx = 0, ty = 0;
    const GAP = 24;
    let dot = '', sig = '';
    const colors = () => {
      dot = token('--dot') || 'rgba(138,151,165,.28)';
      // The dots that lean in take the ink color: orange on this page only ever means a wait.
      sig = token('--text') || '#e8ecef';
    };
    colors();
    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const t = target();
      if (!t) return draw();
      const c = canvas.getBoundingClientRect(), f = t.getBoundingClientRect();
      tx = f.left - c.left + f.width / 2;
      ty = f.top - c.top + f.height / 2;
      draw();
    };
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const k = pull.value;
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1;
          const f = k * Math.min(26, 5200 / (d + 60));
          const near = k * Math.max(0, 1 - d / 260);
          ctx.fillStyle = near > 0.25 ? sig : dot;
          ctx.globalAlpha = near > 0.25 ? 0.25 + near * 0.6 : 1;
          ctx.fillRect(x + (dx / d) * f - 0.75, y + (dy / d) * f - 0.75, 1.5, 1.5);
        }
      }
      ctx.globalAlpha = 1;
    };
    new ResizeObserver(size).observe(ask);
    let stop: (() => void) | null = null;
    const animate = () => {
      stop ??= every({
        write(dt) {
          const moving = pull.step(dt);
          draw();
          if (!moving) {
            stop?.();
            stop = null;
          }
        },
      });
    };
    const lean = () => (colors(), size(), (pull.target = 1), animate());
    const rest = () => ((pull.target = 0), animate());
    for (const el of [apply, input]) {
      el?.addEventListener('focus', lean);
      el?.addEventListener('blur', rest);
      el?.addEventListener('pointerenter', lean);
      el?.addEventListener('pointerleave', rest);
    }
  }

  // ---- A real join: the March to the Mark over the seats.
  document.addEventListener('landing:joined', () => {
    const r = seats.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = Math.max(160, r.top - 150);
    void march(cx, cy, Math.min(240, innerWidth * 0.5)).then(() => void 0);
    setTimeout(() => void shockwave(cx, cy, 900), 1150);
  });
}
