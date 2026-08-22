import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

// Birth-once-then-reuse is the whole point of this module (this app has
// exactly one Omo-Koda2 persona, not one per session) -- these tests cover
// that a fresh agent is only ever born once, that its identity is used
// correctly on every subsequent /v1/think and /v1/vault/glyph* call, and
// that real HTTP/response-shape failures surface as real errors rather
// than being swallowed.

const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-omokoda2-'));
const STATE_PATH = path.join(STATE_DIR, 'omokoda2-agent.json');
process.env.OMOKODA2_AGENT_STATE_PATH = STATE_PATH;
process.env.OMOKODA2_KERNEL_URL = 'http://kernel.test';
process.env.OMOKODA2_AGENT_NAME = 'test-persona';

const { bridgeOmokoda2, getOmokoda2GlyphMemory, mergeOmokoda2GlyphMemory } = await import('./omokoda2.js');

after(() => fs.rmSync(STATE_DIR, { recursive: true, force: true }));

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function mockFetch(responder: (call: Call) => { ok: boolean; status?: number; json: any }): Call[] {
  const calls: Call[] = [];
  (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    const r = responder(call);
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
    } as Response;
  };
  return calls;
}

describe('Omo-Koda2 persona bridge', () => {
  it('births exactly once, then reuses the persisted identity', async () => {
    assert.equal(fs.existsSync(STATE_PATH), false);

    const calls = mockFetch((call) => {
      if (call.url.endsWith('/v1/birth')) {
        return { ok: true, json: { agent_id: 'agent-1', agent_key: 'key-1' } };
      }
      if (call.url.endsWith('/v1/think')) {
        return { ok: true, json: { tool_output: 'hello from omokoda2' } };
      }
      throw new Error(`unexpected call: ${call.url}`);
    });

    const reply1 = await bridgeOmokoda2('hi');
    assert.equal(reply1, 'hello from omokoda2');

    // Birth request used the configured persona name.
    const birthCall = calls.find((c) => c.url.endsWith('/v1/birth'))!;
    const birthBody = JSON.parse(String(birthCall.init?.body));
    assert.equal(birthBody.name, 'test-persona');

    // Identity persisted to disk.
    assert.equal(fs.existsSync(STATE_PATH), true);
    const persisted = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    assert.equal(persisted.agentId, 'agent-1');
    assert.equal(persisted.agentKey, 'key-1');

    // Second turn reuses the same identity and does NOT re-birth.
    const birthCallsBefore = calls.filter((c) => c.url.endsWith('/v1/birth')).length;
    const reply2 = await bridgeOmokoda2('again');
    assert.equal(reply2, 'hello from omokoda2');
    const birthCallsAfter = calls.filter((c) => c.url.endsWith('/v1/birth')).length;
    assert.equal(birthCallsAfter, birthCallsBefore, 'must not re-birth once an identity is persisted');

    const thinkCall = calls.filter((c) => c.url.endsWith('/v1/think')).at(-1)!;
    const headers = thinkCall.init?.headers as Record<string, string>;
    assert.equal(headers['X-Agent-Id'], 'agent-1');
    assert.equal(headers['X-Agent-Key'], 'key-1');
  });

  it('throws a real error when /v1/think returns no tool_output', async () => {
    mockFetch((call) => {
      if (call.url.endsWith('/v1/think')) return { ok: true, json: {} };
      throw new Error(`unexpected call: ${call.url}`);
    });
    await assert.rejects(() => bridgeOmokoda2('anything'), /no tool_output/);
  });

  it('throws a real error on a non-2xx /v1/think response', async () => {
    mockFetch((call) => {
      if (call.url.endsWith('/v1/think')) return { ok: false, status: 503, json: {} };
      throw new Error(`unexpected call: ${call.url}`);
    });
    await assert.rejects(() => bridgeOmokoda2('anything'), /HTTP 503/);
  });

  it('getOmokoda2GlyphMemory builds query params and passes agent headers', async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes('/v1/vault/glyph')) return { ok: true, json: { nodes: [] } };
      throw new Error(`unexpected call: ${call.url}`);
    });
    await getOmokoda2GlyphMemory({ describe: 'node-1', tags: ['a', 'b'] });
    const glyphCall = calls.find((c) => c.url.includes('/v1/vault/glyph'))!;
    const url = new URL(glyphCall.url);
    assert.equal(url.searchParams.get('describe'), 'node-1');
    assert.equal(url.searchParams.get('tags'), 'a,b');
    const headers = glyphCall.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.['X-Agent-Id'], 'agent-1');
  });

  it('getOmokoda2GlyphMemory surfaces a kernel-reported error rather than returning it silently', async () => {
    mockFetch((call) => {
      if (call.url.includes('/v1/vault/glyph')) return { ok: true, json: { error: 'no agent' } };
      throw new Error(`unexpected call: ${call.url}`);
    });
    await assert.rejects(() => getOmokoda2GlyphMemory(), /no agent/);
  });

  it('mergeOmokoda2GlyphMemory posts the incoming graph as the request body', async () => {
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/v1/vault/glyph/merge')) return { ok: true, json: { nodes: ['merged'] } };
      throw new Error(`unexpected call: ${call.url}`);
    });
    const graph = { nodes: ['x'] };
    const result = await mergeOmokoda2GlyphMemory(graph);
    assert.deepEqual(result, { nodes: ['merged'] });
    const mergeCall = calls.find((c) => c.url.endsWith('/v1/vault/glyph/merge'))!;
    assert.deepEqual(JSON.parse(String(mergeCall.init?.body)), graph);
  });
});
