// A small SVG builder for the Rundown window's drawings (treemap.ts, heatmap.ts, branches.ts).
type Attrs = Record<string, string | number | undefined | null | false>;

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null | false | undefined)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

export const title = (text: string) => s('title', {}, text);
