// The crew voice's hard edges, as data the copy tests and the builders share (docs/voice.md is the
// guide). Warm words are welcome in greetings, empty states, toasts after a done action and
// celebrations. They are never welcome where a person decides, pays, signs in or can lose work.

/** What fun looks like in a string, each with the reason it is out of place on a plain surface. */
export const FUN_MARKERS: readonly { why: string; re: RegExp }[] = [
  { why: 'an exclamation mark', re: /!(\s|$)/ },
  { why: "Kip's name", re: /\bKip\b/ },
  { why: 'a crew word', re: /\b(crew|crewmate|aboard|on watch|night shift|quiet deck|today's tape|b-sides)\b/i },
  { why: 'a cheer or a thank-you', re: /\b(thanks|thank you|nice work|good watch|tight crew|clean ships?)\b/i },
  { why: 'an emoji', re: /[\u{1F300}-\u{1FAFF}☀-➿]/u },
];

/** The reasons `text` would not belong on a plain surface (an error, an approval, a cost, a confirm). Empty when it is plain. */
export function funIn(text: string): string[] {
  return FUN_MARKERS.filter((m) => m.re.test(text)).map((m) => m.why);
}

/**
 * How many strings in the product may end on an exclamation mark: one, the first merge ever. Every
 * other line says its fact and stops.
 */
export const EXCLAMATION_BUDGET = 1;

