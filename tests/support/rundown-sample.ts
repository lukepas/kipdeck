// A small Rundown built from hand-made facts, for the unit tests of the model, the diff, the page and
// the holo city's layout.
import { emptyFileFacts } from '../../src/server/rundown/collect.js';
import { buildRundown, type BuildInput } from '../../src/shared/rundown/model.js';
import type { Facts, Rundown } from '../../src/shared/rundown/schema.js';

export const NOW = new Date('2026-10-07T12:00:00Z');

export function sampleFacts(): Facts {
  const files = emptyFileFacts();
  files.total = 6;
  files.dirs = [
    { path: 'src/server', files: 3, lines: 3000, tests: 0, todo: 2, fixme: 0, commits30d: 5, lastCommit: '2026-10-06T10:00:00Z' },
    { path: 'src/client', files: 2, lines: 1500, tests: 0, todo: 0, fixme: 1, commits30d: 0, lastCommit: null },
    { path: 'tests', files: 1, lines: 200, tests: 1, todo: 0, fixme: 0, commits30d: 1, lastCommit: '2026-09-01T10:00:00Z' },
    { path: 'docs', files: 1, lines: 20, tests: 0, todo: 0, fixme: 0, commits30d: 0, lastCommit: null },
  ];
  files.byTopFolder = [
    { folder: 'src', files: 5, lines: 4500, languages: { TypeScript: 4500 } },
    { folder: 'tests', files: 1, lines: 200, languages: { TypeScript: 200 } },
    { folder: 'docs', files: 1, lines: 20, languages: { Markdown: 20 } },
  ];
  files.languages = { TypeScript: { files: 6, lines: 4700 }, Markdown: { files: 1, lines: 20 } };
  files.tests.files = 1;
  files.todo = { todo: 2, fixme: 1, hack: 0, byTopFolder: { src: 3 }, locations: [{ path: 'src/server/a.ts', line: 3, tag: 'TODO' }] };
  return {
    collectedAt: NOW.toISOString(),
    durationMs: 10,
    truncated: false,
    gaps: [],
    files,
    github: null,
    git: {
      branches: [
        { name: 'main', sha: 'a'.repeat(40), date: '2026-10-06T10:00:00Z', ahead: 0, behind: 0, merged: false, upstream: null, upstreamAhead: null, upstreamBehind: null, forkDate: null },
        { name: 'feature/x', sha: 'b'.repeat(40), date: '2026-10-07T09:00:00Z', ahead: 2, behind: 0, merged: false, upstream: null, upstreamAhead: null, upstreamBehind: null, forkDate: '2026-10-05T10:00:00Z' },
      ],
      worktrees: [{ path: '/tmp/wt', branch: 'feature/x', sha: 'b'.repeat(40), locked: false, prunable: false, owner: 'A-01' }],
      recentCommits: [{ sha: 'a'.repeat(40), date: '2026-10-06T10:00:00Z', author: 'Dev', subject: 'Server work', files: 1, insertions: 10, deletions: 2, parts: [], paths: ['src/server/a.ts'] }],
      activityByDay: { '2026-10-06': 3, '2026-10-07': 1 },
      contributors: [{ name: 'Dev', commits: 4, last: '2026-10-07' }],
      uncommitted: { staged: 0, modified: 1, deleted: 0, untracked: 0, paths: ['src/client/view.ts'] },
      upstream: null,
      stashes: 0,
      totalCommits: 12,
      firstCommit: '2026-01-01T00:00:00Z',
    },
  };
}

export function sampleRundown(over: Partial<BuildInput> = {}): Rundown {
  return buildRundown({
    facts: sampleFacts(),
    project: { name: 'fixture', root: '~/fixture', remote: 'acme/fixture', defaultBranch: 'main', head: { branch: 'main', sha: 'a'.repeat(40), subject: 'Server work', date: '2026-10-06T10:00:00Z' }, description: 'A fixture.' },
    generator: { name: 'rundown-skill', version: 'test', mode: 'full' },
    judgement: null,
    milestonesMd: null,
    decisionsMd: null,
    prev: null,
    since: null,
    now: NOW,
    ...over,
  });
}
