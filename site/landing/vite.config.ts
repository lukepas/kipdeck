// The landing page's build: site/landing/ into dist/site/ (or MERGELINE_SITE_OUT). The brand is
// chosen here (MERGELINE_BRAND, see brand.ts) and written into the HTML, so a build
// says one name and only that one. site/build.mjs runs this, then fills in the deploy addresses.
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { brandFor, type Brand } from './brand.ts';

const here = import.meta.dirname;

/** {{name}}, {{tagline}}, {{lead}}, {{muted}}, {{pkg}}, {{folder}}, {{ogTitle}}, {{ogDescription}} in the HTML. */
function brandHtml(brand: Brand): Plugin {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const values: Record<string, string> = {
    name: brand.name,
    tagline: brand.tagline,
    lead: brand.wordmark.lead,
    muted: brand.wordmark.muted,
    pkg: brand.pkg,
    folder: brand.folder,
    ogTitle: brand.ogTitle,
    ogDescription: brand.ogDescription,
  };
  return {
    name: 'landing-brand',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const out = html.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
          if (!(key in values)) throw new Error(`index.html asks for {{${key}}}, which brand.ts does not have`);
          return esc(values[key]);
        });
        return out;
      },
    },
  };
}

export default defineConfig(() => {
  const brand = brandFor(process.env.MERGELINE_BRAND);
  return {
    root: here,
    base: './',
    publicDir: resolve(here, 'public'),
    plugins: [brandHtml(brand)],
    server: { port: 4691, fs: { allow: [resolve(here, '../..')] } },
    build: {
      outDir: process.env.MERGELINE_SITE_OUT ? resolve(process.env.MERGELINE_SITE_OUT) : resolve(here, '../../dist/site'),
      emptyOutDir: true,
      target: 'es2022',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      // The one big chunk is the Labs tile's three.js bridge, loaded only on demand (fx/bridge.ts).
      chunkSizeWarningLimit: 600,
    },
  };
});
