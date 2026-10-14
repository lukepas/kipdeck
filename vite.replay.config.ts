import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import base from './vite.config.ts';

// The replay demo (docs/demo.md#the-replay-demo): the home page's and the Deck's own builds with the
// recorded socket (src/client/replay/net.ts) in the live one's place, and the tape beside it, into
// dist/replay/: static files for any host, with nothing live behind them. deploy/replay/vercel.json goes with it.
const NET = resolve(import.meta.dirname, 'src/client/net.ts');
const REPLAY_NET = resolve(import.meta.dirname, 'src/client/replay/net.ts');

/** Every import of net.ts but the replay's own gets the replay's socket. */
function replayNet(): Plugin {
  return {
    name: 'replay-net',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || importer === REPLAY_NET || !/(^|\/)net(\.ts)?$/.test(source)) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      return r?.id === NET ? REPLAY_NET : null;
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'replay/tape.json', source: readFileSync(resolve(import.meta.dirname, 'deploy/replay/tape.json')) });
      this.emitFile({ type: 'asset', fileName: 'vercel.json', source: readFileSync(resolve(import.meta.dirname, 'deploy/replay/vercel.json')) });
    },
  };
}

export default defineConfig({
  ...base,
  plugins: [replayNet()],
  build: {
    ...base.build,
    outDir: resolve(import.meta.dirname, 'dist/replay'),
    rollupOptions: { ...base.build?.rollupOptions, input: { home: resolve(import.meta.dirname, 'src/client/index.html'), bridge: resolve(import.meta.dirname, 'src/client/bridge.html') } },
  },
});
