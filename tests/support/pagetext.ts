// What a person reads on an HTML page, for the name and copy tests (tests/old-names.test.ts and
// tests/one-name.test.ts).

/** A page's text: no scripts, styles or comments, no tags, the common entities decoded. */
export function pageText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** The attributes a person or a screen reader meets on a page: title, alt, aria-label, placeholder and meta content. */
export function pageAttributes(html: string): string[] {
  return [...html.matchAll(/\b(?:title|alt|aria-label|placeholder|content)="([^"]*)"/g)].map((m) => m[1]);
}
