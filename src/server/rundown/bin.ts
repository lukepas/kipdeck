// The entry of dist/rundown/rundown.mjs (vite.rundown.config.ts): runs the command it's given (cli.ts).
import { main } from './cli.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`rundown: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  },
);
