// The landing page's build: site/landing/ into dist/site/ (or KIPDECK_SITE_OUT, see
// site/env.mjs). The brand is chosen here (KIPDECK_BRAND, see
// brand.ts) and written into the HTML, so a build says one name and only that one. site/build.mjs runs this, then fills in the deploy addresses.
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { brandFor, type Brand } from './brand.ts';
import { siteEnv } from '../env.mjs';

const here = import.meta.dirname;

/** The page's structured data: free, open source software, with no ratings or reviews (it has none). */
export function jsonLd(brand: Brand): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: brand.name,
    description: brand.ogDescription,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    softwareRequirements: 'Node.js 20 or later, git, and one agent CLI (Claude Code, Codex or Cursor CLI)',
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    codeRepository: brand.repo,
    image: 'og.png',
  };
  // No '<' can close the script element early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** {{name}}, {{tagline}}, {{lead}}, {{muted}}, {{pkg}}, {{repo}}, {{folder}}, {{contact}}, {{ogTitle}}, {{ogDescription}}, {{ogImageAlt}} and {{jsonld}} in the HTML. */
function brandHtml(brand: Brand): Plugin {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const values: Record<string, string> = {
    name: brand.name,
    tagline: brand.tagline,
    lead: brand.wordmark.lead,
    muted: brand.wordmark.muted,
    pkg: brand.pkg,
    repo: brand.repo,
    folder: brand.folder,
    contact: brand.contact,
    ogTitle: brand.ogTitle,
    ogDescription: brand.ogDescription,
    // The tab and search result title: the name, then what it is ("Kipdeck: the inbox for your AI coding agents").
    title: `${brand.name}: ${brand.tagline.charAt(0).toLowerCase()}${brand.tagline.slice(1).replace(/\.$/, '')}`,
    ogImageAlt: `${brand.name}: your agents are waiting on you. An inbox row reads waiting 23:04.`,
  };
  return {
    name: 'landing-brand',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const out = html.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
          if (!(key in values) && key !== 'jsonld') throw new Error(`index.html asks for {{${key}}}, which brand.ts does not have`);
          if (key === 'jsonld') return jsonLd(brand);
          return esc(values[key]);
        });
        return out;
      },
    },
  };
}

export default defineConfig(() => {
  const brand = brandFor(siteEnv(process.env, 'BRAND'));
  const out = siteEnv(process.env, 'SITE_OUT');
  return {
    root: here,
    base: './',
    publicDir: resolve(here, 'public'),
    plugins: [brandHtml(brand)],
    // The Labs bridge's worker imports three.js as a module.
    worker: { format: 'es' as const },
    server: { port: 4691, fs: { allow: [resolve(here, '../..')] } },
    build: {
      outDir: out ? resolve(out) : resolve(here, '../../dist/site'),
      emptyOutDir: true,
      target: 'es2022',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      // The one big chunk is the Labs tile's three.js bridge, a worker loaded only on demand (fx/bridge.ts).
      chunkSizeWarningLimit: 600,
    },
  };
});
