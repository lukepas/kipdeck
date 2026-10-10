// What a project says about itself, read from the few files that say it: package manifests (name,
// version, scripts, how many dependencies), CI pipelines (name and triggers), the docs that are there,
// and the README's first paragraph. Never a source file's contents; never a file on the deny list.

import type { FileFacts, ManifestKind } from '../../shared/rundown/schema.js';
import { readSmall } from './files.js';

const MANIFESTS: [RegExp, ManifestKind][] = [
  [/(^|\/)package\.json$/, 'npm'],
  [/(^|\/)pyproject\.toml$/, 'pyproject'],
  [/(^|\/)Cargo\.toml$/, 'cargo'],
  [/(^|\/)go\.mod$/, 'go'],
  [/(^|\/)pom\.xml$/, 'maven'],
  [/(^|\/)build\.gradle(\.kts)?$/, 'gradle'],
  [/\.(csproj|fsproj)$/, 'dotnet'],
  [/(^|\/)composer\.json$/, 'composer'],
  [/(^|\/)Gemfile$/, 'gem'],
];

const tomlField = (text: string, key: string) => new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'm').exec(text)?.[1] ?? null;

export async function manifests(root: string, paths: readonly string[]): Promise<{ list: FileFacts['manifests']; frameworks: string[] }> {
  const list: FileFacts['manifests'] = [];
  const frameworks = new Set<string>();
  const found = paths.filter((p) => p.split('/').length <= 3 && MANIFESTS.some(([re]) => re.test(p))).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b)).slice(0, 20);
  for (const p of found) {
    const kind = MANIFESTS.find(([re]) => re.test(p))![1];
    const text = await readSmall(root, p);
    if (text === null) continue;
    const m: FileFacts['manifests'][number] = { path: p, kind, name: null, version: null, scripts: {}, deps: 0, devDeps: 0, workspaces: [] };
    if (kind === 'npm' || kind === 'composer') {
      try {
        const j = JSON.parse(text) as Record<string, any>;
        m.name = typeof j.name === 'string' ? j.name : null;
        m.version = typeof j.version === 'string' ? j.version : null;
        const scripts = j.scripts && typeof j.scripts === 'object' ? j.scripts : {};
        for (const [k, v] of Object.entries(scripts).slice(0, 40)) if (typeof v === 'string') m.scripts[k] = v.slice(0, 300);
        const deps = { ...(j.dependencies ?? j.require ?? {}) };
        const dev = { ...(j.devDependencies ?? j['require-dev'] ?? {}) };
        m.deps = Object.keys(deps).length;
        m.devDeps = Object.keys(dev).length;
        const ws = Array.isArray(j.workspaces) ? j.workspaces : Array.isArray(j.workspaces?.packages) ? j.workspaces.packages : [];
        m.workspaces = ws.filter((w: unknown): w is string => typeof w === 'string').slice(0, 30);
        const all = { ...deps, ...dev };
        for (const [dep, name] of [['vitest', 'Vitest'], ['jest', 'Jest'], ['mocha', 'Mocha'], ['@playwright/test', 'Playwright'], ['cypress', 'Cypress'], ['ava', 'AVA'], ['tap', 'tap'], ['phpunit/phpunit', 'PHPUnit']] as const) if (dep in all) frameworks.add(name);
        if (Object.values(m.scripts).some((s) => /node\b[^&|;]*--test\b/.test(s))) frameworks.add('node:test');
        if ('playwright-core' in all && Object.values(m.scripts).some((s) => /e2e|playwright/.test(s))) frameworks.add('Playwright');
      } catch {
        // Not JSON: listed without its fields.
      }
    } else if (kind === 'pyproject' || kind === 'cargo') {
      m.name = tomlField(text, 'name');
      m.version = tomlField(text, 'version');
      if (/pytest/.test(text)) frameworks.add('pytest');
      if (kind === 'cargo') frameworks.add('cargo test');
    } else if (kind === 'go') {
      m.name = /^module\s+(\S+)/m.exec(text)?.[1] ?? null;
      frameworks.add('go test');
    } else if (kind === 'maven') {
      m.name = /<artifactId>([^<]+)<\/artifactId>/.exec(text)?.[1] ?? null;
      m.version = /<version>([^<]+)<\/version>/.exec(text)?.[1] ?? null;
      if (/junit/i.test(text)) frameworks.add('JUnit');
    }
    list.push(m);
  }
  return { list, frameworks: [...frameworks] };
}

