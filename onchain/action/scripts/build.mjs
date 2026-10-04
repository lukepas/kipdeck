// Bundles the action into dist/, the files GitHub runs and that are committed:
//   dist/index.mjs     the action (src/main.ts, with the Solana SDK and onchain/attest's attestor)
//   dist/ao-bounty.mjs the SDK's ao-bounty CLI, for the approver's cosign step
// Bare imports (viem) always resolve from this package's own node_modules, even when the source that
// imports them lives in onchain/attest, so the bundle is built from this package's lockfile alone.
//
//   node scripts/build.mjs           write dist/
//   node scripts/build.mjs --out D   write to D instead (the test that checks dist/ is up to date)
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = process.argv.indexOf('--out');
const outdir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(root, 'dist');

/** Resolves every bare package import from this package's directory. */
const ownDeps = {
  name: 'own-deps',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, async (args) => {
      if (args.path.startsWith('node:') || args.pluginData?.own) return undefined;
      if (args.resolveDir.startsWith(path.join(root, 'node_modules'))) return undefined;
      const r = await b.resolve(args.path, { kind: args.kind, resolveDir: root, importer: args.importer, pluginData: { own: true } });
      return r.errors.length ? { errors: r.errors } : r;
    });
  },
};

const banner = '// Built by `npm run build` in onchain/action from its src/ and the onchain/solana and onchain/attest sources. Do not edit: rebuild.';

await build({
  entryPoints: { index: path.join(root, 'src/main.ts'), 'ao-bounty': path.join(root, '../solana/sdk/src/cli.ts') },
  outdir,
  // The paths in the bundle's comments are relative to this, so the output is the same from any directory.
  absWorkingDir: root,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  minify: false,
  treeShaking: true,
  // ESM entry points first, so the dependencies tree-shake (their CommonJS builds don't).
  mainFields: ['module', 'main'],
  conditions: ['import', 'module'],
  plugins: [ownDeps],
  banner: { js: banner },
  logLevel: 'warning',
});
