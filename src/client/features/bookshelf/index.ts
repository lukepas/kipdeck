/** The bookshelf: the project's docs to read, and who else on the floor is reading them. */
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { openBookshelf } from './ui';
import { clip, toast } from '../../ui/dom';
import type { DocList } from '../../../shared/docs';
import * as THREE from 'three';
import { docsFar, docsView, paintDocs, DOCS_SCREEN } from './index-screen';
import { FarWatch, paintFar } from '../boards/far';
import { BOOKSHELF } from '../../../shared/layout';

/** How often the rack's index looks again while the tab shows (ms): docs change slowly. */
const INDEX_EVERY = 5 * 60_000;

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    bookshelf: true;
  }
}

/** The project on GitHub, from the floor's origin remote, when that's where it is. */
function githubUrl(remote?: string): string | undefined {
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote ?? '');
  return m ? `https://github.com/${m[1]}` : undefined;
}

export function installBookshelf(ctx: Ctx) {
  // The rack's index: the project's Markdown as a table over the shelves, the latest changed first.
  let list: DocList | null | Error = null;
  let drawn = '';
  // From across the deck its headline counts (boards/far.ts), up close the table.
  const far = new FarWatch(new THREE.Vector3(BOOKSHELF.x, 2.6, BOOKSHELF.z));
  const paint = () => {
    const v = docsView(list);
    const key = JSON.stringify(v) + far.far;
    if (key === drawn) return;
    drawn = key;
    if (far.far) paintFar(ctx.office.docsIndex, DOCS_SCREEN.units, docsFar(v));
    else paintDocs(ctx.office.docsIndex, v);
  };
  ctx.ticks.add('world', ({ dt }) => {
    if (far.check(ctx.camera, dt) !== null) paint();
  });
  let asked = 0;
  async function look() {
    const floor = store.floor;
    if (!floor) return;
    const ask = ++asked;
    try {
      const r = await fetch(`/api/docs?${new URLSearchParams({ floor })}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const got = (await r.json()) as DocList;
      if (ask === asked && store.floor === floor) list = got;
    } catch (err) {
      if (ask === asked) list = err instanceof Error ? err : new Error(String(err));
    }
    paint();
  }
  store.on('floor', () => {
    list = null;
    paint();
    void look();
  });
  paint();
  void look();
  window.setInterval(() => {
    if (document.hidden) return;
    void look();
  }, INDEX_EVERY);

  function showBookshelf() {
    if (!store.floor) return toast('Go to a deck first');
    openBookshelf({
      floor: store.floor,
      project: store.project?.name,
      repoUrl: githubUrl(store.project?.remote),
    });
  }

  ctx.interactions.define('bookshelf', {
    reach: 4,
    hint: () => {
      const names = [...store.peers.values()].filter((p) => p.reading && p.id !== store.you && store.onMyFloor(p)).map((p) => p.name).join(', ');
      return { k: names, parts: [hintTitle('Bookshelf'), aside(names ? `${clip(names, 40)} reading` : "the project's docs"), key('E', 'Read the docs')] };
    },
    use: onE(() => showBookshelf()),
  });

  return { showBookshelf };
}
