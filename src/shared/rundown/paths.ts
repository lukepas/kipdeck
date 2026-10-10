// What the collector reads, skips and never opens, and how a repo path belongs to a part. Pure, so the
// skill's collector, the office's and the tests share one list. Paths are repo-relative with '/'.

import { BUCKET_DEPTH } from './schema.js';

/** Folders never listed: git's own, the office's data (with the workers' worktrees), our output, dependencies. */
const SKIP_DIR_SEGMENTS = new Set(['.git', 'node_modules', '.agent-office', '.rundown', '.project-map']);

/** Whether a path is left out altogether. */
export function excludedPath(p: string): boolean {
  if (p.startsWith('.claude/worktrees/')) return true;
  for (const seg of p.split('/').slice(0, -1)) if (SKIP_DIR_SEGMENTS.has(seg)) return true;
  return false;
}

/** Tools' own caches and snapshots that land in a checkout untracked (a browser tool's page dumps, build caches). */
const TOOL_CACHE_SEGMENTS = new Set(['.playwright-mcp', '.cache', '.turbo', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.parcel-cache', '.next', '.nuxt', '.svelte-kit', '__pycache__', '.venv', 'venv', '.tox', '.gradle', '.idea', '.vscode']);

/** Whether an untracked path is a tool's cache rather than the project's own work (left out of the counts). */
export function toolCachePath(p: string): boolean {
  for (const seg of p.split('/').slice(0, -1)) if (TOOL_CACHE_SEGMENTS.has(seg)) return true;
  return false;
}

/**
 * File names that may hold secrets or personal data: counted, never opened. Keys and keystores,
 * .env files, anything named for credentials, secrets or a vault, database dumps, backups and logs.
 */
export function sensitivePath(p: string): boolean {
  const name = (p.split('/').pop() ?? '').toLowerCase();
  if (name.startsWith('.env')) return true;
  if (/\.(pem|key|p12|pfx|jks|keystore|sql|dump|bak|log)$/.test(name)) return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)/.test(name)) return true;
  if (/credential|secret|vault|\.netrc|\.npmrc|\.pypirc/.test(name)) return true;
  const dir = p.toLowerCase();
  return /(^|\/)\.(ssh|aws|kube|gnupg)\//.test(dir);
}

/** Listed and counted, but not in the line totals: lockfiles, minified and built output. */
export function generatedPath(p: string): boolean {
  const name = p.split('/').pop() ?? '';
  if (/(^|\/)(dist|build|out|coverage|vendor)\//.test(p)) return true;
  if (/\.min\.[a-z]+$/i.test(name) || /\.map$/.test(name)) return true;
  return /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|bun\.lockb)$/.test(name);
}

/** Never read for lines: media, fonts, archives and other binaries (by extension, before opening). */
const BINARY_EXT = new Set(
  'png jpg jpeg gif webp avif ico bmp tiff psd svgz mp4 mov webm mkv avi mp3 wav ogg flac m4a woff woff2 ttf otf eot zip gz tgz bz2 xz 7z rar jar war ear class pdf doc docx xls xlsx ppt pptx glb gltf bin fbx obj blend hdr exr ktx2 wasm so dylib dll exe node pyc o a lib sqlite db'.split(' '),
);

export function binaryByName(p: string): boolean {
  const ext = (p.split('.').pop() ?? '').toLowerCase();
  return p.includes('.') && BINARY_EXT.has(ext);
}

