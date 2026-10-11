// Signal's gist of one floor (protocol/signal.ts): its active Goals milestone and how many of its
// issues closed lately, while the ops lab is on, and what the /rundown skill last wrote, while the
// rundown lab is on. The rundown part reads the skill's own files the way the office's rundown does
// (skillJudgement() for .rundown/rundown.json, capped and checked, and the person's milestones.md and
// decisions.md over the skill's guesses), read only. With no rundown.json, or one that carries no
// judgement (written from the facts alone by `kipdeck rundown`), it reads the office's own map
// of the floor instead (Rundown's first map, inferred from the code and kept in the office's memory):
// its parts by status and a next thing, never a stuck part. No git, no collector, no polling here: a page
// asks (or the office's map moves on, push.ts), and the answer comes from a cache per floor that holds
// while none of the three files and the office's map changed.

import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { milestoneOf, milestoneProgress } from '../../shared/mission.js';
import { issuesClosed } from '../../shared/pace.js';
import { parseDecisions, parseMilestones } from '../../shared/rundown/markdown.js';
import { withStates } from '../../shared/rundown/model.js';
import { LIMITS, type Decision, type Judgement, type Rundown } from '../../shared/rundown/schema.js';
import type { GhIssue, Mission, RundownGist, SignalGist, TimelineEvent } from '../../shared/protocol.js';
import { BURN_DAYS, gistOf } from '../../shared/signal.js';
import { inferredNext, partCounts } from '../../shared/signal-parts.js';
import { readSmall } from '../rundown/files.js';
import { hasJudgement, skillJudgement } from '../rundown/service.js';

const DAY_MS = 24 * 60 * 60_000;
/** The skill's files the gist reads, under the project's checkout. */
const FILES = ['.rundown/rundown.json', '.rundown/milestones.md', '.rundown/decisions.md'] as const;

/** What the gist reads of a floor (a Floor has all of it). */
export interface GistFloor {
  id: string;
  dir: string;
  mission: { state(): Mission };
  github: { issues: { items: readonly GhIssue[] } };
  timeline: { list(opts: { since?: number; limit: number }): { events: TimelineEvent[] } };
}

/** The last rundown gist of each floor, and the files' sizes and times it was read at. */
const cache = new Map<string, { key: string; gist: RundownGist | null }>();

/** Forgets every cached gist, or one floor's (a test). */
export function forgetGists(floorId?: string) {
  if (floorId === undefined) cache.clear();
  else cache.delete(floorId);
}

/** Forgets the gists of floors no longer on the building: each peek calls it with the floors there are. */
export function keepGists(floorIds: Iterable<string>) {
  const keep = new Set(floorIds);
  for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id);
}

/** The folder, and each file's time and size or '-' when it isn't a plain file: the gist only changes when this does. */
async function filesKey(dir: string): Promise<{ key: string; at: number | null }> {
  const parts: string[] = [];
  let at: number | null = null;
  for (const f of FILES) {
    try {
      const st = await lstat(path.join(dir, f));
      parts.push(st.isFile() ? `${st.mtimeMs}:${st.size}` : '-');
      if (f === FILES[0] && st.isFile()) at = st.mtimeMs;
    } catch {
      parts.push('-');
    }
  }
  return { key: `${dir}|${parts.join('|')}`, at };
}

/** The person's decisions.md first (with their answers), then the ones the skill raised that it doesn't have yet. */
function decisionsOf(j: Judgement, md: string | null): Pick<Decision, 'id' | 'question' | 'raised' | 'answer'>[] {
  const fromMd = md === null ? [] : parseDecisions(md);
  const have = new Set(fromMd.map((d) => d.id));
  return [...fromMd, ...(j.decisions ?? []).filter((d) => !have.has(d.id)).map((d) => ({ id: d.id, question: d.question, raised: d.raised, answer: null }))];
}

/**
 * The gist of the office's own map, when the skill hasn't run: the person's milestones and decisions it
 * read, its parts by status, and the next thing worked out from them. A stuck part counts toward Off
 * track only when someone said so, never when the status was inferred.
 */
export function officeGist(r: Rundown): RundownGist {
  const said = r.parts.filter((p) => p.statusSource !== 'inferred');
  const gist = gistOf(Date.parse(r.generatedAt), said, r.milestones, r.nextStep?.text ?? inferredNext(r), r.decisions);
  return { source: 'inferred', parts: partCounts(r.parts), ...gist };
}

