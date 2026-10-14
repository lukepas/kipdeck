// POST /office/decide on the loopback hook server: an agent's `kipdeck decide` (rundown/decide.ts)
// from inside the office. Its own worker id and hook token say who asks, as for office-workers; the
// decision goes into its project's .rundown/decisions.md with "Raised by:" naming it, every page
// that listens hears of it at once (Needs you), and the answer comes back later as a message in the
// agent's session (yourcall.ts). Only while the Rundown lab is on, since that's where it shows.
import type http from 'node:http';
import { readAsk } from '../../shared/rundown/answer.js';
import { readBody, send } from '../http/util.js';
import type { Ctx } from '../office/context.js';
import { raiseInFile } from './answer.js';
import { excludeOutput } from './cli.js';
import { pushCall } from './yourcall.js';

export async function officeDecide(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const me = floor?.workers.authenticate(workerId, token);
  if (!floor || !me) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  if (req.method !== 'POST') return send(res, 405, { error: 'POST /office/decide' });
  if (!ctx.labs.on('rundown')) return send(res, 409, { error: 'Rundown is off in this Kipdeck, so nobody would see the decision. Go on with your default, and say in your summary what you assumed.' });
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req)) || '{}');
  } catch {
    return send(res, 400, { error: 'Send JSON' });
  }
  const ask = readAsk(body);
  if (typeof ask === 'string') return send(res, 400, { error: ask });
  let raised: ReturnType<typeof raiseInFile>;
  try {
    raised = raiseInFile(floor.dir, ask, { id: me.id, name: me.name });
  } catch (err) {
    return send(res, 500, { error: `Couldn't write .rundown/decisions.md: ${err instanceof Error ? err.message : String(err)}` });
  }
  if ('error' in raised) return send(res, 409, { error: raised.error });
  await excludeOutput(floor.dir).catch(() => {});
  await pushCall(ctx, true).catch(() => {});
  send(res, 200, { id: raised.id, project: floor.def.name, default: ask.default });
}
