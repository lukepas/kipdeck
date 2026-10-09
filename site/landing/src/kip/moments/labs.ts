// 09 Labs. Kip stands on the right end of the --labs command line. As a scanline powers each tile in
// turn he points his wand at its flag, and when all five are lit, a twirl. The flags are real toggles:
// one held on again gets a hop, one held off droops his ears. The Deck tile is his ship: hovering it
// gets a wave.
import { timeline } from '../tween';
import { onTop, spots, type Moment } from './kinds';

export const labs: Moment = {
  arrive: 'rise',
  spots(sec) {
    const cmd = sec.querySelector('.labs-cmd');
    return spots(onTop(cmd, -48, 1, 'l'), onTop(cmd, -80, 1, 'l'), onTop(cmd, -48, 0.85, 'l'));
  },
  start(run) {
    const { kit, sec } = run;
    const flags = [...sec.querySelectorAll<HTMLButtonElement>('.flag')];
    const tiles = flags.map((f) => sec.querySelector(`.tile[data-lab="${f.dataset.lab}"]`));
    const lit = () => tiles.filter((t) => t?.classList.contains('power')).length;
    // The opening sequence (scenes/labs.ts powers them 220 ms apart) or a visitor's press.
    let opening = lit() < tiles.length;
    let pressed: HTMLButtonElement | null = null;
    flags.forEach((f) => run.listen(f, 'click', () => (pressed = f)));
    tiles.forEach((t, i) =>
      run.watch(t, 'power', (on) => {
        if (opening) {
          if (!on) return;
          const tl = timeline().add(kit.pointAt(flags[i]));
          if (lit() === tiles.length) {
            opening = false;
            tl.add(kit.armTo(0, { duration: 0.2 }), 0.35);
            tl.add(kit.twirl(), 0.45);
            tl.add(kit.lookAt(null), 0.45);
          }
          run.play(tl);
          return;
        }
        if (pressed !== flags[i]) return;
        pressed = null;
        if (on) run.play(timeline().add(kit.ears(0, 0, 0.15)).add(kit.lookAt(flags[i]), 0).add(kit.hop(10), 0.05));
        else run.play(timeline().add(kit.lookAt(flags[i])).add(kit.ears(34, 24, 0.3), 0));
      }),
    );
    const bridge = sec.querySelector('.tile-bridge');
    run.listen(bridge, 'pointerenter', () => !run.busy() && run.play(kit.wave(2)));
  },
};
