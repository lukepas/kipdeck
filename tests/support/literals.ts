// The string literals of a TypeScript source, for the copy tests (tests/copy.test.ts and
// tests/one-name.test.ts) to read what people see without the comments and regexes around it.

/** The string literals of a TypeScript source, with their lines: comments and regexes skipped. */
export function literals(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let i = 0;
  let prev = '';
  const lineAt = (at: number) => src.slice(0, at).split('\n').length;
  while (i < src.length) {
    const c = src[i];
    if (src.startsWith('//', i)) {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\breturn$/.test(src.slice(Math.max(0, i - 7), i).trimEnd()))) {
      // A regex: to its closing slash, past escapes and character classes.
      let j = i + 1;
      let cls = false;
      while (j < src.length && (src[j] !== '/' || cls) && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        j++;
      }
      i = j + 1;
      prev = '/';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let depth = 0;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (c === '`' && depth === 0 && src.startsWith('${', j)) {
          depth = 1;
          j += 2;
        } else if (c === '`' && depth > 0) {
          if (src[j] === '{') depth++;
          else if (src[j] === '}') depth--;
          j++;
        } else if (src[j] === c) break;
        else j++;
      }
      out.push({ line: lineAt(i), text: src.slice(i + 1, j) });
      i = j + 1;
      prev = c;
      continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
