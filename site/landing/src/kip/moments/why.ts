// 05 Why. Kip comes up on the comparison table's top edge, above the product's own column, as the
// table starts to decode; he nods at each of that column's answers as it settles, and when the last
// one is in, both arms up and a green ring.
import { timeline } from '../tween';
import { spots, type Moment } from './kinds';

export const why: Moment = {
  arrive: 'rise',
  spots(sec) {
    const wrap = sec.querySelector('.table-wrap')?.getBoundingClientRect();
    const us = sec.querySelector('thead .us')?.getBoundingClientRect();
    if (!wrap || !us || !us.width) return [];
    const x = us.left + us.width / 2;
    return spots(
      { x, y: wrap.top - 1, s: 1, face: 'l' },
      { x: x - 40, y: wrap.top - 1, s: 1, face: 'l' },
      { x, y: wrap.top - 1, s: 0.85, face: 'l' },
      // A phone: small, at the right end of the table's top rule.
      { x: Math.min(x, wrap.right - 30), y: wrap.top - 1, s: 0.62, face: 'l' },
      { x: wrap.right - 30, y: wrap.top - 1, s: 0.62, face: 'l' },
    );
  },
  start(run) {
    const { kit, sec } = run;
    const cells = [...sec.querySelectorAll<HTMLElement>('td.us > span')];
    const done = () => cells.filter((c) => c.classList.contains('done')).length;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      const tl = timeline().add(kit.lookAt(null)).add(kit.poseTo('tada', 0.25), 0.05);
      kit.squash(tl, 0.25);
      tl.call(() => kit.ring('green'), null, 0.3);
      run.play(tl);
    };
    if (cells.length && done() === cells.length) {
      run.play(timeline().add(kit.happy(true)));
      return;
    }
    const col = sec.querySelector('td.us');
    if (col) run.play(kit.lookAt(col));
    for (const c of cells) {
      run.watch(c, 'done', (on) => {
        if (!on) return;
        if (done() === cells.length) finish();
        else if (!run.busy()) run.play(timeline().add(kit.lookAt(c)).add(kit.nod(), 0.05));
      });
    }
  },
};
