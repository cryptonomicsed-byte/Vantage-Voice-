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