/** The rundown part of the gist: the skill's .rundown/rundown.json, else the office's map (`office`), else null. */
export async function rundownGist(floorId: string, dir: string, office: Rundown | null = null): Promise<RundownGist | null> {
  const files = await filesKey(dir);
  const at = files.at;
  const key = `${files.key}|${office?.generatedAt ?? '-'}`;
  const hit = cache.get(floorId);
  if (hit && hit.key === key) return hit.gist;
  let gist: RundownGist | null = null;
  if (at !== null) {
    const { judgement, generatedAt } = await skillJudgement(dir);
    // One written from the facts alone (`kipdeck rundown`, `/rundown quick` with no judgement) says
    // nothing the office's map doesn't: read as if there were none.
    if (hasJudgement(judgement)) {
      const [milestonesMd, decisionsMd] = await Promise.all([readSmall(dir, FILES[1], LIMITS.skillFileBytes), readSmall(dir, FILES[2], LIMITS.skillFileBytes)]);
      const parsed = milestonesMd === null ? null : parseMilestones(milestonesMd);
      const milestones = parsed
        ? withStates(parsed.milestones, parsed.proposed ? 'proposed' : 'milestones.md')
        : withStates((judgement.milestones ?? []).map((m) => ({ id: m.id, name: m.name, doneWhen: m.doneWhen, due: m.due ?? null, items: m.items.map((i) => ({ text: i.text, done: i.done, partId: i.partId ?? null })) })), 'proposed');
      const parts = (judgement.parts ?? []).map((p) => ({ status: p.status, waitingOn: p.waitingOn ?? null }));
      // Its age is the older of when the skill wrote it and the file's mtime: a copied or pulled old rundown stays old.
      gist = { source: 'skill', parts: partCounts(parts), ...gistOf(generatedAt !== undefined ? Math.min(generatedAt, at) : at, parts, milestones, judgement.nextStep?.text ?? null, decisionsOf(judgement, decisionsMd)) };
    }
  }
  if (!gist && office) gist = officeGist(office);
  cache.set(floorId, { key, gist });
  return gist;
}

/** The timeline's line for a milestone being made (server/timeline.ts missionChanged): "<who> added the milestone <title>". */
export function isAdded(e: Pick<TimelineEvent, 'kind' | 'text'>): boolean {
  return e.kind === 'milestone' && /(^|\s)added the milestone(\s|$)/.test(e.text);
}

/**
 * The days a milestone's pace is counted over: BURN_DAYS, or fewer when the timeline still has the
 * line it was added with and that is younger, so a milestone made today has no pace yet rather than none.
 * Without that line (made before the timeline logged it, or trimmed off a busy timeline) its age is
 * unknown and the whole window counts: a later event is no sign of when it was made.
 */
export function burnDays(events: readonly Pick<TimelineEvent, 'at' | 'kind' | 'text'>[], now: number): number {
  const added = events.filter(isAdded);
  if (!added.length) return BURN_DAYS;
  const first = added.reduce((t, e) => Math.min(t, e.at), now);
  return Math.min(BURN_DAYS, Math.max(1, Math.ceil((now - first) / DAY_MS)));
}

/** A floor's gist, each part only while its lab is on. `office` is the office's own map of it (ctx.rundown.current), if it has one. */
export async function signalGist(floor: GistFloor, labs: { ops: boolean; rundown: boolean }, now = Date.now(), office: Rundown | null = null): Promise<SignalGist> {
  let goal: SignalGist['goal'] = null;
  let burn: SignalGist['burn'] = null;
  if (labs.ops) {
    const mission = floor.mission.state();
    const m = milestoneOf(mission, mission.active);
    if (m && !m.done) {
      const p = milestoneProgress(m, floor.github.issues.items, [], [], now);
      goal = { id: m.id, title: m.title, ...(m.due ? { due: m.due } : {}), closed: p.closed, issues: p.issues };
      const since = now - BURN_DAYS * DAY_MS;
      const all = floor.timeline.list({ limit: Number.MAX_SAFE_INTEGER }).events.filter((e) => e.goal === m.id);
      const events = all.filter((e) => e.at > since);
      burn = { goal: m.id, closed: issuesClosed(events), days: burnDays(all, now) };
    }
  }
  const rundown = labs.rundown ? await rundownGist(floor.id, floor.dir, office) : null;
  return { floor: floor.id, goal, burn, rundown };
}
