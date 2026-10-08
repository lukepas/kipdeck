// 06 Yours. Kip stands on the top edge of the dashed "YOUR MACHINE" box. His eyes ride the packets
// going out through the wall to the model APIs; when the inbox's packet stops at the wall (there are
// no servers of ours) he shakes his head and stamps a ring at his feet. When the signed record
// prints, he looks at its orange "waited 23:04" with wide eyes.
import { timeline } from '../tween';
import { spots, type Moment } from './kinds';

export const yours: Moment = {
  arrive: 'rise',
  spots(sec) {
    const edge = sec.querySelector('.wall-edge')?.getBoundingClientRect();
    if (!edge || !edge.width) return [];
    return spots(
      { x: edge.right - 44, y: edge.top + 1, s: 1, face: 'r' },
      { x: edge.right - 80, y: edge.top + 1, s: 1, face: 'r' },
      { x: edge.right - 44, y: edge.top + 1, s: 0.8, face: 'r' },
    );
  },
  start(run) {
    const { kit, sec } = run;
    const wall = sec.querySelector<SVGSVGElement>('.wall');
    const mark = sec.querySelector('.stop-x');
    const long = sec.querySelector('.ledger .w.sig');
    let shakes = 0;
    // Eyes on the outgoing packet, worked out from the scene's own clock (scenes/yours.ts), so
    // nothing is measured while it moves: x = 216 + 104k on a 500x290 drawing, k = (s * 0.55) % 1.
    const r = wall?.getBoundingClientRect();
    const box = r && r.width ? run.host.toLocal(r.left, r.top) : null;
    const u = r ? Math.min(r.width / 500, r.height / 290) : 0;
    const watchPacket = () => {
      if (!box) return;
      if (!run.busy() && !kit.asleep) {
        const k = ((performance.now() / 1000) * 0.55) % 1;
        kit.eyesOn({ x: box.x + (216 + 104 * k) * u, y: box.y + 77 * u });
      }
      run.later(140, watchPacket);
    };
    watchPacket();
    run.mutations(mark, () => {
      if (!mark?.classList.contains('hit') || run.busy() || shakes >= 3) return;
      shakes++;
      const tl = timeline().add(kit.shake());
      tl.call(() => kit.ringAt(run.spot.x, run.spot.y, 'green'), null, 0.3);
      run.play(tl);
    });
    // The receipt: rows print once the ledger is 40% in view; the long wait is the second row.
    const row = long?.closest('li');
    run.watch(row ?? null, 'printed', (on) => {
      if (!on || !long) return;
      run.later(200, () => run.play(timeline().add(kit.lookAt(long)).add(kit.wide(true), 0).add(kit.wide(false), 1.4).add(kit.lookAt(null), 1.6)));
    });
  },
};
