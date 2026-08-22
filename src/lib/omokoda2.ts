/**
 * Real bridge to an Omo-Koda2 kernel persona -- a genuine agent birthed via
 * the kernel's own /v1/birth, not a text relay through Vantage. Unlike
 * Hermes/OpenClaw (external agents Vantage already hosts and relays to via
 * /api/copilot/chat), Omo-Koda2 agents live on the kernel itself: they get
 * their own sealed identity (BIPON39 mnemonic -> NIP-06 Nostr key, minipae
 * NIP-AE sibling key, wallet keys for 7 chains, all sealed server-side and
 * never returned in plaintext) and their own tools (wallet, mesh, web, etc)
 * the moment they're born -- see Omo-Koda2/omokoda-core/src/identity/wallet.rs.
 *
 * Phase 1 scope (voice I/O only): birth exactly one guest agent for this
 * app the first time it's needed, persist its {agent_id, agent_key} to a
 * local gitignored file, and reuse that same agent for every subsequent
 * conversation turn thereafter via POST /v1/think. Native memory
 * (GET /v1/vault/glyph), the minipae NIP-AE bridge, and the NIP profile
 * card publish are later phases -- this file deliberately does not touch
 * any of that yet.
 */
import fs from 'fs';
import path from 'path';

const OMOKODA2_KERNEL_URL = process.env.OMOKODA2_KERNEL_URL || 'http://127.0.0.1:7777';
const OMOKODA2_AGENT_NAME = process.env.OMOKODA2_AGENT_NAME || 'vantage-voice';
const OMOKODA2_THINK_TIMEOUT_MS = 60_000;

const AGENT_STATE_PATH = path.join(process.cwd(), 'data', 'omokoda2-agent.json');

interface Omokoda2AgentState {
  agentId: string;
  agentKey: string;
  bornAt: string;
}

