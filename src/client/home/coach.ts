// The demo's coach strip over the inbox (shared/democoach.ts): three steps that walk you through the
// loop the demo opens with, a question in Needs you and a change in To review, and end on "Run it on
// your repo" with the command to copy (a Copy command button when it is too long to show). A step you've done gets its check; pressing one opens the agent it's about.
// Loaded by demo.ts only in a demo office, so the inbox loads none of it up front.
import { coachRun, coachSteps, type CoachSeen } from '../../shared/democoach';
import { fitsPill, type DemoInfo } from '../../shared/demo';
import { store } from '../state';
import { h, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { currentView } from './list';
import { copyLine } from './setup';
import { home } from './state';
import './coach.css';

let info: DemoInfo | undefined;
let asked = false;
let strip: HTMLElement | undefined;
let followed = false;

/** Shows the strip for this demo office, or takes it away (undefined). */
export function showCoach(demo: DemoInfo | undefined) {
  info = demo;
  if (!followed) {
    followed = true;
    home.on(draw);
    store.on('roster', draw);
  }
  draw();
}

/** Where the demo's inbox is now, for the steps' checks. */
function seen(): CoachSeen {
  const needsYou = currentView().sections['needs-you'].length;
  if (needsYou) asked = true;
  return { asked, needsYou, merged: home.records.filter((r) => r.kind === 'merged').length };
}

function draw() {
  if (!info) {
    strip?.remove();
    strip = undefined;
    return;
  }
  const inbox = document.getElementById('inbox');
  if (!inbox) return;
  if (!strip) {
    strip = h('nav.coach', { id: 'demo-coach', 'aria-label': 'Try the demo' });
    inbox.before(strip);
  }
  const d = info;
  const steps = coachSteps(d, seen());
  const run = coachRun(d);
  // Drawn again only when a step changes, so a button you're on keeps its focus.
  const key = `${d.readOnly}|${steps.map((s) => +s.done).join('')}|${run.command}`;
  if (strip.dataset.key === key) return;
  strip.dataset.key = key;
  const open = (section: 'needs-you' | 'review') => {
    const first = currentView().sections[section][0]?.entry;
    if (first) home.select(first.id, section === 'needs-you' ? 'terminal' : 'changes');
  };
  const items = steps.map((s, i) => {
    const mark = h('span.coach-n', { 'aria-hidden': 'true' }, s.done ? icon('check', 12) : String(i + 1));
    if (s.id === 'run') {
      return h('li.coach-step.coach-last', { title: run.note }, mark, h('span.coach-run', {}, s.label), runLine(run.command));
    }
    const act = h('button.coach-go', { type: 'button', onclick: () => open(s.id === 'answer' ? 'needs-you' : 'review') }, s.label);
    return h('li.coach-step', { class: s.done ? 'done' : '' }, mark, act);
  });
  strip.replaceChildren(h('span.coach-tag', {}, 'Try it'), h('ol.coach-steps', {}, ...items));
}

/** The command to copy: shown when it's short, else a Copy command button (shared/demo.ts fitsPill). */
function runLine(command: string): HTMLElement {
  if (fitsPill(command)) return copyLine(command);
  const btn = h('button.btn.quiet.small.copy.copy-cmd', { type: 'button', title: command, 'aria-label': `Copy ${command}` }, icon('copy', 12), 'Copy command');
  btn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(command).then(
      () => toast('Copied'),
      () => {},
    );
  });
  return h('span.fix', {}, btn);
}
