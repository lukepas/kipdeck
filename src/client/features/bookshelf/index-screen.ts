// The docs rack's index: a screen over the rack listing the project's Markdown, the latest changed
// first, as a table (title, folder, when it last changed, how big), so what's on the shelves reads
// from the aisle before you open it. docsView is pure (tests/tables.test.ts).
import type { DocList } from '../../../shared/docs';
import { ago } from '../../../shared/rowtext';
import { INK, ground, titleBar, type Screen } from '../boards/screen';
import { emptyBox, table, type TableRow } from '../boards/table';
import type { FarSpec } from '../boards/far';
import { DECK } from '../../world/office/materials';

/** The index's size on the wall (metres) and its canvas units a metre. */
export const DOCS_SCREEN = { width: 1.7, height: 0.96, units: 420 } as const;

export interface DocsView {
  /** Loading, or the list couldn't be had. */
  status: 'loading' | 'ok' | 'error';
  count: number;
  more: boolean;
  rows: TableRow[];
}

/** "docs/setup.md" as its folder ("docs"), the project's root as "/". */
const folder = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '/');
/** "docs/setup.md" as "setup". */
const stem = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.(md|markdown|mdx)$/i, '');
/** A file's size as a person reads it: "820 B", "14 kB". */
export const sizeText = (b: number) => (b < 1024 ? `${b} B` : `${Math.round(b / 1024)} kB`);

/** The index's rows from the docs list (null while it loads, an Error when it can't be had). Pure. */
export function docsView(list: DocList | null | Error, now = Date.now()): DocsView {
  if (list === null) return { status: 'loading', count: 0, more: false, rows: [] };
  if (list instanceof Error) return { status: 'error', count: 0, more: false, rows: [] };
  const files = [...list.files].sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
  return {
    status: 'ok',
    count: list.files.length,
    more: list.more,
    rows: files.map((f): TableRow => ({ cells: [f.title?.trim() || stem(f.path), { text: folder(f.path), mono: true, color: INK.dim }, { text: ago(now - f.mtime), mono: true }, { text: sizeText(f.size), mono: true, color: INK.dim }] })),
  };
}

/** Paints the index: DOCS and how many files, then the table, the latest changed first. */
export function paintDocs(s: Screen, v: DocsView) {
  const { g, W, H } = s;
  ground(g, W, H);
  titleBar(g, W, 'Docs', v.status === 'ok' ? `${v.count}${v.more ? '+' : ''} files` : undefined);
  if (v.status !== 'ok' || !v.rows.length) {
    const [title, sub] = v.status === 'loading' ? ['Looking along the shelves', undefined] : v.status === 'error' ? ["Can't list the docs", 'E here opens the rack'] : ['No Markdown yet', 'Docs land here as the project writes them'];
    emptyBox(g, 24, 96, W - 48, H - 110, title, sub, 34);
  } else
    table(g, {
      x: 24,
      y: 102,
      w: W - 48,
      h: H - 112,
      size: 30,
      rowH: 48,
      columns: [
        { label: 'Title', w: 2.6 },
        { label: 'Folder', w: 1.3, mono: true },
        { label: 'Edited', w: 0.95, align: 'right', mono: true },
        { label: 'Size', w: 0.85, align: 'right', mono: true },
      ],
      rows: v.rows,
    });
  s.texture.needsUpdate = true;
}

/** The rack from across the deck (boards/far.ts): how many docs, how long since the last edit, and in how many folders. Pure. */
export function docsFar(v: DocsView): FarSpec {
  const hue = DECK.ship;
  if (v.status !== 'ok') return { title: 'Docs', hue, counts: [], empty: v.status === 'loading' ? 'Looking along the shelves' : "Can't list the docs" };
  if (!v.rows.length) return { title: 'Docs', hue, counts: [], empty: 'No Markdown yet' };
  const cell = (c: unknown) => (typeof c === 'string' ? c : c && typeof c === 'object' && 'text' in c ? String((c as { text: string }).text) : '');
  const folders = new Set(v.rows.map((r) => cell(r.cells[1])));
  return {
    title: 'Docs',
    hue,
    counts: [
      { n: `${v.count}${v.more ? '+' : ''}`, word: 'docs', hue: INK.text },
      { n: cell(v.rows[0].cells[2]), word: 'last edit', hue },
      { n: String(folders.size), word: folders.size === 1 ? 'folder' : 'folders', hue: INK.text },
    ],
  };
}