function loadAgentState(): Omokoda2AgentState | null {
  try {
    return JSON.parse(fs.readFileSync(AGENT_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveAgentState(state: Omokoda2AgentState): void {
  fs.mkdirSync(path.dirname(AGENT_STATE_PATH), { recursive: true });
  fs.writeFileSync(AGENT_STATE_PATH, JSON.stringify(state, null, 2));
}

let birthing: Promise<Omokoda2AgentState> | null = null;

/**
 * Births this app's one Omo-Koda2 persona the first time it's needed, or
 * returns the already-birthed agent's identity from disk. A non-sovereign
 * POST /v1/birth (no X-Agent-Id header on the request) always creates a
 * brand-new guest agent hosted in the kernel's guest pool alongside the
 * owner's own steward -- it never touches or overwrites the owner's
 * sovereign identity. The kernel returns agent_id + agent_key once, at
 * birth; every subsequent request must present both via X-Agent-Id /
 * X-Agent-Key to be routed to this same guest.
 */
async function ensureOmokoda2Agent(): Promise<Omokoda2AgentState> {
  const existing = loadAgentState();
  if (existing) return existing;
  if (!birthing) {
    birthing = (async () => {
      const res = await fetch(`${OMOKODA2_KERNEL_URL.replace(/\/$/, '')}/v1/birth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: OMOKODA2_AGENT_NAME,
          meta: [{ key: 'source', value: 'vantage-voice' }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Omo-Koda2 /v1/birth returned HTTP ${res.status}`);
      }
      const body: any = await res.json();
      if (!body?.agent_id || !body?.agent_key) {
        throw new Error('Omo-Koda2 /v1/birth returned no agent_id/agent_key');
      }
      const state: Omokoda2AgentState = {
        agentId: body.agent_id,
        agentKey: body.agent_key,
        bornAt: new Date().toISOString(),
      };
      saveAgentState(state);
      console.log(`[Omokoda2] birthed persona "${OMOKODA2_AGENT_NAME}" agent_id=${state.agentId}`);
      return state;
    })();
  }
  try {
    return await birthing;
  } finally {
    birthing = null;
  }
}

/**
 * One conversational turn against this app's Omo-Koda2 persona via
 * POST /v1/think. Non-agentic single-shot think (not the tool-using
 * agentic loop) for Phase 1 -- real tool access via /v1/act is a later
 * phase once native memory and identity are wired. tool_output carries
 * the reply text for a plain think call, per ExecutionResponse::from in
 * omokoda-core/src/server.rs.
 */
export async function bridgeOmokoda2(text: string): Promise<string> {
  const agent = await ensureOmokoda2Agent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OMOKODA2_THINK_TIMEOUT_MS);
  try {
    const res = await fetch(`${OMOKODA2_KERNEL_URL.replace(/\/$/, '')}/v1/think`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Id': agent.agentId,
        'X-Agent-Key': agent.agentKey,
      },
      body: JSON.stringify({ prompt: text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Omo-Koda2 /v1/think returned HTTP ${res.status}`);
    }
    const body: any = await res.json();
    const reply = body?.tool_output;
    if (!reply) throw new Error('Omo-Koda2 /v1/think returned no tool_output');
    return reply;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Phase 2 -- native memory read/write for this app's Omo-Koda2 persona.
 * Deliberately NOT a duplicate memory store: this reads/writes the agent's
 * own native GlyphIndex projection on the kernel (GET/POST /v1/vault/glyph*),
 * the same content-addressed, metadata-only graph any other ecosystem agent
 * (Axiom, mnemopi, larql, zerolang) consumes -- see get_glyph_memory's doc
 * comment in omokoda-core/src/server.rs: plaintext memory content always
 * stays sealed in the agent's own vault, only tags/relations/locators are
 * ever exposed here. Vantage Voice never gets to see or store raw memory
 * content through this path, only its content-addressed shape.
 *
 * Both kernel routes currently only check X-Agent-Id (no X-Agent-Key
 * verification on these two specifically, unlike /v1/think/-act) -- sending
 * the key anyway costs nothing and matches every other call this app makes,
 * so a future kernel-side tightening doesn't require a client-side change.
 */
export interface GlyphMemoryQuery {
  describe?: string;
  walk?: string;
  depth?: number;
  tags?: string[];
  relations?: string[];
}

export async function getOmokoda2GlyphMemory(query: GlyphMemoryQuery = {}): Promise<any> {
  const agent = await ensureOmokoda2Agent();
  const params = new URLSearchParams();
  if (query.describe) params.set('describe', query.describe);
  if (query.walk) params.set('walk', query.walk);
  if (query.depth != null) params.set('depth', String(query.depth));
  if (query.tags?.length) params.set('tags', query.tags.join(','));
  if (query.relations?.length) params.set('relations', query.relations.join(','));
  const qs = params.toString();
  const res = await fetch(
    `${OMOKODA2_KERNEL_URL.replace(/\/$/, '')}/v1/vault/glyph${qs ? `?${qs}` : ''}`,
    { headers: { 'X-Agent-Id': agent.agentId, 'X-Agent-Key': agent.agentKey } }
  );
  if (!res.ok) throw new Error(`Omo-Koda2 /v1/vault/glyph returned HTTP ${res.status}`);
  const body: any = await res.json();
  if (body?.error) throw new Error(`Omo-Koda2 /v1/vault/glyph error: ${body.error}`);
  return body;
}

/**
 * Agent-to-agent memory exchange: merges another agent's GlyphGraph snapshot
 * (as served by getOmokoda2GlyphMemory, from this agent or a different one)
 * into this persona's live projection. Read-safe per the kernel's own
 * contract -- this persona's sealed memory is untouched; only the returned
 * union graph reflects the merge. Used by the minipae bridge (Phase 3) and
 * any future cross-agent memory sync.
 */
export async function mergeOmokoda2GlyphMemory(incomingGraph: unknown): Promise<any> {
  const agent = await ensureOmokoda2Agent();
  const res = await fetch(`${OMOKODA2_KERNEL_URL.replace(/\/$/, '')}/v1/vault/glyph/merge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agent-Id': agent.agentId,
      'X-Agent-Key': agent.agentKey,
    },
    body: JSON.stringify(incomingGraph),
  });
  if (!res.ok) throw new Error(`Omo-Koda2 /v1/vault/glyph/merge returned HTTP ${res.status}`);
  const body: any = await res.json();
  if (body?.error) throw new Error(`Omo-Koda2 /v1/vault/glyph/merge error: ${body.error}`);
  return body;
}
