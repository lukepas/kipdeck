// Settings > Bounties > Public showcase (admins): whether the read-only page at /pom/ is on, and
// how each repository shows there. Public repositories show in full and private ones redacted
// unless an admin picks otherwise; a hidden one is left out of every figure.
import type { RepoVisibility } from '../../shared/showcase';
import type { Net } from '../net';
import { store } from '../state';
import { h } from './dom';
import { choiceRow } from './settings-rows';

const LABEL: Record<RepoVisibility, string> = { full: 'Full titles', redacted: 'Redacted', hidden: 'Hidden' };

export function showcaseSettings(net: Net): { nodes: Node[]; off: () => void } {
  const ask = () => {
    if (store.me.admin && !store.showcaseSettings) net.send({ t: 'showcase.settings.get' });
  };
  ask();
  const s = () => store.showcaseSettings;
  const patch = (p: { enabled?: boolean; repos?: Record<string, RepoVisibility | null> }) => net.send({ t: 'showcase.settings', patch: p });
  const onRow = choiceRow('Public showcase', [[true, 'On'], [false, 'Off']] as const, () => !!s()?.enabled, (v) => patch({ enabled: v }));
  const link = h('a', { href: '/pom/', target: '_blank', rel: 'noopener' }, 'Open /pom/');
  const repos = h('div.showcase-repos');
  const note = h('p.setting-note', {}, 'A public, read-only page anyone can open without signing in: the merge board, merged work with explorer links, open bounties and who is at their desk. It never shows prompts, terminals, file paths, accounts or keys. Public repositories show their pull request titles; private ones read "a private repo" unless you choose otherwise. Attestations name their repository on chain, so a private repository you never want named is best kept out of Proof of Merge altogether.');
  const box = h('div', {}, onRow, h('div.seg', {}, link), repos, note);
  const paint = () => {
    box.classList.toggle('hidden', !store.me.admin);
    const st = s();
    if (!st) return;
    repos.replaceChildren(
      ...st.known.map((k) =>
        h(
          'div.showcase-repo',
          {},
          h('small', {}, `${k.repo}${k.private === undefined ? '' : k.private ? ' (private)' : ' (public)'}${st.repos[k.repo] ? '' : ' - default'}`),
          choiceRow(k.repo, (['full', 'redacted', 'hidden'] as const).map((v) => [v, LABEL[v]] as const), () => k.shows, (v) => patch({ repos: { [k.repo]: v } })),
        ),
      ),
    );
  };
  paint();
  const offs = [store.on('showcaseSettings', paint), store.on('me', () => (ask(), paint()))];
  return { nodes: [h('div', {}, h('h4', {}, 'Public showcase (admins)'), box)], off: () => offs.forEach((o) => o()) };
}
