// Checks on the kits that are easy to get wrong by hand and costly to get wrong on a form:
// a description over its character limit, a video script that runs long, a missing section,
// fancy punctuation pasted in from somewhere, a placeholder still waiting to be filled.
//
//   npx tsx launch/tools/lint.ts    report on every kit; exit 1 on errors (placeholders are only listed)

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isMain, LAUNCH_DIR } from './calendar.js';

export interface Issue {
  line: number;
  message: string;
}

/** Every per-program kit has these sections, in this order. */
export const REQUIRED_SECTIONS = [
  'Deadline',
  'Links',
  'Eligibility checklist',
  'Pre-existing code disclosure',
  'Project description',
  'Judging criteria',
  'Demo video script',
  'Submission checklist',
];

/** The files in launch/ that are not per-program kits. */
export const NOT_KITS = new Set(['README.md', 'disclosure.md']);

/** Lines inside ``` fences, which the prose rules skip. */
function fenced(lines: string[]): boolean[] {
  let inside = false;
  return lines.map((l) => {
    if (/^\s*```/.test(l)) {
      inside = !inside;
      return true;
    }
    return inside;
  });
}

/** Lines inside a fence marked with a language other than English (lang=lt), where that language's letters are fine. */
function foreign(lines: string[]): boolean[] {
  let inside = false;
  let other = false;
  return lines.map((l) => {
    if (/^\s*```/.test(l)) {
      if (!inside) other = /\slang=(?!en\b)[a-z]{2}\b/.test(l);
      inside = !inside;
      return false;
    }
    return inside && other;
  });
}

/** The repo's writing rules: printable ASCII only, no thematic breaks, sentence-case subheadings. */
export function proseIssues(text: string): Issue[] {
  const issues: Issue[] = [];
  const lines = text.split('\n');
  const code = fenced(lines);
  const local = foreign(lines);
  lines.forEach((l, i) => {
    const line = i + 1;
    // Another language may need its own letters, but never typographic dashes, quotes or invisible characters.
    const bad = [...l].find((ch) => ch !== '\t' && (ch < ' ' || ch > '~') && !(local[i] && /\p{L}/u.test(ch)));
    if (bad) issues.push({ line, message: `non-ASCII character U+${bad.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` });
    if (code[i]) return;
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(l)) issues.push({ line, message: 'horizontal rule; use a heading instead' });
    const h = /^(#{2,6}) (.+)$/.exec(l);
    if (h) {
      const words = h[2].split(/\s+/).slice(1).filter((w) => /^[A-Za-z]{4,}$/.test(w));
      if (words.length >= 2 && words.every((w) => /^[A-Z][a-z]/.test(w))) issues.push({ line, message: `Title Case heading "${h[2]}"; use sentence case` });
    }
  });
  return issues;
}

export function headings(text: string, level = 2): string[] {
  const code = fenced(text.split('\n'));
  const re = new RegExp(`^#{${level}} (.+)$`);
  return text
    .split('\n')
    .filter((l, i) => !code[i])
    .map((l) => re.exec(l)?.[1].trim())
    .filter((h): h is string => !!h);
}

/** Required sections that are missing or out of order. */
export function sectionIssues(text: string): Issue[] {
  const hs = headings(text);
  const issues: Issue[] = [];
  let at = -1;
  for (const want of REQUIRED_SECTIONS) {
    const i = hs.findIndex((h) => h === want || h.startsWith(`${want} `) || h.startsWith(`${want}:`));
    if (i < 0) issues.push({ line: 0, message: `missing section "## ${want}"` });
    else if (i < at) issues.push({ line: 0, message: `section "${want}" is out of order` });
    else at = i;
  }
  return issues;
}

export interface Field {
  name: string;
  text: string;
  chars: number;
  words: number;
  maxChars?: number;
  maxWords?: number;
  minWords?: number;
  line: number;
}

