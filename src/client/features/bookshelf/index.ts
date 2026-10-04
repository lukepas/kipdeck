/** The bookshelf: the project's docs to read, and who else on the floor is reading them. */
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import { store } from '../../state';
import { openBookshelf } from './ui';
import { clip, toast } from '../../ui/dom';

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
  function showBookshelf() {
    if (!store.floor) return toast('Go to a floor first');
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
