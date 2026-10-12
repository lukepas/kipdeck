// The replay tape's scrubber (see record.mjs): the recording's own folders become the hosted demo's
// (/home/demo/office, as in deploy/demo/Dockerfile), and anything that looks like a secret or names this
// computer fails the recording instead of being published.

/** What looks like a credential, by its well-known shape. */
export const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b0x[0-9a-fA-F]{64}\b/,
];

/** Folders that would say whose computer recorded it. */
const LOCAL_PATHS = [/\/Users\/[^/"\s]+/, /\/(?:private\/)?var\/folders\//, /\/home\/(?!demo\b)[^/"\s]+/];

/**
 * The tape's text with each `[from, to]` replaced, longest first, so a folder inside another is
 * replaced as part of it.
 */
export function scrub(text, replacements) {
  let out = text;
  for (const [from, to] of [...replacements].filter(([f]) => f).sort((a, b) => b[0].length - a[0].length)) out = out.split(from).join(to);
  return out;
}

/** Why the tape can't be published (secrets, this computer's folders, `forbidden` words), or [] when it can. */
export function leaks(text, forbidden = []) {
  const found = [];
  for (const re of SECRET_PATTERNS) {
    const m = re.exec(text);
    if (m) found.push(`a secret-shaped string (${re.source}): ${m[0].slice(0, 12)}...`);
  }
  for (const re of LOCAL_PATHS) {
    const m = re.exec(text);
    if (m) found.push(`a local folder: ${m[0]}`);
  }
  for (const word of forbidden) if (word && word.length >= 3 && text.includes(word)) found.push(`a local name: ${word}`);
  return found;
}
