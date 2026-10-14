// Small inline SVG pieces for the map page and the index: line icons, the active milestone's progress
// ring, the line between two road nodes, and a tiny bar chart. Pure strings.

const ICON_PATHS: Readonly<Record<string, string>> = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  deploy: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  bug: 'M9 8a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM12 9v9M4 12h5M15 12h5M5 6l4 3M19 6l-4 3M5 19l4-3M19 19l-4-3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  warn: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
};

export function icon(name: string, cls = ''): string {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name] ?? ICON_PATHS.warn}"/></svg>`;
}

/** What a stuck part waits on, read from its words: a person, a deploy, an outside party or a bug. */
export function waitIcon(text: string | null | undefined): string {
  const t = String(text ?? '');
  if (/\b(you|founder|owner|approv\w*|merge|review\w*|sign[- ]?off|decid\w*|decision|accountant|lawyer|D\d+)\b/i.test(t)) return 'person';
  if (/\b(deploy\w*|release|rollout|migration|ship)\b/i.test(t)) return 'deploy';
  if (/\b(vendor|api|credential\w*|account|partner|third[- ]party|contract|external|provider)\b/i.test(t)) return 'external';
  if (/\b(bug|crash\w*|fail\w*|error|broken|flaky|regression)\b/i.test(t)) return 'bug';
  return 'warn';
}

/** The active milestone's progress ring; the "2/4" in it is real text the page draws over it. */
export function ring(done: number, total: number, size = 56): string {
  const c = size / 2;
  const r = c - 4;
  const len = 2 * Math.PI * r;
  const f = total ? Math.max(0, Math.min(1, done / total)) : 0;
  const fg = f > 0 ? `<circle class="ring-fg" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${(f * len).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>` : '';
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><circle class="ring-bg" cx="${c}" cy="${c}" r="${r}"/>${fg}</svg>`;
}

/** The line joining two road nodes, in px with x2="100%" so its dashes never stretch. */
export function track(kind: 'solid' | 'dashed'): string {
  return `<svg class="conn ${kind}" aria-hidden="true" focusable="false"><line x1="0" y1="2" x2="100%" y2="2"/></svg>`;
}

/** A tiny bar chart for a summary line; `values` oldest first. */
export function miniBars(values: readonly number[], label: string, w = 44, h = 14): string {
  const n = values.length || 1;
  const max = Math.max(1, ...values);
  const bw = w / n;
  const bars = values
    .map((v, i) => {
      const bh = Math.max(1.5, (v / max) * h);
      return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1"/>`;
    })
    .join('');
  return `<svg class="minibars" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}">${bars}</svg>`;
}
