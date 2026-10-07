// 08 Numbers: the metric a team lead asks for. As the chart rises into view its seven columns grow
// from the floor, then a cursor walks the week day by day and the big numeral rolls to that day's
// median wait (23 on Monday down to 7 on Sunday, a modelled week, labelled illustrative). When it
// reaches Sunday a sparkline of the week docks under the top bar's pulse, beside the live wait: the
// same number, kept in view for the rest of the page.
import { env } from '../engine/env';
import { drive, ease, span, setter } from '../engine/drive';
import { odometer } from '../engine/odometer';

const VALUES = [23, 19, 17, 14, 12, 9, 7];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function mountNumbers(section: HTMLElement) {
  if (env.reduced) return;
  const chart = section.querySelector<HTMLElement>('.chart')!;
  const cols = [...chart.querySelectorAll<SVGRectElement>('.cols rect')];
  const vals = [...chart.querySelectorAll<SVGTextElement>('.vals text')];
  const big = chart.querySelector<HTMLElement>('.big-num b')!;
  const day = chart.querySelector<HTMLElement>('.big-num span')!;
  const pulse = document.querySelector<HTMLElement>('.pulse');
  const setBig = odometer(big);
  const set = setter();
  chart.classList.add('staged');
  let docked = false;
  let shownDay = -1;

  drive(chart, (p) => {
    cols.forEach((c, i) => {
      const k = ease(p, i * 0.05, 0.32 + i * 0.05);
      set(c as unknown as HTMLElement, 'transform', `scaleY(${k.toFixed(4)})`);
      set(vals[i] as unknown as HTMLElement, 'opacity', ease(p, 0.2 + i * 0.05, 0.36 + i * 0.05).toFixed(3));
    });
    const d = Math.min(6, Math.floor(span(p, 0.42, 0.95) * 7));
    if (d !== shownDay) {
      shownDay = d;
      setBig(String(VALUES[d]));
      day.textContent = `min median wait, ${DAYS[d]}`;
      cols.forEach((c, i) => c.classList.toggle('cur', i === d));
      vals.forEach((v, i) => v.classList.toggle('cur', i === d));
    }
    if (!docked && p >= 0.98) {
      docked = true;
      pulse?.classList.add('spark-on');
    }
  }, { fallback: 'view', viewEnd: 0.3 });
}
