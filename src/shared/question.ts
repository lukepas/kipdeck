// What an agent that needs you is asking, read off the bottom of its terminal: the last block of text
// above its prompt, and the numbered choices when it offers some. Every agent CLI draws its question
// its own way (Claude Code in a box with "1. Yes", Codex as a line, the demo's stand-ins with "? "),
// so this reads the screen the way a person would rather than one CLI's hook payload. Pure, so the
// tests read it directly; the home page's question card (home/question.ts) shows what it finds.

export interface QuestionChoice {
  /** What to type to pick it: its number. */
  key: string;
  label: string;
}

export interface Question {
  /** The question's lines, without the choices, frames or prompt marks. */
  text: string[];
  choices: QuestionChoice[];
}

/** A line that is only a frame, a rule or a prompt mark with nothing typed after it. */
const EMPTYISH = /^[\s─-╿▀-▟>❯›?$#%*·.:-]*$/;
/** A key hint under a menu ("Esc to cancel · Tab to amend", "Enter to confirm"): not part of the question. */
const HINT = /^(?:esc|enter|tab|ctrl|shift|press|↑|↓)\b.*\bto\b/i;
/** A numbered choice: "1. Yes", "❯ 2) No, and tell it what to do", "> 3. Something else". */
const CHOICE = /^(?:[❯›>▶*]\s*)?([1-9])[.)]\s+(.{1,80}?)\s*$/;
/** At most this many lines of question, the last ones (the end of a long explanation is the question). */
const MAX_LINES = 6;

/** A line without the frame round it and the marks agents put in front of a question. */
function clean(line: string): string {
  return line
    .replace(/[─-╿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[?●•◆>❯›]\s+/, '')
    .trim();
}

/**
 * The question in `screen` (the terminal's visible lines, top to bottom), or undefined when there is
 * nothing to read: the trailing blank and prompt-only lines go, then the block above them up to the
 * blank line before it, its numbered lines taken as the choices.
 */
export function readQuestion(screen: readonly string[]): Question | undefined {
  const lines = screen.map(clean);
  let end = lines.length;
  while (end > 0 && (EMPTYISH.test(lines[end - 1]) || HINT.test(lines[end - 1]))) end--;
  if (!end) return undefined;
  let start = end - 1;
  // A block of choices can be separated from its question by one blank line; a second one ends it.
  let gaps = 0;
  while (start > 0) {
    const above = lines[start - 1];
    if (EMPTYISH.test(above)) {
      const choicesSoFar = lines.slice(start, end).some((l) => CHOICE.test(l));
      const allChoices = lines.slice(start, end).every((l) => CHOICE.test(l) || !l);
      if (gaps || !choicesSoFar || !allChoices) break;
      gaps++;
    }
    start--;
  }
  const block = lines.slice(start, end).filter((l) => l && !EMPTYISH.test(l));
  const choices: QuestionChoice[] = [];
  const text: string[] = [];
  for (const l of block) {
    const m = CHOICE.exec(l);
    if (m && !choices.some((c) => c.key === m[1])) choices.push({ key: m[1], label: m[2] });
    else if (!m) text.push(l);
  }
  if (!text.length && !choices.length) return undefined;
  return { text: text.slice(-MAX_LINES), choices: choices.length >= 2 ? choices : [] };
}