/** A workflow's name and what starts it, read loosely from its YAML. */
function workflowInfo(text: string): { name: string | null; triggers: string[] } {
  const name = /^name:\s*["']?([^"'\n#]+)["']?\s*$/m.exec(text)?.[1]?.trim() ?? null;
  const triggers = new Set<string>();
  const inline = /^(?:on|"on"|'on'):\s*(.+)$/m.exec(text);
  if (inline && inline[1].trim()) {
    for (const t of inline[1].replace(/[[\]{}]/g, ' ').split(/[\s,]+/)) if (/^[a-z_]+$/.test(t)) triggers.add(t);
  } else {
    const block = /^(?:on|"on"|'on'):\s*\n((?:[ \t]+.*\n?)*)/m.exec(text);
    for (const l of (block?.[1] ?? '').split('\n')) {
      const k = /^ {2}([a-z_]+):?/.exec(l);
      if (k) triggers.add(k[1]);
    }
  }
  return { name, triggers: [...triggers].slice(0, 8) };
}

export async function pipelines(root: string, paths: readonly string[]): Promise<FileFacts['ci']> {
  const out: FileFacts['ci'] = [];
  for (const p of paths) {
    if (out.length >= 20) break;
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(p)) {
      const text = await readSmall(root, p, 128 * 1024);
      out.push({ system: 'github-actions', path: p, ...workflowInfo(text ?? '') });
    } else if (p === '.gitlab-ci.yml') out.push({ system: 'gitlab', path: p, name: null, triggers: [] });
    else if (p === 'azure-pipelines.yml') out.push({ system: 'azure', path: p, name: null, triggers: [] });
    else if (p === 'Jenkinsfile') out.push({ system: 'jenkins', path: p, name: null, triggers: [] });
    else if (p === '.circleci/config.yml') out.push({ system: 'circleci', path: p, name: null, triggers: [] });
  }
  return out;
}

export function docsOf(paths: readonly string[]): FileFacts['docs'] {
  const top = new Set(paths.filter((p) => !p.includes('/')).map((p) => p.toLowerCase()));
  const has = (re: RegExp) => [...top].some((p) => re.test(p));
  const docsDir = ['docs', 'doc', 'documentation'].find((d) => paths.some((p) => p.startsWith(`${d}/`))) ?? null;
  const agentFiles = paths.filter((p) => /^(CLAUDE\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.cursor\/rules\/.+)$/.test(p)).slice(0, 10);
  return {
    readme: has(/^readme(\.|$)/),
    docsDir,
    docsFiles: docsDir ? paths.filter((p) => p.startsWith(`${docsDir}/`)).length : 0,
    changelog: has(/^(changelog|changes|history)(\.|$)/),
    contributing: has(/^contributing(\.|$)/),
    license: has(/^(license|licence|copying)(\.|$)/),
    architecture: has(/^architecture(\.|$)/) || paths.some((p) => /(^|\/)(docs?\/)?architecture[^/]*\.md$/i.test(p)),
    agentFiles,
    adrs: paths.filter((p) => /(^|\/)(adrs?|decisions)\/[^/]+\.md$/i.test(p)).length,
  };
}

/** The README's first paragraph of prose (not a heading, badge, list or HTML), 300 characters at most. */
export async function readmeDescription(root: string, paths: readonly string[]): Promise<string | null> {
  const readme = paths.find((p) => /^readme(\.md|\.markdown|\.txt|\.rst)?$/i.test(p));
  if (!readme) return null;
  const text = await readSmall(root, readme, 64 * 1024);
  if (!text) return null;
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    const t = para.trim();
    if (!t || /^(#|!\[|\[!\[|<|[-*+]\s|\d+\.\s|```|>|\||=+$|-+$)/.test(t)) continue;
    const plain = t
      .replace(/\s+/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    if (plain.length < 20) continue;
    return plain.length > 300 ? `${plain.slice(0, 297).trimEnd()}...` : plain;
  }
  return null;
}
