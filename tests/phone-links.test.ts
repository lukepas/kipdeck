import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Webhook } from '../src/server/webhook.js';
import type { Reminder, WorkerInfo } from '../src/shared/protocol.js';

// A post to the team channel links to the agent in the inbox (/a/<project>/<agent>) once the office
// has a secure address to link to, and carries no link without one. What's posted is read off the
// body as it's put together; the post itself goes nowhere (an address the office never posts to).

const worker = { id: 'w1', kind: 'agent', deskId: 'desk-1', name: 'Mochi', color: '#fff', status: 'needs_input', acked: false, createdBy: 'Ada', createdAt: 0, viewers: [] } as unknown as WorkerInfo;

async function posted(t: Parameters<Parameters<typeof test>[1]>[0], url: string, link: Webhook['link']): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-links-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  t.mock.method(console, 'error', () => {});
  const bodies: Record<string, unknown>[] = [];
  const stringify = JSON.stringify;
  t.mock.method(JSON, 'stringify', function (this: unknown, ...args: Parameters<typeof JSON.stringify>) {
    const v = args[0] as Record<string, unknown> | undefined;
    if (v && typeof v === 'object' && ('text' in v || 'content' in v)) bodies.push(v);
    return stringify.apply(JSON, args);
  });
  // Every name resolves to this machine, which is never posted to: nothing leaves it.
  const hook = new Webhook(dir, () => 'acme-shop', () => {}, (id) => (id === worker.id ? worker : undefined), { resolve: (_h, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]) });
  hook.link = link;
  assert.equal(hook.set(url, 'Ada'), undefined);
  hook.onReminder({ floorName: 'acme-shop', text: 'Mochi has waited on you for over an hour', worker: 'w1' } as Reminder);
  for (let i = 0; i < 200 && !hook.state().error; i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(hook.state().error ?? '', /public internet/, 'it was never sent');
  assert.equal(bodies.length, 1);
  return bodies[0];
}

test('a post links to the agent in the inbox when the office has a secure address', async (t) => {
  const link = (w: WorkerInfo) => `https://office.example.com/a/acme/${w.id}`;
  const slack = await posted(t, 'https://hooks.slack.com/services/T/B/x', link);
  assert.match(String(slack.text), /\n<https:\/\/office\.example\.com\/a\/acme\/w1\|Open it in Kipdeck>$/);
});

test('a Discord post carries the link too', async (t) => {
  const link = (w: WorkerInfo) => `https://office.example.com/a/acme/${w.id}`;
  const discord = await posted(t, 'https://discord.com/api/webhooks/1/x', link);
  assert.match(String(discord.content), /\nhttps:\/\/office\.example\.com\/a\/acme\/w1$/);
});

test('a plain webhook gets the link as a field of its own', async (t) => {
  const other = await posted(t, 'https://hooks.example.com/kipdeck', (w) => `https://office.example.com/a/acme/${w.id}`);
  assert.equal(other.link, 'https://office.example.com/a/acme/w1');
});

test('without a secure address there is no link', async (t) => {
  const body = await posted(t, 'https://hooks.example.com/kipdeck', () => undefined);
  assert.equal('link' in body, false);
  assert.doesNotMatch(String(body.text), /https:\/\//);
});
