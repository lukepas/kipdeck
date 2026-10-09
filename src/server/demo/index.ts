// `kipdeck --demo` (see script.ts): sets the office up to run the demo before it starts, and puts the
// throwaway home away after it stops. The director (director.ts) takes it from there.
import { rmSync } from 'node:fs';
import path from 'node:path';
import { brandEnv } from '../brandenv.js';
import type { Config } from '../config.js';
import { demoPace, prepareDemo, type DemoWorkspace } from './workspace.js';

/**
 * Makes the demo's workspace in the office's home and points the office at it: the stand-ins first on
 * its PATH (so Codex and Cursor are theirs too) and as its agent, the throwaway repository as the
 * project it starts with. A string says why it can't.
 */
export function setUpDemo(cfg: Config): DemoWorkspace | string {
  if (!cfg.demo) return 'not a demo';
  if (process.platform === 'win32') return 'the demo runs on macOS and Linux (its stand-in agents are sh scripts); on Windows, use WSL';
  let ws: DemoWorkspace;
  try {
    ws = prepareDemo(cfg.dir, demoPace(brandEnv('DEMO_PACE')));
  } catch (err) {
    return `couldn't make the demo's repository (is git installed?): ${(err as Error).message}`;
  }
  process.env.PATH = [ws.bin, process.env.PATH].filter(Boolean).join(path.delimiter);
  cfg.agentCmd = path.join(ws.bin, 'claude');
  cfg.agentArgs = [];
  cfg.startedIn = ws.repo;
  cfg.demo.workspace = ws;
  return ws;
}

/** Deletes a demo's temporary home (`--demo` without `--home`) once the office has stopped. */
export function removeDemoHome(cfg: Config) {
  if (!cfg.demo?.temp) return;
  const root = path.dirname(cfg.dir);
  if (!path.basename(root).startsWith('kipdeck-demo-')) return;
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // the system's temporary folder is cleaned up in the end anyway
  }
}
