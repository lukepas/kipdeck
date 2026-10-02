import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_ENV, HOST_ENV, SANDBOX_ENV, envAllowed, pickEnv, splitEnvNames, validEnvPattern } from '../src/server/worker-env.js';
import { childEnv } from '../src/server/workers.js';
import { setWorkerEnv } from '../src/server/workers/env.js';

const office = {
  PATH: '/usr/bin',
  HOME: '/home/me',
  TERM: 'xterm',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'C',
  NVM_DIR: '/home/me/.nvm',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  GH_TOKEN: 'gh-test',
  AWS_SECRET_ACCESS_KEY: 'aws-test',
  DATABASE_URL: 'postgres://u:p@db/x',
  SENTRY_DSN: 'https://x@sentry',
  SENTRY_ORG: 'org',
  CLAUDECODE: '1',
  AGENT_OFFICE_PASSWORD: 'office-test',
  AGENT_OFFICE_TURN: 'turn:office:secret@turn.example.com:3478',
  Path: 'C:\\Windows',
};

test('a name or a trailing-* prefix matches, whatever its case', () => {
  assert.equal(envAllowed('LC_ALL', ['LC_*']), true);
  assert.equal(envAllowed('Path', ['PATH']), true);
  assert.equal(envAllowed('PATHS', ['PATH']), false);
  assert.equal(envAllowed('SENTRY_DSN', ['SENTRY_*']), true);
  assert.equal(envAllowed('XSENTRY_DSN', ['SENTRY_*']), false);
  assert.equal(envAllowed('ANY', []), false);
});

test('--worker-env takes names and prefixes, nothing that could be a value', () => {
  assert.deepEqual(splitEnvNames('AWS_PROFILE, SENTRY_* ,FOO'), ['AWS_PROFILE', 'SENTRY_*', 'FOO']);
  assert.deepEqual(splitEnvNames(''), []);
  for (const ok of ['AWS_PROFILE', 'SENTRY_*', '_X', 'PROGRAMFILES(X86)']) assert.equal(validEnvPattern(ok), true, ok);
  for (const bad of ['A=B', '*', '1ABC', 'A*B', 'has space', '']) assert.equal(validEnvPattern(bad), false, bad);
});

test('the clean allowlist keeps the terminal, the toolchains and the agent sign-ins, and drops the rest', () => {
  const env = pickEnv(office, { policy: 'clean', allow: [] });
  for (const k of ['PATH', 'HOME', 'TERM', 'LANG', 'LC_ALL', 'NVM_DIR', 'ANTHROPIC_API_KEY', 'GH_TOKEN', 'Path']) assert.equal(env[k], office[k as keyof typeof office], k);
  for (const k of ['AWS_SECRET_ACCESS_KEY', 'DATABASE_URL', 'SENTRY_DSN', 'SENTRY_ORG']) assert.equal(k in env, false, k);
});

test('--worker-env adds to the allowlist, and --inherit-env passes everything', () => {
  const more = pickEnv(office, { policy: 'clean', allow: ['SENTRY_*', 'DATABASE_URL'] });
  assert.equal(more.SENTRY_DSN, office.SENTRY_DSN);
  assert.equal(more.SENTRY_ORG, office.SENTRY_ORG);
  assert.equal(more.DATABASE_URL, office.DATABASE_URL);
  assert.equal('AWS_SECRET_ACCESS_KEY' in more, false);
  const all = pickEnv(office, { policy: 'inherit', allow: [] });
  assert.equal(all.AWS_SECRET_ACCESS_KEY, office.AWS_SECRET_ACCESS_KEY);
  assert.equal(Object.keys(all).length, Object.keys(office).length);
});

test('a sandboxed worker gets only the terminal variables and what it was allowed, no sign-ins or host paths', () => {
  const env = pickEnv(office, { policy: 'sandbox', allow: ['ANTHROPIC_API_KEY'] });
  assert.deepEqual(Object.keys(env).sort(), ['ANTHROPIC_API_KEY', 'LANG', 'LC_ALL', 'TERM']);
  assert.ok(SANDBOX_ENV.every((n) => HOST_ENV.includes(n)), 'what the sandbox passes, the clean allowlist passes too');
  assert.equal(AGENT_ENV.some((n) => SANDBOX_ENV.includes(n)), false);
});