/** Form answers, written as ```field name="Elevator pitch" max-chars=200 fences. */
export function fields(text: string): Field[] {
  const out: Field[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^```field\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    const attrs = Object.fromEntries([...m[1].matchAll(/([a-z-]+)=(?:"([^"]*)"|(\S+))/g)].map((a) => [a[1], a[2] ?? a[3]]));
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) body.push(lines[j++]);
    const value = body.join('\n').trim();
    const num = (k: string) => (attrs[k] ? Number(attrs[k]) : undefined);
    out.push({ name: attrs.name ?? '(unnamed)', text: value, chars: [...value].length, words: value ? value.split(/\s+/).length : 0, maxChars: num('max-chars'), maxWords: num('max-words'), minWords: num('min-words'), line: i + 1 });
    i = j;
  }
  return out;
}

export function fieldIssues(text: string): Issue[] {
  const issues: Issue[] = [];
  for (const f of fields(text)) {
    if (!f.text) issues.push({ line: f.line, message: `field "${f.name}" is empty` });
    if (f.maxChars !== undefined && f.chars > f.maxChars) issues.push({ line: f.line, message: `field "${f.name}" is ${f.chars} characters, limit ${f.maxChars}` });
    if (f.maxWords !== undefined && f.words > f.maxWords) issues.push({ line: f.line, message: `field "${f.name}" is ${f.words} words, limit ${f.maxWords}` });
    if (f.minWords !== undefined && f.words < f.minWords) issues.push({ line: f.line, message: `field "${f.name}" is ${f.words} words, needs ${f.minWords}` });
  }
  return issues;
}

/** "2:50" -> 170 */
export function seconds(mss: string): number {
  const [m, s] = mss.split(':').map(Number);
  return m * 60 + s;
}

export interface Video {
  line: number;
  target: number;
  limit: number;
  strict: boolean;
  shots: { from: number; to: number; line: number }[];
}

/**
 * Video scripts: a "Runtime target: 2:50 (limit: under 3:00)" line, then a shot table whose rows
 * start with their time range, "| 0:00-0:12 | ...".
 */
export function videos(text: string): Video[] {
  const out: Video[] = [];
  text.split('\n').forEach((l, i) => {
    const t = /^Runtime target: (\d+:\d\d) \(limit: (under )?(\d+:\d\d)\)/.exec(l);
    if (t) {
      out.push({ line: i + 1, target: seconds(t[1]), limit: seconds(t[3]), strict: !!t[2], shots: [] });
      return;
    }
    const s = /^\| (\d+:\d\d)-(\d+:\d\d) \|/.exec(l);
    if (s && out.length) out[out.length - 1].shots.push({ from: seconds(s[1]), to: seconds(s[2]), line: i + 1 });
  });
  return out;
}

export function videoIssues(text: string): Issue[] {
  const issues: Issue[] = [];
  const vs = videos(text);
  if (!vs.length) issues.push({ line: 0, message: 'no "Runtime target:" line for the demo video' });
  for (const v of vs) {
    if (v.strict ? v.target >= v.limit : v.target > v.limit) issues.push({ line: v.line, message: `runtime target ${v.target}s breaks the ${v.limit}s limit` });
    if (!v.shots.length) issues.push({ line: v.line, message: 'video has no shot list' });
    let at = 0;
    for (const s of v.shots) {
      if (s.from !== at) issues.push({ line: s.line, message: `shot starts at ${s.from}s, previous one ended at ${at}s` });
      if (s.to <= s.from) issues.push({ line: s.line, message: 'shot ends before it starts' });
      at = s.to;
    }
    if (v.shots.length && at !== v.target) issues.push({ line: v.line, message: `shots run ${at}s, runtime target is ${v.target}s` });
  }
  return issues;
}

/** {{LIKE_THIS}}: things only the entrant can fill in (their fork URL, video link). */
export function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [])];
}

/** Every Markdown file the linter reads: the top level of launch/ and launch/templates/. */
export function launchDocs(dir = LAUNCH_DIR): string[] {
  const top = readdirSync(dir).filter((f) => f.endsWith('.md'));
  let templates: string[] = [];
  try {
    templates = readdirSync(path.join(dir, 'templates')).filter((f) => f.endsWith('.md')).map((f) => `templates/${f}`);
  } catch {}
  return [...top, ...templates].sort();
}

export function kitFiles(dir = LAUNCH_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !NOT_KITS.has(f))
    .sort();
}

/** Every rule for one file: prose for all, and the kit rules for kits. */
export function lintFile(name: string, text: string): Issue[] {
  const issues = [...proseIssues(text), ...fieldIssues(text)];
  // Only top-level files other than the README and the disclosure are kits; templates get the prose rules.
  if (NOT_KITS.has(name) || name.includes('/')) return issues;
  if (!/^Last checked: \d{4}-\d{2}-\d{2}/m.test(text)) issues.push({ line: 0, message: 'missing "Last checked: YYYY-MM-DD" line' });
  return [...issues, ...sectionIssues(text), ...videoIssues(text)];
}

if (isMain(import.meta.url)) {
  let errors = 0;
  const all = launchDocs();
  for (const name of all) {
    const text = readFileSync(path.join(LAUNCH_DIR, name), 'utf8');
    for (const i of lintFile(name, text)) {
      errors++;
      console.log(`${name}:${i.line}: ${i.message}`);
    }
    const todo = placeholders(text);
    if (todo.length) console.log(`${name}: to fill in: ${todo.join(' ')}`);
  }
  console.log(errors ? `${errors} problems` : `${all.length} files, no problems`);
  process.exit(errors ? 1 : 0);
}
