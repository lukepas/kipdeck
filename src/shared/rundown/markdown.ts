// The two files a person edits by hand, .rundown/milestones.md and .rundown/decisions.md, in the same
// format the project-map agent used: read them, write them when they're missing, and add a newly raised
// decision without touching anything already there. Pure.

import type { Decision, Milestone, MilestoneItem } from './schema.js';

export const PROPOSED_LINE = 'Proposed: edit me.';

export interface ParsedMilestones {
  proposed: boolean;
  milestones: Omit<Milestone, 'state' | 'source'>[];
}

const DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/** Reads milestones.md: "## M1. Name (due 2026-10-12)", "Done when: ...", "- [x] item (part: core)". */
export function parseMilestones(md: string): ParsedMilestones {
  const out: ParsedMilestones = { proposed: false, milestones: [] };
  let cur: ParsedMilestones['milestones'][number] | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^Proposed: edit me/i.test(line.trim())) out.proposed = true;
    const head = /^##\s+(M\d+)[.:)]?\s+(.*)$/.exec(line);
    if (head) {
      let name = head[2].trim();
      let due: string | null = null;
      const paren = /\s*\(([^()]*)\)\s*$/.exec(name);
      if (paren && DATE.test(paren[1]) && /due|deadline|by/i.test(paren[1])) {
        due = DATE.exec(paren[1])![1];
        name = name.slice(0, paren.index).trim();
      }
      cur = { id: head[1], name, doneWhen: '', due, items: [] };
      out.milestones.push(cur);
      continue;
    }
    if (!cur) continue;
    const done = /^Done when:\s*(.*)$/i.exec(line.trim());
    if (done) {
      cur.doneWhen = done[1].trim();
      continue;
    }
    const item = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (item) {
      let text = item[2].trim();
      let partId: string | null = null;
      // "(part: core)", or "{part: core}" as the global skill's notes say it.
      const tag = /\s*[({]part:\s*([a-z0-9-]+)[)}]\s*$/i.exec(text);
      if (tag) {
        partId = tag[1];
        text = text.slice(0, tag.index).trim();
      }
      const it: MilestoneItem = { text, done: item[1] !== ' ', partId };
      cur.items.push(it);
    }
  }
  return out;
}

/** Writes milestones.md from scratch (only when there's none yet). */
export function writeMilestones(milestones: readonly Omit<Milestone, 'state' | 'source'>[], opts: { proposed: boolean; note?: string }): string {
  const lines = ['# Milestones', ''];
  if (opts.proposed) {
    lines.push(`${PROPOSED_LINE} ${opts.note ?? 'Drafted by /rundown. Tick items, reorder, rename or delete as you like; /rundown only ticks items that are clearly done and adds notes.'}`, '');
  }
  for (const m of milestones) {
    lines.push(`## ${m.id}. ${m.name}${m.due ? ` (due ${m.due})` : ''}`, '');
    if (m.doneWhen) lines.push(`Done when: ${m.doneWhen}`, '');
    for (const it of m.items) lines.push(`- [${it.done ? 'x' : ' '}] ${it.text}${it.partId ? ` (part: ${it.partId})` : ''}`);
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

/** Reads decisions.md: "### D1. Title (raised 2026-10-07)" blocks with Question, Options, DEFAULT and Answer lines. */
export function parseDecisions(md: string): Decision[] {
  const out: Decision[] = [];
  let cur: Decision | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^###\s+(D\d+)[.:)]?\s+(.*)$/.exec(line);
    if (head) {
      let title = head[2].trim();
      let raised = '';
      const paren = /\s*\(([^()]*)\)\s*$/.exec(title);
      if (paren && DATE.test(paren[1])) {
        raised = DATE.exec(paren[1])![1];
        title = title.slice(0, paren.index).trim();
      }
      cur = { id: head[1], question: title, options: [], default: '', raised, answer: null, partId: null };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^##\s/.test(line)) {
      cur = null;
      continue;
    }
    const field = /^(Question|Options|DEFAULT|Default|Answer|Part):\s*(.*)$/.exec(line);
    if (!field) continue;
    const v = field[2].trim();
    switch (field[1]) {
      case 'Question':
        if (v) cur.question = v;
        break;
      case 'Options':
        cur.options = v ? v.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean) : [];
        break;
      case 'DEFAULT':
      case 'Default':
        cur.default = v;
        break;
      case 'Answer':
        cur.answer = v || null;
        break;
      case 'Part':
        cur.partId = v || null;
        break;
    }
  }
  return out;
}

function decisionBlock(d: Decision): string[] {
  const title = d.question.length > 70 ? `${d.question.slice(0, 67).trimEnd()}...` : d.question;
  return [
    `### ${d.id}. ${title}${d.raised ? ` (raised ${d.raised})` : ''}`,
    `Question: ${d.question}`,
    `Options: ${d.options.join(' / ')}`,
    `DEFAULT: ${d.default}`,
    ...(d.partId ? [`Part: ${d.partId}`] : []),
    `Answer:${d.answer ? ` ${d.answer}` : ''}`,
    '',
  ];
}

export const DECISIONS_INTRO =
  'Decisions only you can make. Write your answer under "Answer:" and run /rundown quick; answered ones move to Resolved on the next full run. If you leave one blank, the DEFAULT is what the map assumes.';

/** Writes decisions.md from scratch (only when there's none yet). */
export function writeDecisions(decisions: readonly Decision[]): string {
  const open = decisions.filter((d) => !d.answer);
  const done = decisions.filter((d) => d.answer);
  const lines = ['# Your call', '', DECISIONS_INTRO, '', '## Open', ''];
  for (const d of open) lines.push(...decisionBlock(d));
  if (!open.length) lines.push('Nothing waiting on you.', '');
  lines.push('## Resolved', '');
  for (const d of done) lines.push(...decisionBlock(d));
  if (!done.length) lines.push('None yet.', '');
  return lines.join('\n').replace(/\n+$/, '\n');
}

/** Adds decisions not in `md` yet to its Open section, leaving every line already there as it is. */
export function appendDecisions(md: string, add: readonly Decision[]): string {
  const have = new Set(parseDecisions(md).map((d) => d.id));
  const fresh = add.filter((d) => !have.has(d.id));
  if (!fresh.length) return md;
  const block = fresh.flatMap((d) => decisionBlock({ ...d, answer: null })).join('\n');
  const at = md.search(/^## Resolved\s*$/m);
  if (at < 0) return `${md.replace(/\n*$/, '\n\n')}${block}`;
  return `${md.slice(0, at)}${block}\n${md.slice(at)}`.replace(/Nothing waiting on you\.\n\n(?=### )/, '');
}