const LANG: Readonly<Record<string, string>> = {
  ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', cts: 'TypeScript',
  js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  cs: 'C#', fs: 'F#', vb: 'Visual Basic', php: 'PHP', swift: 'Swift', m: 'Objective-C', mm: 'Objective-C',
  c: 'C', h: 'C', cc: 'C++', cpp: 'C++', cxx: 'C++', hpp: 'C++', dart: 'Dart', ex: 'Elixir', exs: 'Elixir',
  erl: 'Erlang', clj: 'Clojure', hs: 'Haskell', lua: 'Lua', r: 'R', jl: 'Julia', sol: 'Solidity',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS',
  md: 'Markdown', mdx: 'Markdown', rst: 'reStructuredText', txt: 'Text',
  json: 'JSON', jsonc: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML', ini: 'INI',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', bat: 'Batch',
  sql: 'SQL', graphql: 'GraphQL', gql: 'GraphQL', proto: 'Protobuf', tf: 'Terraform', hcl: 'Terraform',
  glsl: 'GLSL', wgsl: 'WGSL', svg: 'SVG',
};

/** A file's language by its extension (or its name: Dockerfile, Makefile), "Other" when unknown. */
export function languageOf(p: string): string {
  const name = p.split('/').pop() ?? '';
  if (/^Dockerfile/.test(name)) return 'Dockerfile';
  if (/^(Makefile|GNUmakefile)$/.test(name)) return 'Makefile';
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return LANG[ext] ?? 'Other';
}

/** A test file by its path: a tests folder, or a .test./.spec./_test name. */
export function testPath(p: string): boolean {
  const name = p.split('/').pop() ?? '';
  if (/\.(test|spec|e2e)\.[a-z0-9]+$/i.test(name) || /_test\.(go|py|rb|exs?)$/.test(name) || /^test_.*\.py$/.test(name) || /Tests?\.(java|kt|cs)$/.test(name)) return true;
  return /(^|\/)(tests?|__tests__|spec|e2e)\//.test(p) && /\.[a-z]+$/i.test(name) && languageOf(p) !== 'Markdown' && languageOf(p) !== 'JSON';
}

/** The first folder of a path ("." for a file at the root). */
export function topFolder(p: string): string {
  const i = p.indexOf('/');
  return i < 0 ? '.' : p.slice(0, i);
}

/** The folder bucket a file counts toward: its folder, cut to `depth` levels ("" at the root). */
export function bucketOf(p: string, depth = BUCKET_DEPTH): string {
  const segs = p.split('/').slice(0, -1);
  return segs.slice(0, depth).join('/');
}

/** A glob's literal folder prefix: "src/server/**" -> "src/server", "src/*.ts" -> "src", "README.md" -> "README.md". */
function globBase(glob: string): string {
  const clean = glob.replace(/^\.\//, '').replace(/\/+$/, '');
  const segs = clean.split('/');
  const out: string[] = [];
  for (const s of segs) {
    if (/[*?[\]{}]/.test(s)) break;
    out.push(s);
  }
  return out.join('/');
}

/** Whether `glob` covers `path` (a file or a folder bucket): its literal prefix contains it, or is it. */
export function globCovers(glob: string, path: string): boolean {
  const base = globBase(glob);
  if (!base) return true;
  return path === base || path.startsWith(`${base}/`);
}

/** How specific a glob is: the depth of its literal prefix. The most specific part wins a path. */
export function globDepth(glob: string): number {
  const base = globBase(glob);
  return base ? base.split('/').length : 0;
}

/** The part a path belongs to: the one with the most specific glob covering it, else null. */
export function partOfPath(parts: readonly { id: string; paths: readonly string[] }[], path: string): string | null {
  let best: string | null = null;
  let depth = -1;
  for (const part of parts) {
    for (const g of part.paths) {
      if (!globCovers(g, path)) continue;
      const d = globDepth(g);
      if (d > depth) {
        depth = d;
        best = part.id;
      }
    }
  }
  return best;
}

/** A slug for an id: lower case, dashes, 40 characters at most. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'part'
  );
}

/** A remote URL as owner/name, credentials and host left out; null when it isn't one. */
export function remoteName(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.trim().replace(/^[a-z+]+:\/\/[^@/]*@/i, (m) => m.replace(/\/\/[^@/]*@/, '//'));
  const m = /[:/]([^/:]+)\/([^/]+?)(\.git)?\/?$/.exec(clean);
  return m ? `${m[1]}/${m[2]}` : null;
}