test('childEnv still scrubs a parent session and the office\'s own variables under every policy', () => {
  for (const policy of ['clean', 'inherit', 'sandbox'] as const) {
    const env = childEnv({ policy, allow: ['CLAUDECODE', 'AGENT_OFFICE_*'] }, office);
    assert.equal('CLAUDECODE' in env, false, policy);
    assert.equal('AGENT_OFFICE_PASSWORD' in env, false, policy);
    assert.equal('AGENT_OFFICE_TURN' in env, false, policy);
  }
  // Without one it's the office's own: the allowlist, unless it was started with --inherit-env.
  assert.equal(childEnv(undefined, office).DATABASE_URL, undefined);
  assert.equal(childEnv(undefined, office).PATH, office.PATH);
  setWorkerEnv({ policy: 'inherit', allow: [] });
  try {
    assert.equal(childEnv(undefined, office).DATABASE_URL, office.DATABASE_URL);
  } finally {
    setWorkerEnv({ policy: 'clean', allow: [] });
  }
});

test("a cloud provider's credentials come along only when Claude Code is set to use that provider", () => {
  const base = { PATH: '/usr/bin', AWS_ACCESS_KEY_ID: 'aws-id', AWS_REGION: 'eu-north-1', GOOGLE_APPLICATION_CREDENTIALS: '/k.json', CLOUD_ML_REGION: 'us-east5' };
  const clean = { policy: 'clean' as const, allow: [] };
  const none = pickEnv(base, clean);
  assert.equal(none.AWS_ACCESS_KEY_ID, undefined, "the office's AWS keys stay with it by default");
  assert.equal(none.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  const bedrock = pickEnv({ ...base, CLAUDE_CODE_USE_BEDROCK: '1' }, clean);
  assert.equal(bedrock.AWS_ACCESS_KEY_ID, 'aws-id');
  assert.equal(bedrock.AWS_REGION, 'eu-north-1');
  assert.equal(bedrock.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(pickEnv({ ...base, CLAUDE_CODE_USE_BEDROCK: '0' }, clean).AWS_ACCESS_KEY_ID, undefined, '=0 is off');
  const vertex = pickEnv({ ...base, CLAUDE_CODE_USE_VERTEX: 'true' }, clean);
  assert.equal(vertex.GOOGLE_APPLICATION_CREDENTIALS, '/k.json');
  assert.equal(vertex.CLOUD_ML_REGION, 'us-east5');
  assert.equal(vertex.AWS_ACCESS_KEY_ID, undefined);
  // The sandbox passes none of it unless named.
  assert.equal(pickEnv({ ...base, CLAUDE_CODE_USE_BEDROCK: '1' }, { policy: 'sandbox', allow: [] }).AWS_ACCESS_KEY_ID, undefined);
});

test("Claude Code's own settings pass, but not the variables of the session the office was started from", () => {
  const env = childEnv({ policy: 'clean', allow: [] }, { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '9000', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_SESSION_ID: 'x', CLAUDECODE: '1', GPG_TTY: '/dev/ttys001' });
  assert.equal(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '9000');
  assert.equal(env.GPG_TTY, '/dev/ttys001', 'signed commits still find their pinentry');
  assert.equal(env.CLAUDE_CODE_ENTRYPOINT, undefined);
  assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined);
  assert.equal(env.CLAUDECODE, undefined);
});

test("the other agents' own settings pass too", () => {
  const env = pickEnv({ GROK_HOME: '/g', MUSE_BIN: '/m', PI_CODING_AGENT_DIR: '/p', XAI_API_KEY: 'x', DSH_PROFILE: 'acp' }, { policy: 'clean', allow: [] });
  assert.deepEqual(Object.keys(env).sort(), ['DSH_PROFILE', 'GROK_HOME', 'MUSE_BIN', 'PI_CODING_AGENT_DIR', 'XAI_API_KEY']);
});

test("Cursor's sign-in and settings folder pass, but not the variables of a Cursor shell the office was started from", () => {
  const env = pickEnv({ CURSOR_API_KEY: 'k', CURSOR_CONFIG_DIR: '/c', CURSOR_AGENT: '1', CURSOR_CONVERSATION_ID: 'chat', CURSOR_TRACE_ID: 't' }, { policy: 'clean', allow: [] });
  assert.deepEqual(Object.keys(env).sort(), ['CURSOR_API_KEY', 'CURSOR_CONFIG_DIR']);
});
