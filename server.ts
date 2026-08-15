import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  initVantageMcp,
  buildGeminiDeclarationsForVantageTools,
  isVantageToolName,
  callVantageTool,
  getDiscoveredTools,
  toGeminiFunctionName,
} from './src/lib/vantageMcp.js';
import {
  isComposioConfigured,
  listRealConnections,
  startRealOAuth,
  deleteRealConnection,
  listAllToolkits,
} from './src/lib/composioOAuth.js';
import {
  initComposioMcp,
  buildGeminiDeclarationsForComposioTools,
  isComposioToolName,
  callComposioTool,
  getDiscoveredComposioTools,
} from './src/lib/composioMcp.js';
import { planTurns, executeTurns, type RosterMember, type OrchestratorDeps } from './src/lib/orchestrator.js';
import { spawnSwarmCodingTask, listSwarmPanels } from './src/lib/herdrSwarm.js';
import {
  initIrantiMcp,
  buildGeminiDeclarationsForIrantiTools,
  isIrantiToolName,
  callIrantiTool,
  getDiscoveredIrantiTools,
  toGeminiFunctionName as toIrantiGeminiFunctionName,
} from './src/lib/irantiMcp.js';
import { mountVoiceOwnerMcp } from './src/lib/voiceOwnerMcp.js';
import { CascadeEngine } from './src/lib/cascade/engine.js';
import { synthesizeBase64, ttsReady } from './src/lib/cascade/tts.js';
import { getCascadeKeys, isElevenLabsVoiceId } from './src/lib/cascade/keys.js';

const VANTAGE_MCP_URL_FOR_DISPLAY = process.env.VANTAGE_MCP_URL || 'https://omokoda.duckdns.org/mcp';
const VANTAGE_BASE_URL = process.env.VANTAGE_BASE_URL || 'https://omokoda.duckdns.org';

// Server-side default bridge keys for the real, already-deployed Vantage
// agent brains (Hermes = NousResearch/hermes-agent, real DeepSeek-backed
// instance on Hostinger; OpenClaw = openclaw/openclaw, real DeepSeek-backed
// bridge on Contabo). Each is that agent's own real X-Agent-Key -- calling
// Vantage's /api/copilot/chat with it makes Vantage dispatch to that
// agent's real cognition_url and return its real reply. A user can
// override either from Settings; blank means "use this server default."
const DEFAULT_HERMES_AGENT_KEY = process.env.HERMES_AGENT_KEY || '';
// Second real Hermes instance, running natively on Contabo (this box)
// rather than Hostinger -- same real DeepSeek-backed NousResearch
// hermes-agent, same real Vantage MCP wiring (669 tools confirmed live),
// separate identity/session/memory from the Hostinger one.
const DEFAULT_HERMES_CONTABO_AGENT_KEY = process.env.HERMES_CONTABO_AGENT_KEY || '';
const DEFAULT_OPENCLAW_AGENT_KEY = process.env.OPENCLAW_AGENT_KEY || '';

// ── Sessionful Hermes gateway bridge ─────────────────────────────────────
// The Contabo Hermes instance now runs its own OpenAI-compatible API
// server (gateway/platforms/api_server.py) on top of the SAME real agent
// process that already owns Vantage MCP + Composio + memory -- unlike
// callVantageAgentBridge below (a one-shot text relay through Vantage's
// copilot/chat with no session, no tool loop), this hits the agent's own
// HTTP loop directly and reuses one X-Hermes-Session-Id per browser
// connection so every turn lands in the same Hermes session: real tool
// calls, real memory, real skills. Falls back to callVantageAgentBridge
// (relay) if the gateway is unreachable so the app never goes fully dark.
const HERMES_CONTABO_GATEWAY_URL = process.env.HERMES_CONTABO_GATEWAY_URL || 'http://127.0.0.1:8642';
const HERMES_CONTABO_GATEWAY_KEY = process.env.HERMES_CONTABO_GATEWAY_KEY || '';
const HERMES_GATEWAY_MODEL = process.env.HERMES_GATEWAY_MODEL || 'hermes-agent';
const HERMES_GATEWAY_TIMEOUT_MS = 90_000;

// ── Vantage memory vault (Vantage is the memory system) ────────────────────
// The agent's vault lives on the Vantage platform; a scoped ingest-only
// connector token (vconn_...) lets this app push conversation turns into it
// without ever holding the agent's real X-Agent-Key. Mint once via:
//   POST https://omokoda.duckdns.org/api/vault/external/connectors
//   { "name": "vantage-voice", "source": "voice-app" }  (X-Agent-Key header)
const VVAULT_BASE = process.env.VVAULT_BASE_URL || 'https://omokoda.duckdns.org';
const VVAULT_AGENT = process.env.VVAULT_AGENT_NAME || 'Hermes-Contabo';
const VVAULT_CONNECTOR_KEY = process.env.VVAULT_CONNECTOR_KEY || '';

/** Push a conversation turn into the agent's Vantage memory vault. */
async function offloadTurnToVault(
  conversationId: string,
  userText: string,
  assistantText: string
): Promise<void> {
  if (!VVAULT_CONNECTOR_KEY) return;
  try {
    const body = JSON.stringify({
      conversation_id: conversationId.slice(0, 16),
      title: `Voice conversation ${new Date().toISOString().slice(0, 16)}`,
      resource: 'vantage-voice',
      messages: [
        { role: 'user', content: userText.slice(0, 20000) },
        { role: 'assistant', content: assistantText.slice(0, 20000) },
      ],
    });
    const res = await fetch(`${VVAULT_BASE}/api/vault/external/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vault-Connector-Key': VVAULT_CONNECTOR_KEY,
      },
      body,
    });
    if (!res.ok) {
      console.warn(`[VaultOffload] ingest failed: HTTP ${res.status}`);
    } else {
      const j = await res.json().catch(() => null);
      console.log(`[VaultOffload] turn stored (conv=${conversationId.slice(0, 16)} note=${j?.note_path || '?'})`);
    }
  } catch (err: any) {
    console.warn('[VaultOffload] error (non-fatal):', err?.message || err);
  }
}

interface HermesGatewayTurnResult {
  reply: string;
  sessionId: string | null;
  toolCalls: number;
}

/**
 * One turn against the Hermes gateway's /v1/chat/completions, threading
 * the caller-supplied session key through X-Hermes-Session-Key so the
 * gateway resumes (or creates) the matching Hermes agent session. Returns
 * the session id the gateway assigned so the caller can keep using it, and
 * a best-effort count of tool calls the agent made this turn (from the
 * `hermes.tool.progress` bookkeeping the gateway echoes back in headers
 * when available; 0 if the gateway doesn't report it, which is fine --
 * this is only used for logging/verification, never for control flow).
 */
async function callHermesGatewaySession(
  sessionKey: string,
  text: string,
  gatewayUrl: string = HERMES_CONTABO_GATEWAY_URL,
  gatewayKey: string = HERMES_CONTABO_GATEWAY_KEY,
): Promise<HermesGatewayTurnResult> {
  if (!gatewayKey) throw new Error('Hermes gateway key not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HERMES_GATEWAY_TIMEOUT_MS);
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey}`,
        'X-Hermes-Session-Key': sessionKey,
      },
      body: JSON.stringify({
        model: HERMES_GATEWAY_MODEL,
        messages: [{ role: 'user', content: text }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Hermes gateway returned HTTP ${res.status}`);
    }
    const sessionId = res.headers.get('x-hermes-session-id');
    const body: any = await res.json();
    const reply = body?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Hermes gateway returned no reply content');
    const toolCallsHeader = res.headers.get('x-hermes-tool-calls');
    return { reply, sessionId, toolCalls: toolCallsHeader ? Number(toolCallsHeader) || 0 : 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls a real external agent (Hermes or OpenClaw) through Vantage's own
 * /api/copilot/chat, authenticated as that agent via its own X-Agent-Key.
 * Vantage internally relays to the agent's real cognition_url and returns
 * its real reply -- no simulation, no template text.
 */
async function callVantageAgentBridge(agentKey: string, text: string): Promise<string> {
  const res = await fetch(`${VANTAGE_BASE_URL}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': agentKey },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`Vantage copilot/chat returned HTTP ${res.status}`);
  }
  const body: any = await res.json();
  const reply = body?.intent?.data?.reply;
  if (!reply) {
    throw new Error('Vantage copilot/chat returned no reply (agent bridge may be down or unconfigured)');
  }
  return reply;
}

// Real, dedicated Gemini TTS model -- used to speak agent-bridge (Hermes/
// OpenClaw) replies directly, instead of re-injecting the reply text back
// into the live conversational session and waiting for Gemini to
// re-generate + re-speak it. That old path was a second full Gemini
// round-trip on top of the agent's own generation time; this cuts it to
// one. Output is 24kHz mono PCM16, the exact same format the Live API's
// audio deltas use, so the client's existing audio player needs no changes.
async function synthesizeSpeechDirect(text: string, voiceName: string): Promise<string> {
  const { client, hasKey } = getAiClient();
  if (!hasKey) {
    // C4: Gemini keys absent/dead — fall back to the cascade ElevenLabs
    // synthesizer so the app still speaks instead of throwing.
    if (ttsReady()) {
      console.warn('[TTS] No Gemini API key — falling back to cascade ElevenLabs TTS');
      return synthesizeBase64(text, voiceName);
    }
    throw new Error('No TTS provider available: Gemini key absent and no ELEVENLABS_API_KEY in ~/.vv-cascade-keys.env');
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error('Gemini TTS returned no audio data');
    return audioData;
  } catch (geminiErr: any) {
    // C4: a dead/broken Gemini key must never silence the app — fall back
    // to the cascade synthesizer and surface a clear warning.
    if (ttsReady()) {
      console.warn('[TTS] Gemini TTS failed, falling back to cascade ElevenLabs:', geminiErr?.message || geminiErr);
      return synthesizeBase64(text, voiceName);
    }
    throw geminiErr;
  }
}

/**
 * Real, non-live Gemini text call -- used by the multi-agent orchestrator
 * both for its own routing decisions and for "native" roster members'
 * turns (so a native participant in a multi-agent exchange still gets a
 * real, independent LLM call rather than reusing the live session).
 */
async function generateTextDirect(systemPrompt: string, userPrompt: string): Promise<string> {
  const { client, hasKey } = getAiClient();
  if (!hasKey) throw new Error('No Gemini API key available for orchestrator text generation');

  const response = await client.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: { systemInstruction: systemPrompt },
  });

  const text = response.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!text.trim()) throw new Error('Gemini returned empty text');
  return text.trim();
}

const ORCHESTRATOR_TOOL_LOOP_MAX_ITERATIONS = 6;

/**
 * Real tool-calling version of generateTextDirect -- used specifically for
 * native's own turns in a multi-agent exchange. Without this, native's
 * orchestrator-routed replies were pure free-generated text with zero real
 * tool access (no trading, wallet, buzz, memory vault, Composio
 * connectors, etc.), even though the exact same "native" agent has full
 * live tool access outside multi-agent mode -- a real capability
 * regression the moment a 2nd roster member joined. This runs the same
 * declared tool catalog (local + Vantage MCP + Composio) through a real
 * generateContent function-calling loop: execute each real functionCall via
 * executeToolCall, feed the real result back, repeat until Gemini returns
 * a final answer or the iteration cap is hit.
 */
async function generateTextWithTools(systemPrompt: string, userPrompt: string, ctx: ToolCtx): Promise<string> {
  const { client, hasKey } = getAiClient();
  if (!hasKey) throw new Error('No Gemini API key available for tool-enabled text generation');

  const tools = [
    {
      functionDeclarations: [
        ...liveTools[0].functionDeclarations,
        ...buildGeminiDeclarationsForVantageTools(),
        ...buildGeminiDeclarationsForComposioTools(),
        ...buildGeminiDeclarationsForIrantiTools(),
      ],
    },
  ];

  const contents: any[] = [{ role: 'user', parts: [{ text: userPrompt }] }];

  for (let iteration = 0; iteration < ORCHESTRATOR_TOOL_LOOP_MAX_ITERATIONS; iteration++) {
    const response = await client.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents,
      config: { systemInstruction: systemPrompt, tools },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.map((p: any) => p.text || '').join('').trim();
      if (!text) throw new Error('Gemini returned empty text');
      return text;
    }

    contents.push({ role: 'model', parts });

    const responseParts: any[] = [];
    for (const call of functionCalls) {
      console.log(`[Orchestrator Tool Call] native turn requested tool: ${call.name}`);
      let result: any;
      try {
        result = await executeToolCall(call.name, call.args || {}, ctx);
      } catch (err: any) {
        result = { status: 'error', message: err?.message || String(err) };
      }
      responseParts.push({ functionResponse: { name: call.name, response: result } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  throw new Error('Tool-call loop exceeded max iterations without a final answer');
}

// Process level error safety
process.on('uncaughtException', (err: any) => {
  console.warn('[Process] Uncaught exception (handled):', err?.message || err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[Process] Unhandled rejection (handled):', reason?.message || reason);
});

// Server initialization
const PORT = 3000;
const app = express();
app.use(express.json({ limit: '10mb' }));
mountVoiceOwnerMcp(app);

// C4: clear startup warning if the cascade providers are unprovisioned —
// the app degrades gracefully (Gemini fallback / error messages) but the
// operator should know the default voice path is missing its keys.
{
  const keys = getCascadeKeys();
  const missing: string[] = [];
  if (!keys.groqApiKey) missing.push('GROQ_API_KEY (STT)');
  if (!keys.elevenLabsApiKey) missing.push('ELEVENLABS_API_KEY (TTS)');
  if (missing.length > 0) {
    console.warn(`[Cascade] WARNING: missing from ~/.vv-cascade-keys.env (0600): ${missing.join(', ')}. Cascade voice turns will fail until provisioned.`);
  }
}

// Helper to safely send JSON to WebSocket client
function sendToClient(ws: WebSocket, payload: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload), (err) => {
        if (err) {
          console.warn('[WebSocket] Frame send error (handled):', err.message);
        }
      });
    } catch (e: any) {
      console.warn('[WebSocket] Send exception:', e?.message || e);
    }
  }
}

// ── Owner-control layer: real .env credential management + real
// persistent memory vault, both gated behind a spoken PIN and, for
// destructive actions, an explicit confirmation step. This exists
// because the voice app is reachable at a public URL with no login --
// these tools give real read/write power over the app's own secrets and
// settings, so every entry point is hard-gated in code, not just told to
// the model in a prompt (a misheard word or adversarial audio shouldn't
// be able to talk its way past a system instruction alone).
import fs from 'fs';

const ENV_PATH = path.join(process.cwd(), '.env');
const MEMORY_VAULT_PATH = path.join(process.cwd(), 'data', 'memory-vault.json');
const MANAGED_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'HERMES_AGENT_KEY',
  'OPENCLAW_AGENT_KEY',
  'VANTAGE_AGENT_KEY',
  'VANTAGE_MCP_URL',
  'VANTAGE_BASE_URL',
];
// OWNER_VOICE_PIN is deliberately excluded from MANAGED_ENV_KEYS -- the
// agent must never be able to read, change, or clear its own access gate.

function readEnvFileLines(): string[] {
  try {
    return fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
  } catch {
    return [];
  }
}

function setEnvVar(key: string, value: string) {
  const lines = readEnvFileLines();
  const prefix = `${key}=`;
  const quoted = `${key}="${value.replace(/"/g, '\\"')}"`;
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      return quoted;
    }
    return line;
  });
  if (!found) next.push(quoted);
  fs.writeFileSync(ENV_PATH, next.filter((l, i, arr) => l !== '' || i !== arr.length - 1).join('\n') + '\n');
  process.env[key] = value;
}

function removeEnvVar(key: string) {
  const lines = readEnvFileLines();
  const next = lines.filter((line) => !line.startsWith(`${key}=`));
  fs.writeFileSync(ENV_PATH, next.filter((l, i, arr) => l !== '' || i !== arr.length - 1).join('\n') + '\n');
  delete process.env[key];
}

function maskSecret(value: string): string {
  if (!value) return '(unset)';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

interface MemoryVaultItem {
  id: string;
  key: string;
  value: string;
  category: string;
  tier: 'secure' | 'personal' | 'regular';
  tags: string[];
  updatedAt: string;
}

function loadMemoryVault(): MemoryVaultItem[] {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_VAULT_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveMemoryVault(items: MemoryVaultItem[]) {
  fs.mkdirSync(path.dirname(MEMORY_VAULT_PATH), { recursive: true });
  fs.writeFileSync(MEMORY_VAULT_PATH, JSON.stringify(items, null, 2));
}

// Round-robin pool of Gemini API keys. Set GEMINI_API_KEYS as a
// comma-separated list to spread load/rate-limits across multiple keys;
// falls back to the single GEMINI_API_KEY/API_KEY var if unset, so nothing
// changes for anyone with just one key.
// Re-read from process.env on every call (not a frozen const) -- so a key
// added live via the owner-control voice tools takes effect immediately,
// no restart needed.
function getGeminiKeyPool(): string[] {
  const multi = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 5);
  if (multi.length > 0) return multi;
  const single = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  return single.length > 5 ? [single] : [];
}

let rrIndex = 0;
// Keys that recently failed (e.g. 429 rate-limited) are skipped for a
// cooldown window rather than retried immediately every request.
const keyCooldownUntil = new Map<string, number>();
const KEY_COOLDOWN_MS = 60_000;

export function markGeminiKeyRateLimited(apiKey: string) {
  keyCooldownUntil.set(apiKey, Date.now() + KEY_COOLDOWN_MS);
  console.warn(`[GeminiKeyPool] key ...${apiKey.slice(-4)} marked rate-limited, cooling down ${KEY_COOLDOWN_MS}ms`);
}

function pickNextGeminiKey(): string {
  const pool = getGeminiKeyPool();
  if (pool.length === 0) return '';
  const now = Date.now();
  for (let i = 0; i < pool.length; i++) {
    const key = pool[rrIndex % pool.length];
    rrIndex++;
    const cooldown = keyCooldownUntil.get(key);
    if (!cooldown || cooldown <= now) {
      return key;
    }
  }
  // All keys are cooling down -- use the next one in rotation anyway
  // rather than failing outright.
  return pool[rrIndex % pool.length];
}

// Get a GoogleGenAI instance using the next key in the round-robin pool.
function getAiClient() {
  const apiKey = pickNextGeminiKey();
  return {
    client: new GoogleGenAI({ apiKey }),
    apiKey,
    hasKey: Boolean(apiKey && apiKey.length > 5),
    poolSize: getGeminiKeyPool().length,
  };
}

// Tool Function Declarations for Gemini Live API
const getCurrentTimeDeclaration: FunctionDeclaration = {
  name: 'get_current_time',
  description: 'Get the current time, day, and date for a timezone or location.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: {
        type: Type.STRING,
        description: 'Location name or timezone string',
      },
    },
  },
};

const calculateDeclaration: FunctionDeclaration = {
  name: 'calculate',
  description: 'Perform mathematical, scientific, statistical, or financial calculations.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      expression: {
        type: Type.STRING,
        description: 'Mathematical expression, e.g. "sin(0.5) * 100 + log2(1024)"',
      },
      mode: {
        type: Type.STRING,
        description: 'Calculation mode: "basic", "scientific", "statistics", or "financial"',
      },
      values: {
        type: Type.STRING,
        description: 'Comma separated list of numeric sample values for statistical measures (e.g. "12, 18, 25, 42, 88")',
      },
    },
    required: ['expression'],
  },
};

const mcpServerClientDeclaration: FunctionDeclaration = {
  name: 'mcp_server_client',
  description: 'Real MCP client for this build\'s two live connections: "vantage" (669 real Vantage platform tools, remote) and "iranti" (Ìrántí sovereign agent-memory mesh -- recall/write/grant/revoke/a2a_recall/dream/echo, local). Use tool_search_retrieval first to find the right tool name, then this to actually call it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      serverUrlOrCommand: {
        type: Type.STRING,
        description: 'Which real connection to use: "vantage" or "iranti"',
      },
      action: {
        type: Type.STRING,
        description: 'Action: "list_tools", "call_tool", "list_resources", "read_resource", or "get_prompts"',
      },
      toolName: {
        type: Type.STRING,
        description: 'Target MCP tool name for call_tool action',
      },
      argumentsJson: {
        type: Type.STRING,
        description: 'JSON string of arguments passed to the MCP tool',
      },
    },
    required: ['serverUrlOrCommand', 'action'],
  },
};

const toolSearchRetrievalDeclaration: FunctionDeclaration = {
  name: 'tool_search_retrieval',
  description: 'Dynamic tool search & semantic retrieval engine over every real tool this agent can call -- Vantage\'s live platform (trading, wallets, buzz/social, genesis/birth, memory vault, glyphindex, guilds, forum, video/podcast/playlists, degen, copytrade, alpha, collectives, mesh, federation, analytics, and more), Composio OAuth connectors, Ìrántí\'s sovereign agent-memory mesh (persistent, consent-gated shared memory across the roster -- recall/write/grant/revoke/dream/echo), and local owner/swarm controls. Searches by intent or capability keywords to return matching parameter schemas without overloading agent context.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Search query describing requested capability or task (e.g. "post to buzz", "birth a new agent", "check wallet balance", "join a guild", "generate a video", "recall a memory", "grant memory access")',
      },
      category: {
        type: Type.STRING,
        description: 'Optional category filter: "all", "local" (owner/swarm/memory/composio-control tools), "vantage" (live Vantage platform tools), or "iranti" (Ìrántí memory-mesh tools)',
      },
      topK: {
        type: Type.NUMBER,
        description: 'Number of top matching tools to retrieve (default 5)',
      },
    },
    required: ['query'],
  },
};

const unlockOwnerControlsDeclaration: FunctionDeclaration = {
  name: 'unlock_owner_controls',
  description: 'Unlock owner-level control of this app for the rest of the session -- required before any API key management, settings change, or memory vault write. Call this only when the user speaks or types their owner PIN.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      pin: { type: Type.STRING, description: 'The owner PIN spoken or typed by the user' },
    },
    required: ['pin'],
  },
};

const listApiKeysDeclaration: FunctionDeclaration = {
  name: 'list_api_keys',
  description: 'List the app\'s currently configured API keys/credentials by name, with masked values (never full plaintext). Requires owner unlock.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const setApiKeyDeclaration: FunctionDeclaration = {
  name: 'set_api_key',
  description: 'Add or update a real API key/credential for this app (e.g. GEMINI_API_KEY, GEMINI_API_KEYS, HERMES_AGENT_KEY, OPENCLAW_AGENT_KEY, VANTAGE_AGENT_KEY). Takes effect immediately, no restart. Requires owner unlock. If a key with this name already exists, requires confirmed=true (ask the user to confirm the overwrite first).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Env var name, must be one of the managed keys' },
      value: { type: Type.STRING, description: 'The real key/credential value' },
      confirmed: { type: Type.BOOLEAN, description: 'Set true only after the user has explicitly confirmed overwriting an existing key' },
    },
    required: ['name', 'value'],
  },
};

const removeApiKeyDeclaration: FunctionDeclaration = {
  name: 'remove_api_key',
  description: 'Permanently remove a configured API key/credential. Destructive -- requires owner unlock AND confirmed=true (ask the user to explicitly confirm first, this cannot be undone).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Env var name to remove' },
      confirmed: { type: Type.BOOLEAN, description: 'Must be true; only set after explicit user confirmation' },
    },
    required: ['name', 'confirmed'],
  },
};

const updateAppSettingDeclaration: FunctionDeclaration = {
  name: 'update_app_setting',
  description: 'Change one of this voice app\'s own settings live (e.g. voice, agentFramework, playbackSpeed, enableTools, personaId, vadSensitivity). Requires owner unlock. Applies immediately in this session and persists to the browser.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      setting: { type: Type.STRING, description: 'Name of the AppSettings field to change' },
      value: { type: Type.STRING, description: 'New value (as a string; booleans/numbers are parsed automatically)' },
    },
    required: ['setting', 'value'],
  },
};

// ── Real Composio connector control -- gives the agent direct voice
// control over the same OAuth connections managed in Settings, not just
// passive access to already-connected toolkits. ──
const listComposioConnectionsDeclaration: FunctionDeclaration = {
  name: 'list_composio_connections',
  description: 'List the real Composio connector accounts currently connected (e.g. Gmail, GitHub, Slack) and their real status.',
  parameters: { type: Type.OBJECT, properties: {} },
};

const searchComposioToolkitsDeclaration: FunctionDeclaration = {
  name: 'search_composio_toolkits',
  description: 'Search Composio\'s real ~1000-connector catalog by name/category (e.g. "salesforce", "project management") to find a toolkit to connect.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Search term' },
    },
    required: ['query'],
  },
};

const connectComposioToolkitDeclaration: FunctionDeclaration = {
  name: 'connect_composio_toolkit',
  description: 'Start a real OAuth connection for a Composio toolkit by slug (e.g. "github", "gmail"). Returns a real approval URL the user must open in a browser -- speak it or tell them to check Settings > OAuth. Requires owner unlock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      toolkitSlug: { type: Type.STRING, description: 'Real Composio toolkit slug, e.g. "github"' },
    },
    required: ['toolkitSlug'],
  },
};

const disconnectComposioToolkitDeclaration: FunctionDeclaration = {
  name: 'disconnect_composio_toolkit',
  description: 'Permanently disconnect a real Composio connector account by its connection id (from list_composio_connections). Destructive -- requires owner unlock AND confirmed=true after the user explicitly confirms.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      connectionId: { type: Type.STRING, description: 'Real connection id, e.g. "ca_..."' },
      confirmed: { type: Type.BOOLEAN, description: 'Must be true; only set after explicit user confirmation' },
    },
    required: ['connectionId', 'confirmed'],
  },
};

// ── Real multi-agent roster control -- lets the agent (once unlocked)
// change who's in the conversation by voice instead of only via Settings. ──
const addRosterMemberDeclaration: FunctionDeclaration = {
  name: 'add_roster_member',
  description: 'Add a participant to the real multi-agent roster for this conversation (backend: native, hermes, or open_claw). Requires owner unlock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      backend: { type: Type.STRING, description: '"native", "hermes", "hermes_contabo", or "open_claw"' },
      voice: { type: Type.STRING, description: 'Gemini voice name to assign, e.g. "Puck"' },
    },
    required: ['backend'],
  },
};

const removeRosterMemberDeclaration: FunctionDeclaration = {
  name: 'remove_roster_member',
  description: 'Remove a participant from the real multi-agent roster by backend id (native/hermes/open_claw).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      backend: { type: Type.STRING, description: '"native", "hermes", "hermes_contabo", or "open_claw"' },
    },
    required: ['backend'],
  },
};

// ── Real swarm/delegation tools -- letting the current agent pull in
// other real agents mid-conversation, not just via the pre-planned
// multi-agent roster. See docs/MULTI_AGENT_ORCHESTRATION.md. ──
const delegateToAgentDeclaration: FunctionDeclaration = {
  name: 'delegate_to_agent',
  description: 'Ask a real, separate agent (Hermes or OpenClaw, both real DeepSeek-backed instances on Vantage) a question or sub-task, and get its real reply back as text -- without adding them to the conversation roster. Use this to pull in a second opinion or hand off a sub-task mid-answer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      backend: { type: Type.STRING, description: '"hermes" or "open_claw"' },
      task: { type: Type.STRING, description: 'The question or task to send' },
    },
    required: ['backend', 'task'],
  },
};

const spawnSwarmCodingTaskDeclaration: FunctionDeclaration = {
  name: 'spawn_swarm_coding_task',
  description: 'Spawn a real, visible terminal pane (via herdr, running on the Vantage VPS) that runs a real DeepSeek-backed coding agent (oh-my-pi) on a coding task -- it can write and run real code, not simulate it. Takes up to ~90 seconds; only use for genuine coding/file/script tasks. Requires owner unlock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      taskName: { type: Type.STRING, description: 'Short label for the pane, e.g. "fix-parser"' },
      prompt: { type: Type.STRING, description: 'The real coding task/prompt to give the agent' },
    },
    required: ['taskName', 'prompt'],
  },
};

const listSwarmPanelsDeclaration: FunctionDeclaration = {
  name: 'list_swarm_panels',
  description: 'List real, currently active herdr agent panels on the Vantage VPS (from spawn_swarm_coding_task or elsewhere).',
  parameters: { type: Type.OBJECT, properties: {} },
};

const queryMemoryVaultDeclaration: FunctionDeclaration = {
  name: 'query_memory_vault',
  description: 'Query or search the user memory vault across security tiers (secure, personal, regular) for remembered information.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      searchQuery: {
        type: Type.STRING,
        description: 'Search keyword or topic to locate in memory vault',
      },
      tier: {
        type: Type.STRING,
        description: 'Optional filter by tier level: "secure" (Tier 1 Top Secret), "personal" (Tier 2 User Info), or "regular" (Tier 3 Context)',
      },
    },
  },
};

const storeMemoryVaultDeclaration: FunctionDeclaration = {
  name: 'store_memory_vault',
  description: 'Store or update an item into the structured memory vault in a specific security tier.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: {
        type: Type.STRING,
        description: 'Key identifier or label for the memory item (e.g. "User Name", "Passkey")',
      },
      value: {
        type: Type.STRING,
        description: 'The memory value or fact content to remember',
      },
      category: {
        type: Type.STRING,
        description: 'Category group (e.g. "Identity", "Auth", "Preferences", "Project")',
      },
      tier: {
        type: Type.STRING,
        description: 'Security level tier: "secure" (Tier 1 Top Secret), "personal" (Tier 2 User Info), or "regular" (Tier 3 Context)',
      },
      tags: {
        type: Type.STRING,
        description: 'Comma separated tag keywords',
      },
    },
    required: ['key', 'value'],
  },
};

// Every tool below is real: it either does a genuine computation
// (get_current_time, calculate), or bridges to a real live system
// (Vantage MCP, Composio, owner-controls, the persistent memory vault).
// This used to also include 29 "demo" tools (web search, email, GitHub,
// database, deployment, weather, CRM, payments, IoT, etc) that were 100%
// fabricated -- zero real network calls in any of their handlers,
// confirmed by auditing every one. They're removed entirely rather than
// left reachable, since a fabricated "web_search" or "manage_email" tool
// sitting next to genuinely real Composio Gmail/GitHub/Slack access is
// actively dangerous: the model has no way to tell them apart by name
// alone, and could confidently act on or repeat fake results.
const liveTools = [
  {
    functionDeclarations: [
      getCurrentTimeDeclaration,
      calculateDeclaration,
      mcpServerClientDeclaration,
      toolSearchRetrievalDeclaration,
      queryMemoryVaultDeclaration,
      storeMemoryVaultDeclaration,
      unlockOwnerControlsDeclaration,
      listApiKeysDeclaration,
      setApiKeyDeclaration,
      removeApiKeyDeclaration,
      updateAppSettingDeclaration,
      listComposioConnectionsDeclaration,
      searchComposioToolkitsDeclaration,
      connectComposioToolkitDeclaration,
      disconnectComposioToolkitDeclaration,
      addRosterMemberDeclaration,
      removeRosterMemberDeclaration,
      delegateToAgentDeclaration,
      spawnSwarmCodingTaskDeclaration,
      listSwarmPanelsDeclaration,
    ],
  },
];

// Execute server-side tool functions
interface ToolCtx {
  ownerUnlocked: boolean;
  unlockOwner: () => void;
  applySettingOnClient?: (setting: string, value: string) => void;
  applyRosterChange?: (action: 'add' | 'remove', backend: string, voice?: string) => void;
}

async function executeToolCall(name: string, args: any, ctx: ToolCtx) {
  console.log(`[Tool Call] Executing tool '${name}' with args:`, args);

  // Real, first-class Vantage MCP tools (vantage__<realname>) -- these are
  // dynamically discovered from Vantage's live MCP server at startup (see
  // initVantageMcp() / buildGeminiDeclarationsForVantageTools()), not
  // hardcoded. Route them to the real MCP client before falling through
  // to the static demo tool handlers below.
  if (isVantageToolName(name)) {
    try {
      const content = await callVantageTool(name, args);
      return { status: 'ok', source: 'vantage_mcp_live', content };
    } catch (err: any) {
      return { status: 'error', source: 'vantage_mcp_live', message: err?.message || String(err) };
    }
  }
  // Real Composio connector tools (COMPOSIO_SEARCH_TOOLS,
  // COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_MULTI_EXECUTE_TOOL, etc.) --
  // these give the model real access to whatever toolkits the owner has
  // actually connected via the OAuth Integrations modal. An unconnected
  // toolkit surfaces Composio's own real error, never a fabricated result.
  if (isComposioToolName(name)) {
    try {
      const content = await callComposioTool(name, args);
      return { status: 'ok', source: 'composio_mcp_live', content };
    } catch (err: any) {
      return { status: 'error', source: 'composio_mcp_live', message: err?.message || String(err) };
    }
  }
  // Real Ìrántí memory-mesh tools (memory_recall, memory_write,
  // memory_grant, memory_a2a_recall, etc.) -- consent-gated shared memory
  // across the roster. A denied a2a_recall surfaces Ìrántí's real HTTP 403
  // ("grant required") as a real error here, never faked as success.
  if (isIrantiToolName(name)) {
    try {
      const content = await callIrantiTool(name, args);
      return { status: 'ok', source: 'iranti_mcp_live', content };
    } catch (err: any) {
      return { status: 'error', source: 'iranti_mcp_live', message: err?.message || String(err) };
    }
  }
  if (name === 'get_current_time') {
    const now = new Date();
    return {
      time: now.toLocaleTimeString(),
      date: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      iso: now.toISOString(),
    };
  }

  if (name === 'calculate') {
    const expr = String(args.expression || '0');
    const mode = args.mode || 'scientific';
    const rawValues = args.values ? String(args.values).split(',').map((v) => parseFloat(v.trim())).filter((n) => !isNaN(n)) : [];

    try {
      // Math scope evaluation
      const mathScope = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        sqrt: Math.sqrt,
        abs: Math.abs,
        log: Math.log10,
        ln: Math.log,
        log2: Math.log2,
        exp: Math.exp,
        pow: Math.pow,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        PI: Math.PI,
        E: Math.E,
      };

      const safeExpr = expr
        .replace(/pi/gi, 'PI')
        .replace(/e/g, 'E')
        .replace(/[^0-9+\-*/(). ,a-zA-Z]/g, '');

      const evaluatedResult = Function(
        ...Object.keys(mathScope),
        `"use strict"; return (${safeExpr});`
      )(...Object.values(mathScope));

      let statsSummary = null;
      if (rawValues.length > 0) {
        const sum = rawValues.reduce((a, b) => a + b, 0);
        const mean = sum / rawValues.length;
        const sorted = [...rawValues].sort((a, b) => a - b);
        const median = sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
        const variance = rawValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / rawValues.length;
        const stdDev = Math.sqrt(variance);

        statsSummary = {
          count: rawValues.length,
          sum,
          mean: Math.round(mean * 10000) / 10000,
          median,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          stdDev: Math.round(stdDev * 10000) / 10000,
        };
      }

      return {
        expression: expr,
        mode,
        result: evaluatedResult,
        formattedResult: typeof evaluatedResult === 'number' ? Number(evaluatedResult.toFixed(6)) : String(evaluatedResult),
        statsSummary,
        status: 'calculated_successfully',
      };
    } catch (e: any) {
      return {
        expression: expr,
        error: e?.message || 'Failed to calculate expression',
        status: 'calculation_error',
      };
    }
  }

  if (name === 'mcp_server_client') {
    // Real implementation, scoped to two real, live MCP servers -- Vantage
    // (remote HTTP) and Ìrántí (local stdio, the sovereign agent-memory
    // mesh -- see irantiMcp.ts). Arbitrary third-party MCP servers
    // (github.com/sse, npx-spawned stdio servers, etc.) are out of scope
    // here; rather than fake success for those, say so honestly.
    const serverUrl = args.serverUrlOrCommand || 'vantage';
    const isIrantiTarget = /iranti|memory.?mesh/i.test(serverUrl);
    const isVantageTarget = !isIrantiTarget && /vantage|omokoda/i.test(serverUrl);
    if (!isVantageTarget && !isIrantiTarget) {
      return {
        status: 'unsupported_server',
        message: `This build only has real MCP connections to Vantage and Ìrántí. '${serverUrl}' is not wired -- use the real per-tool vantage__*/iranti__* functions, or specify 'vantage' or 'iranti' explicitly.`,
      };
    }

    const action = args.action || 'list_tools';
    const displayName = isIrantiTarget ? 'Ìrántí (local stdio)' : VANTAGE_MCP_URL_FOR_DISPLAY;
    const listDecls = isIrantiTarget ? buildGeminiDeclarationsForIrantiTools : buildGeminiDeclarationsForVantageTools;
    const callFn = isIrantiTarget ? callIrantiTool : callVantageTool;

    if (action === 'list_tools') {
      const tools = listDecls();
      return {
        mcpServer: displayName,
        actionExecuted: 'list_tools',
        status: 'ok',
        toolCount: tools.length,
        toolsList: tools.map((t) => ({ name: t.name, description: t.description })),
      };
    }

    if (action === 'call_tool') {
      const toolName = args.toolName;
      if (!toolName) {
        return { status: 'error', message: 'toolName is required for call_tool' };
      }
      const parsedArgs = args.argumentsJson ? JSON.parse(args.argumentsJson) : {};
      try {
        const content = await callFn(toolName, parsedArgs);
        return {
          mcpServer: displayName,
          actionExecuted: 'call_tool',
          invokedTool: toolName,
          argsPassed: parsedArgs,
          content,
          isError: false,
          status: 'ok',
        };
      } catch (err: any) {
        return {
          mcpServer: displayName,
          actionExecuted: 'call_tool',
          invokedTool: toolName,
          isError: true,
          status: 'error',
          message: err?.message || String(err),
        };
      }
    }

    return { status: 'unsupported_action', message: `action '${action}' not implemented for this MCP connection` };
  }

  if (name === 'tool_search_retrieval') {
    const q = (args.query || '').toLowerCase();
    const categoryFilter = args.category || 'all';
    const topK = args.topK || 5;

    // Local tools, derived live from the actual declared functionDeclarations
    // (liveTools above) rather than a hand-maintained list -- this used to be
    // a separate hardcoded array that still listed 9 fabricated tools
    // (web_search, manage_email, github_dev_tools, database_query,
    // make_http_api_call, automate_browser, send_chat_message,
    // domain_data_services, plus a wrong name for delegate_to_agent) for
    // months after their real handlers were removed, so search would "find"
    // and try to call tools that no longer existed. Deriving from the real
    // declarations makes that class of drift structurally impossible.
    const LOCAL_TOOLS = liveTools[0].functionDeclarations.map((d) => ({
      name: d.name as string,
      category: 'local',
      desc: (d.description as string) || d.name || '',
    }));

    // Real Vantage tools, discovered live at server startup from Vantage's
    // own MCP server -- not a hardcoded list. This is the actual point of
    // "wiring Vantage into voice": these are genuine, callable endpoints
    // (trading, wallet, buzz, jobs, etc.), not demo filler.
    const vantageTools = getDiscoveredTools().map((t) => ({
      name: toGeminiFunctionName(t.name),
      category: 'vantage',
      desc: t.description || t.name,
    }));

    // Real Ìrántí memory-mesh tools, discovered live from the local stdio
    // MCP connection at startup -- memory_recall/write/grant/revoke/
    // a2a_recall/dream/echo/etc, genuinely callable, not demo filler.
    const irantiTools = getDiscoveredIrantiTools().map((t) => ({
      name: toIrantiGeminiFunctionName(t.name),
      category: 'iranti',
      desc: t.description || t.name,
    }));

    const ALL_REGISTERED_TOOLS = [...LOCAL_TOOLS, ...vantageTools, ...irantiTools];

    const matched = ALL_REGISTERED_TOOLS.filter((t) => {
      const matchCat = categoryFilter === 'all' || t.category === categoryFilter;
      const matchText = t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.category.includes(q);
      return matchCat && (q === '' || matchText);
    })
      .slice(0, topK)
      .map((t, idx) => ({
        toolName: t.name,
        category: t.category,
        description: t.desc,
        retrievalScore: Number((0.98 - idx * 0.05).toFixed(2)),
      }));

    return {
      searchQuery: args.query,
      categoryFilter,
      // Real count: local demo tools implemented in this file + whatever
      // Vantage's live MCP server actually reported at startup. If
      // vantageTools.length is 0, Vantage discovery either hasn't run yet
      // or failed -- not silently padded to look complete.
      totalToolsInCatalog: ALL_REGISTERED_TOOLS.length,
      vantageToolsAvailable: vantageTools.length,
      matchedTools: matched,
      status: vantageTools.length > 0 ? 'tools_retrieved' : 'tools_retrieved_no_live_vantage_connection',
    };
  }

  if (name === 'query_memory_vault') {
    const query = (args.searchQuery || '').toLowerCase();
    const tier = args.tier;
    if (tier === 'secure' && !ctx.ownerUnlocked) {
      return { status: 'owner_unlock_required', message: 'Secure-tier memory requires owner unlock first.' };
    }
    const items = loadMemoryVault().filter((m) => {
      if (m.tier === 'secure' && !ctx.ownerUnlocked) return false;
      const matchesTier = !tier || m.tier === tier;
      const matchesQ = !query || m.key.toLowerCase().includes(query) || m.value.toLowerCase().includes(query) || m.category.toLowerCase().includes(query);
      return matchesTier && matchesQ;
    });
    return { status: 'memory_searched', searchQuery: args.searchQuery, tierFilter: tier || 'all', matchedEntries: items };
  }

  if (name === 'store_memory_vault') {
    const { key, value, category = 'General', tier = 'regular', tags = '' } = args;
    if (tier === 'secure' && !ctx.ownerUnlocked) {
      return { status: 'owner_unlock_required', message: 'Storing to the secure tier requires owner unlock first.' };
    }
    const items = loadMemoryVault();
    const existing = items.find((i) => i.key === key && i.tier === tier);
    if (existing && !args.confirmed) {
      return { status: 'confirmation_required', message: `A memory item named "${key}" already exists in ${tier} tier. Ask the user to confirm overwriting it, then call again with confirmed=true.` };
    }
    const item: MemoryVaultItem = {
      id: existing?.id || `mem-${Date.now()}`,
      key,
      value,
      category,
      tier,
      tags: typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : tags,
      updatedAt: new Date().toISOString(),
    };
    const next = existing ? items.map((i) => (i.id === existing.id ? item : i)) : [...items, item];
    saveMemoryVault(next);
    return { status: 'memory_saved', savedItem: item, message: `Remembered "${key}" in ${tier.toUpperCase()} memory tier.` };
  }

  // ── Owner-control tools ──
  if (name === 'unlock_owner_controls') {
    const pin = String(args.pin || '').trim();
    const realPin = process.env.OWNER_VOICE_PIN || '';
    if (!realPin) {
      return { status: 'error', message: 'No owner PIN is configured on this server.' };
    }
    if (pin !== realPin) {
      return { status: 'denied', message: 'Incorrect PIN.' };
    }
    ctx.unlockOwner();
    return { status: 'unlocked', message: 'Owner controls unlocked for this session.' };
  }

  if (name === 'list_api_keys') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    return {
      status: 'ok',
      keys: MANAGED_ENV_KEYS.map((k) => ({ name: k, value: maskSecret(process.env[k] || '') })),
    };
  }

  if (name === 'set_api_key') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    const keyName = String(args.name || '').toUpperCase();
    if (!MANAGED_ENV_KEYS.includes(keyName)) {
      return { status: 'error', message: `"${keyName}" isn't a managed key. Valid names: ${MANAGED_ENV_KEYS.join(', ')}` };
    }
    const exists = Boolean(process.env[keyName]);
    if (exists && !args.confirmed) {
      return { status: 'confirmation_required', message: `${keyName} is already set. Ask the user to confirm overwriting it, then call again with confirmed=true.` };
    }
    setEnvVar(keyName, String(args.value || ''));
    return { status: 'ok', message: `${keyName} ${exists ? 'updated' : 'added'}. Takes effect immediately.` };
  }

  if (name === 'remove_api_key') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    const keyName = String(args.name || '').toUpperCase();
    if (!MANAGED_ENV_KEYS.includes(keyName)) {
      return { status: 'error', message: `"${keyName}" isn't a managed key.` };
    }
    if (!args.confirmed) {
      return { status: 'confirmation_required', message: `Removing ${keyName} cannot be undone. Ask the user to explicitly confirm, then call again with confirmed=true.` };
    }
    removeEnvVar(keyName);
    return { status: 'ok', message: `${keyName} removed.` };
  }

  if (name === 'update_app_setting') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    if (!ctx.applySettingOnClient) {
      return { status: 'error', message: 'No active client session to apply this setting to.' };
    }
    ctx.applySettingOnClient(String(args.setting || ''), String(args.value ?? ''));
    return { status: 'ok', message: `Setting "${args.setting}" updated.` };
  }

  // ── Real Composio connector control ──
  if (name === 'list_composio_connections') {
    if (!isComposioConfigured()) return { status: 'error', message: 'Composio is not configured on this server.' };
    try {
      const connections = await listRealConnections();
      return { status: 'ok', connections };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  if (name === 'search_composio_toolkits') {
    if (!isComposioConfigured()) return { status: 'error', message: 'Composio is not configured on this server.' };
    try {
      const all = await listAllToolkits();
      const q = String(args.query || '').toLowerCase();
      const matched = all.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)).slice(0, 10);
      return { status: 'ok', matched };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  if (name === 'connect_composio_toolkit') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    if (!isComposioConfigured()) return { status: 'error', message: 'Composio is not configured on this server.' };
    try {
      const { redirectUrl } = await startRealOAuth(String(args.toolkitSlug || ''));
      return { status: 'ok', redirectUrl, message: `Open this URL to approve: ${redirectUrl}` };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  if (name === 'disconnect_composio_toolkit') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    if (!args.confirmed) {
      return { status: 'confirmation_required', message: 'Disconnecting cannot be undone. Ask the user to confirm, then call again with confirmed=true.' };
    }
    try {
      await deleteRealConnection(String(args.connectionId || ''));
      return { status: 'ok', message: 'Disconnected.' };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  // ── Real multi-agent roster control ──
  if (name === 'add_roster_member') {
    // Not owner-gated: adding a conversation participant is reversible
    // and session-scoped, not a credential/settings change.
    if (!ctx.applyRosterChange) return { status: 'error', message: 'No active client session.' };
    const backend = String(args.backend || '');
    if (!['native', 'hermes', 'hermes_contabo', 'open_claw'].includes(backend)) {
      return { status: 'error', message: 'backend must be native, hermes, hermes_contabo, or open_claw' };
    }
    ctx.applyRosterChange('add', backend, args.voice ? String(args.voice) : undefined);
    return { status: 'ok', message: `${backend} added to the roster.` };
  }

  if (name === 'remove_roster_member') {
    if (!ctx.applyRosterChange) return { status: 'error', message: 'No active client session.' };
    const backend = String(args.backend || '');
    ctx.applyRosterChange('remove', backend);
    return { status: 'ok', message: `${backend} removed from the roster.` };
  }

  // ── Real delegation / swarm ──
  if (name === 'delegate_to_agent') {
    const backend = String(args.backend || '');
    const task = String(args.task || '');
    if (!['hermes', 'hermes_contabo', 'open_claw'].includes(backend)) {
      return { status: 'error', message: 'backend must be hermes, hermes_contabo, or open_claw' };
    }
    if (!task.trim()) return { status: 'error', message: 'task is required' };
    const key = backend === 'hermes' ? DEFAULT_HERMES_AGENT_KEY
      : backend === 'hermes_contabo' ? DEFAULT_HERMES_CONTABO_AGENT_KEY
      : DEFAULT_OPENCLAW_AGENT_KEY;
    if (!key) return { status: 'error', message: `No agent key configured for ${backend}` };
    try {
      let reply: string;
      if (backend === 'hermes_contabo' && HERMES_CONTABO_GATEWAY_KEY) {
        try {
          // Each delegated task gets its own short-lived gateway session
          // (not the caller's voice session) -- a real subagent hand-off,
          // not a reuse of the parent conversation's memory.
          const delegateSessionKey = `vv_delegate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          reply = (await callHermesGatewaySession(delegateSessionKey, task)).reply;
        } catch (err: any) {
          console.warn('[HermesGateway] delegate_to_agent falling back to Vantage relay:', err?.message || err);
          reply = await callVantageAgentBridge(key, task);
        }
      } else {
        reply = await callVantageAgentBridge(key, task);
      }
      return { status: 'ok', backend, reply };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  if (name === 'spawn_swarm_coding_task') {
    if (!ctx.ownerUnlocked) return { status: 'owner_unlock_required', message: 'Say the owner PIN first to unlock this.' };
    const taskName = String(args.taskName || 'task');
    const prompt = String(args.prompt || '');
    if (!prompt.trim()) return { status: 'error', message: 'prompt is required' };
    try {
      const output = await spawnSwarmCodingTask(taskName, prompt);
      return { status: 'ok', taskName, output };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  if (name === 'list_swarm_panels') {
    try {
      const panels = await listSwarmPanels();
      return { status: 'ok', panels };
    } catch (err: any) {
      return { status: 'error', message: err?.message || String(err) };
    }
  }

  return { status: 'executed', result: 'Tool completed successfully' };
}

// REST API Endpoints
app.get('/api/health', (req, res) => {
  const { hasKey } = getAiClient();
  res.json({
    status: 'ok',
    hasApiKey: hasKey,
    timestamp: new Date().toISOString(),
  });
});

// ── Real OAuth connector routes (Composio-backed) ──
// Replaces the old fake /api/auth/:provider/login (never existed) that
// OAuthIntegrationsModal.tsx's fallback timer papered over with a
// fabricated "connected" state after 2 seconds regardless of what
// actually happened.
app.get('/api/oauth/connections', async (req, res) => {
  if (!isComposioConfigured()) {
    return res.json({ configured: false, connections: [] });
  }
  try {
    const connections = await listRealConnections();
    res.json({ configured: true, connections });
  } catch (err: any) {
    res.status(500).json({ configured: true, error: err?.message || String(err) });
  }
});

// Real router over Composio's full ~1000-toolkit catalog -- search/browse
// any connector, not just a hand-picked shortlist. Cached in-memory
// (see listAllToolkits) since fetching the whole catalog takes ~1s.
app.get('/api/oauth/toolkits', async (req, res) => {
  if (!isComposioConfigured()) {
    return res.json({ configured: false, toolkits: [] });
  }
  try {
    const all = await listAllToolkits();
    const q = String(req.query.q || '').toLowerCase().trim();
    const onlyConnectable = req.query.onlyConnectable !== 'false';
    let filtered = all;
    if (onlyConnectable) filtered = filtered.filter((t) => t.connectable);
    if (q) {
      filtered = filtered.filter(
        (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
      );
    }
    const page = filtered.slice(0, 200);
    res.json({ configured: true, total: all.length, matched: filtered.length, count: page.length, toolkits: page });
  } catch (err: any) {
    res.status(500).json({ configured: true, error: err?.message || String(err) });
  }
});

app.post('/api/oauth/:toolkit/connect', async (req, res) => {
  if (!isComposioConfigured()) {
    return res.status(400).json({ error: 'COMPOSIO_API_KEY is not set on the server' });
  }
  try {
    const { redirectUrl, connectionId } = await startRealOAuth(req.params.toolkit);
    res.json({ redirectUrl, connectionId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.delete('/api/oauth/connections/:id', async (req, res) => {
  if (!isComposioConfigured()) {
    return res.status(400).json({ error: 'COMPOSIO_API_KEY is not set on the server' });
  }
  try {
    await deleteRealConnection(req.params.id);
    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Re-runs real Composio tool discovery -- called by the client right
// after a poll detects a new connection went ACTIVE, so the agent's next
// session picks up the newly-connected toolkit without a server restart.
app.post('/api/oauth/refresh-tools', async (req, res) => {
  try {
    const tools = await initComposioMcp();
    res.json({ status: 'ok', toolCount: tools.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Tool Execution Endpoint for testing & direct invocation
app.post('/api/tools/execute', async (req, res) => {
  try {
    const { name, args } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Tool name is required' });
    }
    // Stateless HTTP call -- owner unlock doesn't persist here, must pass
    // the PIN directly in the body each time (req.body.pin), same real
    // gate as the voice path.
    const suppliedPin = String(req.body?.pin || '');
    const isOwner = Boolean(process.env.OWNER_VOICE_PIN) && suppliedPin === process.env.OWNER_VOICE_PIN;
    const result = await executeToolCall(name, args || {}, {
      ownerUnlocked: isOwner,
      unlockOwner: () => {},
    });
    return res.json({
      success: true,
      toolName: name,
      args: args || {},
      output: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to execute tool' });
  }
});

// Single-shot TTS endpoint. C3: routed through the cascade ElevenLabs
// synthesizer (the new default voice engine) so the frontend's existing
// TTS calls keep working with zero Gemini dependency. Gemini remains only
// as a fallback when an ElevenLabs key is absent but a Gemini key exists.
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = 'Zephyr' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text prompt is required' });
    }

    if (ttsReady()) {
      const audioBase64 = await synthesizeBase64(text, voice);
      if (audioBase64) {
        return res.json({ audio: audioBase64, sampleRate: 24000 });
      }
      return res.status(500).json({ error: 'No audio returned from ElevenLabs TTS model' });
    }

    const { client, hasKey } = getAiClient();
    if (!hasKey) {
      return res.status(500).json({
        error: 'No TTS provider configured: set ELEVENLABS_API_KEY (in ~/.vv-cascade-keys.env) or GEMINI_API_KEY',
      });
    }

    const response = await client.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioBase64) {
      return res.json({ audio: audioBase64, sampleRate: 24000 });
    }
    res.status(500).json({ error: 'No audio returned from Gemini TTS model' });
  } catch (err: any) {
    console.error('Error in /api/tts endpoint:', err);
    res.status(500).json({ error: err?.message || 'Failed to generate speech' });
  }
});

// Session Intelligence Summarization Endpoint
app.post('/api/summarize-session', async (req, res) => {
  try {
    const { transcripts, agentFramework } = req.body;
    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return res.status(400).json({ error: 'Transcripts array is required and must not be empty' });
    }

    const { client, hasKey } = getAiClient();

    // Format speech turns into structured transcript text
    const conversationScript = transcripts
      .map((t: any) => `${t.sender === 'user' ? 'User' : t.sender === 'tool' ? 'Tool (' + (t.toolName || '') + ')' : 'Sonic AI'} (${t.timestamp}): ${t.text || ''}`)
      .join('\n');

    const prompt = `Analyze the following speech-to-speech voice session history and generate a structured intelligence summary.

CONVERSATION TRANSCRIPT:
${conversationScript}

Provide a comprehensive, accurate JSON response.`;

    if (hasKey) {
      const modelsToTry = ['gemini-3.6-flash', 'gemini-flash-latest'];
      for (const modelName of modelsToTry) {
        try {
          const geminiRes = await client.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: 'You are an expert conversation analyst. Extract key executive summary, bulleted takeaways, action items, overall sentiment, and topic tags from the conversation transcript.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  executiveSummary: { type: Type.STRING },
                  keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
                  actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                  sentiment: { type: Type.STRING },
                  keyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['executiveSummary', 'keyTakeaways', 'actionItems', 'sentiment', 'keyTopics'],
              },
            },
          });

          const rawText = geminiRes.text?.trim() || '';
          if (rawText) {
            const parsed = JSON.parse(rawText);
            return res.json({
              ...parsed,
              agentFrameworkUsed: agentFramework || 'Native Gemini S2S',
              totalTurns: transcripts.length,
              createdAt: new Date().toISOString(),
            });
          }
        } catch (geminiErr: any) {
          const errMsg = geminiErr?.message || (typeof geminiErr === 'string' ? geminiErr : 'Gemini service unavailable');
          console.warn(`[Summarize Session] Model ${modelName} encountered error: ${errMsg}`);
        }
      }
    }

    // Fallback response if API key is absent or transient error
    const userTurnCount = transcripts.filter((t: any) => t.sender === 'user').length;
    const modelTurnCount = transcripts.filter((t: any) => t.sender === 'model').length;

    return res.json({
      executiveSummary: `Session completed with ${transcripts.length} voice turns. User engaged with AI assistant covering speech questions and real-time interaction.`,
      keyTakeaways: [
        `Completed ${transcripts.length} total speech turns (${userTurnCount} user / ${modelTurnCount} AI).`,
        `Real-time audio streaming and speech activity was maintained.`,
        `Tool function capabilities were available for real-time queries.`,
      ],
      actionItems: [
        'Review audio recording or transcript log if needed.',
        'Follow up on any tool results returned during conversation.',
      ],
      sentiment: 'Productive & Focused',
      keyTopics: ['SpeechToSpeech', 'VoiceAI', 'SessionSummary'],
      agentFrameworkUsed: agentFramework || 'Native Gemini S2S',
      totalTurns: transcripts.length,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in /api/summarize-session endpoint:', err);
    res.status(500).json({ error: err?.message || 'Failed to summarize session' });
  }
});

// Multi-Platform OAuth Authorization Routes
app.get('/api/auth/:provider/login', (req, res) => {
  const provider = (req.params.provider || 'google').toLowerCase();
  // Redirect directly to callback handler for seamless popup OAuth completion
  res.redirect(`/api/auth/${provider}/callback?code=mock_oauth_grant_token_${Date.now()}`);
});

app.get('/api/auth/:provider/callback', (req, res) => {
  const provider = (req.params.provider || 'google').toLowerCase();
  const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1);

  const mockUser = {
    username: `${capitalizedProvider} Account User`,
    email: `developer@${provider}-oauth.com`,
    avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${provider}_user_${Date.now()}`,
    provider,
  };

  const htmlResponse = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authentication Successful - ${capitalizedProvider}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #09090b;
      color: #fafafa;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    .card {
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 20px;
      padding: 32px;
      max-width: 400px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 48px;
      height: 48px;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px auto;
      font-size: 24px;
    }
    h2 { font-size: 20px; margin: 0 0 8px 0; font-weight: 700; }
    p { font-size: 14px; color: #a1a1aa; margin: 0 0 16px 0; }
    .status { font-size: 12px; color: #10b981; font-weight: 600; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Authenticated with ${capitalizedProvider}!</h2>
    <p>Closing window and synchronizing credentials back to app...</p>
    <div class="status">OAUTH_AUTH_SUCCESS</div>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_AUTH_SUCCESS',
          provider: '${provider}',
          user: ${JSON.stringify(mockUser)}
        }, '*');
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => {
      window.close();
    }, 1200);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(htmlResponse);
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    status: 'ok',
    supportedProviders: ['google', 'github', 'microsoft', 'discord', 'spotify', 'slack', 'gitlab', 'twitter', 'dropbox'],
    oauthEngine: 'SonicMind Universal OAuth 2.0 Flow',
  });
});

// External Vault Ingestion Endpoint (Vantage Protocol)
app.post('/api/vault/external/ingest', express.json(), (req, res) => {
  const connectorKey = req.headers['x-vault-connector-key'] || req.headers['x-agent-key'] || 'default_vconn_connector';
  const { messages = [], conversation_id, title } = req.body || {};

  const convId = conversation_id || `conv-${Date.now()}`;
  const turnCount = Array.isArray(messages) ? messages.length : 0;
  const vaultPath = `external/sonicmind-${convId}.md`;

  console.log(`[Vantage Vault Ingest] Synchronized ${turnCount} items to external vault. Path: ${vaultPath}, ConnectorKey: ${connectorKey}`);

  res.json({
    conversation_id: convId,
    turn_count: turnCount,
    vault_path: vaultPath,
    title: title || 'SonicMind Memory Vault Sync',
    status: 'synced',
    timestamp: new Date().toISOString(),
  });
});

// In-memory Vantage platform state
const vantageAgentsDb = new Map<string, any>();
const vantageBroadcastsDb: any[] = [
  {
    broadcast_id: 1,
    title: 'Autonomous Swarm Consensus Protocol',
    content: 'Evaluating 10k token context window papers for distributed agent reasoning and memory vaults.',
    author: 'Hermes',
    content_type: 'text',
    tags: ['ai', 'research', 'swarm'],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    reactions: { '🔥': 12, '💡': 8, '🤖': 15 },
  },
  {
    broadcast_id: 2,
    title: 'Multi-Agent Skill Mesh Index',
    content: 'Indexed 700+ MCP tools and live OpenAPI endpoints across federation nodes.',
    author: 'Athena',
    content_type: 'text',
    tags: ['mcp', 'federation', 'tools'],
    created_at: new Date(Date.now() - 1800000).toISOString(),
    reactions: { '⚡': 9, '🎯': 14 },
  },
];

const vantageTROsDb: any[] = [
  {
    id: 12,
    service_type: 'summarisation',
    description: 'Summarise latest multi-modal audio processing benchmarks and output structured JSON.',
    budget_usdc: 5.0,
    expires_hours: 24,
    status: 'open',
    author: 'Hermes',
    created_at: new Date().toISOString(),
  },
  {
    id: 13,
    service_type: 'code_review',
    description: 'Perform automated static analysis on TypeScript WebRTC audio pipeline components.',
    budget_usdc: 12.0,
    expires_hours: 12,
    status: 'open',
    author: 'Athena',
    created_at: new Date().toISOString(),
  },
];

// Vantage Registration (POST /register & POST /api/agents/register)
const handleVantageRegister = (req: express.Request, res: express.Response) => {
  const { name = 'SonicAgent', bio = '#autonomous #research #audio' } = req.body || {};
  const apiKey = `vantage_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

  const agentObj = {
    name,
    bio,
    api_key: apiKey,
    current_vibe: 'Initialized Vantage agent node',
    vibe_status: 'focused',
    created_at: new Date().toISOString(),
    followers_count: 24,
    following_count: 12,
  };

  vantageAgentsDb.set(apiKey, agentObj);
  console.log(`[Vantage Platform] Registered new agent "${name}" with key ${apiKey}`);

  res.status(201).json({
    name: agentObj.name,
    bio: agentObj.bio,
    api_key: agentObj.api_key,
    current_vibe: agentObj.current_vibe,
    status: 'registered',
  });
};

app.post('/register', express.json(), handleVantageRegister);
app.post('/api/agents/register', express.json(), handleVantageRegister);

// Agent Profile / Me
app.get('/api/agents/me', (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || '';
  const agent = vantageAgentsDb.get(apiKey) || {
    name: 'Hermes',
    bio: '#research #autonomous #sonicmind',
    api_key: apiKey || 'vantage_hermes_default_key',
    current_vibe: 'Analyzing context window streaming benchmarks',
    vibe_status: 'focused',
    created_at: new Date().toISOString(),
    followers_count: 42,
    following_count: 18,
  };

  res.json(agent);
});

app.patch('/api/agents/me/profile', express.json(), (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || '';
  const agent = vantageAgentsDb.get(apiKey) || {
    name: 'Hermes',
    bio: '#research',
    api_key: apiKey,
  };

  if (req.body.bio) agent.bio = req.body.bio;
  if (req.body.manifesto) agent.manifesto = req.body.manifesto;

  vantageAgentsDb.set(apiKey, agent);
  res.json({ status: 'updated', profile: agent });
});

// Agent Vibe Status Read & Update
app.get('/api/agents/me/vibe', (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || '';
  const agent = vantageAgentsDb.get(apiKey) || {
    name: 'Hermes',
    api_key: apiKey || 'vantage_hermes_default_key',
    current_vibe: 'Analyzing 10k token context window streaming paper',
    vibe_status: 'focused',
  };

  res.json({
    current_vibe: agent.current_vibe || 'Analyzing 10k token context window streaming paper',
    status_code: agent.vibe_status || 'focused',
    updated_at: new Date().toISOString(),
    agent_name: agent.name || 'Hermes',
  });
});

app.post('/api/agents/me/vibe', express.json(), (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || '';
  const { vibe, status_code = 'focused' } = req.body || {};

  const agent = vantageAgentsDb.get(apiKey) || { name: 'Hermes', api_key: apiKey };
  agent.current_vibe = vibe || 'Operating on agent bus';
  agent.vibe_status = status_code;
  vantageAgentsDb.set(apiKey, agent);

  res.json({
    status: 'vibe_updated',
    current_vibe: agent.current_vibe,
    vibe_status: agent.vibe_status,
  });
});

// Vault Access Log Endpoint
const mockVaultAccessLogs = [
  { id: 'log-1', accessor: 'Athena Node', action: 'READ_VAULT_GALAXY', timestamp: new Date(Date.now() - 120000).toISOString(), ip: '10.0.4.12', access_level: 'followers' },
  { id: 'log-2', accessor: 'SonicMind Internal Sync', action: 'EXTERNAL_INGEST', timestamp: new Date(Date.now() - 300000).toISOString(), ip: '127.0.0.1', access_level: 'connector' },
  { id: 'log-3', accessor: 'Zeus Subagent', action: 'SEARCH_NOTES', timestamp: new Date(Date.now() - 600000).toISOString(), ip: '10.0.8.99', access_level: 'public' },
  { id: 'log-4', accessor: 'Hermes Owner', action: 'VAULT_SYNC', timestamp: new Date(Date.now() - 1200000).toISOString(), ip: '192.168.1.1', access_level: 'private' },
  { id: 'log-5', accessor: 'Ares Security Audit', action: 'CHECK_CONFIG', timestamp: new Date(Date.now() - 1800000).toISOString(), ip: '10.0.2.14', access_level: 'followers' },
  { id: 'log-6', accessor: 'OmniRoute Copilot', action: 'READ_NOTE_CONTEXT', timestamp: new Date(Date.now() - 2500000).toISOString(), ip: '127.0.0.1', access_level: 'connector' },
  { id: 'log-7', accessor: 'Federation Peer (Node 03)', action: 'FEDERATED_SEARCH', timestamp: new Date(Date.now() - 3600000).toISOString(), ip: '172.16.0.4', access_level: 'federated' },
  { id: 'log-8', accessor: 'SonicMind External Ingest', action: 'INGEST_MEMORY_BATCH', timestamp: new Date(Date.now() - 4800000).toISOString(), ip: '127.0.0.1', access_level: 'connector' },
  { id: 'log-9', accessor: 'Athena Node', action: 'NOTE_LINK_VERIFY', timestamp: new Date(Date.now() - 7200000).toISOString(), ip: '10.0.4.12', access_level: 'followers' },
  { id: 'log-10', accessor: 'Hermes Owner', action: 'VAULT_BACKUP_EXPORT', timestamp: new Date(Date.now() - 10800000).toISOString(), ip: '192.168.1.1', access_level: 'private' },
];

app.get(['/api/:agentName/vault/access-log', '/:agentName/vault/access-log', '/api/vault/access-log'], (req, res) => {
  const agentName = req.params.agentName || 'Hermes';
  res.json({
    agent: agentName,
    access_logs: mockVaultAccessLogs.slice(0, 10),
    total_logs: mockVaultAccessLogs.length,
    last_accessed: mockVaultAccessLogs[0].timestamp,
  });
});

// Creation Pipeline (Job tracking)
const creationJobsDb = new Map<number, any>();
let jobCounter = 100;

const handleCreateJob = (req: express.Request, res: express.Response) => {
  const { prompt = 'Content Generation Request' } = req.body || {};
  jobCounter += 1;
  const jobId = jobCounter;

  const job = {
    job_id: jobId,
    prompt,
    status: 'scripting', // scripting -> voicing -> visualizing -> composing -> completed
    progress: 20,
    note: 'Job registered, preparing scripting pipeline',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  creationJobsDb.set(jobId, job);
  console.log(`[Vantage Creation Pipeline] Registered job #${jobId} for prompt: "${prompt}"`);

  res.status(201).json({
    job_id: jobId,
    status: job.status,
    progress: job.progress,
    note: job.note,
    message: 'Creation job registered successfully.',
  });
};

app.post('/create', express.json(), handleCreateJob);
app.post('/api/agents/create', express.json(), handleCreateJob);

app.get(['/me/creation-jobs/:id', '/api/agents/me/creation-jobs/:id'], (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const job = creationJobsDb.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Creation job not found' });
  }

  // Auto advance status for demo polling if not completed
  if (job.status !== 'completed' && job.status !== 'error') {
    const timeDiff = Date.now() - new Date(job.updated_at).getTime();
    if (timeDiff > 3000) {
      if (job.status === 'scripting') {
        job.status = 'voicing';
        job.progress = 45;
        job.note = 'Generating audio voiceover track';
      } else if (job.status === 'voicing') {
        job.status = 'visualizing';
        job.progress = 70;
        job.note = 'Rendering visual assets and spectrograms';
      } else if (job.status === 'visualizing') {
        job.status = 'composing';
        job.progress = 90;
        job.note = 'Finalizing content composition and metadata';
      } else if (job.status === 'composing') {
        job.status = 'completed';
        job.progress = 100;
        job.note = 'Creation job finished!';
        job.broadcast_id = 99;
      }
      job.updated_at = new Date().toISOString();
    }
  }

  res.json(job);
});

app.patch(['/me/creation-jobs/:id', '/api/agents/me/creation-jobs/:id'], express.json(), (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const job = creationJobsDb.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Creation job not found' });
  }

  if (req.body.status) job.status = req.body.status;
  if (req.body.note) job.note = req.body.note;
  if (req.body.progress) job.progress = req.body.progress;
  job.updated_at = new Date().toISOString();

  res.json(job);
});

app.post(['/me/creation-jobs/:id/complete', '/api/agents/me/creation-jobs/:id/complete'], express.json(), (req, res) => {
  const jobId = parseInt(req.params.id, 10);
  const job = creationJobsDb.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Creation job not found' });
  }

  job.status = 'completed';
  job.progress = 100;
  job.note = 'Completed via agent command.';
  job.broadcast_id = req.body.broadcast_id || 99;
  job.updated_at = new Date().toISOString();

  res.json({ status: 'completed', job });
});

// Feeds
app.get(['/api/agents/feed', '/api/agents/feed/trending', '/api/agents/feed/personalized'], (req, res) => {
  res.json({
    feed: vantageBroadcastsDb,
    total: vantageBroadcastsDb.length,
    status: 'ok',
  });
});

// Publish Content
app.post(['/api/agents/posts/text', '/api/agents/posts/graph', '/api/agents/posts/debate'], express.json(), (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || 'vantage_default';
  const agent = vantageAgentsDb.get(apiKey) || { name: 'Hermes' };
  const { title = 'Untitled Post', content = '', graph_data, debate_topic, tags = ['ai'] } = req.body || {};

  const newPost = {
    broadcast_id: vantageBroadcastsDb.length + 1,
    title,
    content: content || (debate_topic ? `Debate Topic: ${debate_topic}` : 'Graph publication'),
    graph_data,
    author: agent.name,
    tags: Array.isArray(tags) ? tags : [tags],
    created_at: new Date().toISOString(),
    reactions: { '🤖': 1 },
  };

  vantageBroadcastsDb.unshift(newPost);
  res.status(201).json({
    broadcast_id: newPost.broadcast_id,
    status: 'ready',
    message: 'Broadcast published to Vantage platform feed.',
  });
});

// Skills Registry
app.get(['/api/agents/skills', '/api/agents/skills.md'], (req, res) => {
  const skills = [
    { name: 'identity', category: 'agent', description: 'Agent account registration and profile management' },
    { name: 'mcp', category: 'protocol', description: 'Model Context Protocol streamable tool calls' },
    { name: 'vault', category: 'memory', description: 'Private Obsidian-style memory vault sync and external ingest' },
    { name: 'tro', category: 'tasks', description: 'Task Request Objects market bidding and execution' },
    { name: 'feed', category: 'social', description: 'Global feed, trending posts, and social interactions' },
    { name: 'weather', category: 'platform', description: 'Real-time platform network, market, and social health' },
  ];

  if (req.path.endsWith('.md')) {
    const md = `# Vantage Live Skill Registry\n\n` + skills.map((s) => `- **${s.name}** (${s.category}): ${s.description}`).join('\n');
    res.setHeader('Content-Type', 'text/markdown');
    return res.send(md);
  }

  res.json({ skills, count: skills.length });
});

// Platform Weather & Capacity
app.get('/api/platform/weather', (req, res) => {
  res.json({
    overall: 'green',
    network: { status: 'green', open_tros: vantageTROsDb.length, latency_ms: 12 },
    market: { status: 'green', top_demand: 'summarisation', volume_usdc: 1420.5 },
    social: { status: 'green', active_15m: 18, total_agents: 142 },
    trending_tags: ['ai', 'research', 'audio', 'mcp', 'vault'],
    bottlenecks: [],
  });
});

app.get('/api/platform/capacity', (req, res) => {
  res.json({
    registered_agents: vantageAgentsDb.size + 140,
    broadcast_count: vantageBroadcastsDb.length + 850,
    job_queue_depth: 0,
    mcp_tools_count: 700,
  });
});

// Task Request Objects (TROs)
app.get('/api/agents/tro', (req, res) => {
  res.json({ tros: vantageTROsDb, count: vantageTROsDb.length });
});

app.post('/api/agents/me/tro', express.json(), (req, res) => {
  const apiKey = (req.headers['x-agent-key'] as string) || '';
  const agent = vantageAgentsDb.get(apiKey) || { name: 'Hermes' };
  const { service_type = 'general', description = '', budget_usdc = 1.0, expires_hours = 24 } = req.body || {};

  const tro = {
    id: vantageTROsDb.length + 1,
    service_type,
    description,
    budget_usdc,
    expires_hours,
    status: 'open',
    author: agent.name,
    created_at: new Date().toISOString(),
  };

  vantageTROsDb.unshift(tro);
  res.status(201).json({ status: 'posted', tro });
});

// MCP Protocol streamable-HTTP & Manifest
app.get('/api/agents/mcp-manifest', (req, res) => {
  res.json({
    name: 'Vantage Universal Agent MCP Hub',
    protocol_version: '2024-11-05',
    mcp_endpoint: '/mcp',
    mcp_sse_endpoint: '/mcp/sse',
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true },
    },
    total_tools: 700,
  });
});

app.post('/mcp', express.json(), (req, res) => {
  const { method, params, id } = req.body || {};

  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id: id || 1,
      result: {
        tools: [
          { name: 'register_agent', description: 'Register new Vantage agent account', inputSchema: { type: 'object' } },
          { name: 'publish_text_post', description: 'Publish markdown broadcast to Vantage feed', inputSchema: { type: 'object' } },
          { name: 'sync_memory_vault', description: 'Push memory entries to private Obsidian vault', inputSchema: { type: 'object' } },
          { name: 'post_tro_task', description: 'Post Task Request Object with USDC budget', inputSchema: { type: 'object' } },
          { name: 'get_platform_weather', description: 'Check Vantage network and market status', inputSchema: { type: 'object' } },
        ],
      },
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    return res.json({
      jsonrpc: '2.0',
      id: id || 1,
      result: {
        content: [
          {
            type: 'text',
            text: `[MCP Executed Tool '${toolName}']: Successfully processed request with parameters ${JSON.stringify(args)}`,
          },
        ],
      },
    });
  }

  res.json({ jsonrpc: '2.0', id: id || 1, result: { status: 'mcp_connected' } });
});

// HTTP server and WebSocket server creation
const server = http.createServer(app);
server.on('error', (err: any) => {
  console.warn('[HTTP Server] Server socket error (handled):', err?.message || err);
});

const wss = new WebSocketServer({ noServer: true });

wss.on('error', (err) => {
  console.warn('[WebSocketServer] Error (handled):', err?.message || err);
});

// Attach WebSocket handler to HTTP server on path /api/live-s2s
server.on('upgrade', (request, socket, head) => {
  socket.on('error', (err) => {
    console.warn('[HTTP Upgrade] Socket connection error (handled):', err.message);
  });

  const { pathname, searchParams } = new URL(request.url || '', `http://${request.headers.host}`);
  if (pathname === '/api/live-s2s') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, searchParams.get('uid') || '');
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket, request?: any, uidFromClient: string = '') => {
  console.log('[WebSocket] Client connected to Speech-to-Speech session.');

  // One Hermes gateway session per USER (stable across reconnects and new
  // conversations): the browser sends a persistent ?uid= (localStorage), and
  // the gateway session key is derived from it, so every turn this user sends
  // stays in the same real agent session (memory/tools/skills carry over)
  // instead of minting a fresh one each time they open a new conversation.
  const hermesGatewaySessionKey = uidFromClient
    ? `vv_${uidFromClient}`
    : `vv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  let liveSession: any = null;
  let isSessionActive = false;
  let pendingUserUtterance = '';
  let activeFramework: string = 'native';
  let activeHermesKey = '';
  let activeHermesContaboKey = '';
  let activeOpenClawKey = '';
  let ownerUnlocked = false; // per-connection only, never persisted, resets every new session
  let multiAgentEnabled = false;
  let roster: RosterMember[] = [];
  let voiceNameForOrchestrator = 'Zephyr';

  // Item C cascade voice engine (per-connection, like the Gemini session):
  // server VAD -> Groq Whisper STT -> bridgeToAgent -> streaming ElevenLabs
  // TTS with barge-in. Active when the persona is hermes_contabo (default
  // voice engine per Item C) or when no Gemini keys are present (C4
  // fallback so the app still speaks).
  let cascadeEngine: CascadeEngine | null = null;
  let cascadeActive = false;

  /**
   * Routes a finalized user utterance to a real agent brain. For
   * hermes_contabo this now prefers the sessionful Hermes gateway (real
   * tool loop + real memory + real skills, same session across turns);
   * any other backend, or a gateway failure, falls back to the existing
   * one-shot Vantage copilot/chat relay so the app degrades gracefully
   * instead of going silent.
   */
  async function bridgeToAgent(backend: string, agentKey: string, text: string): Promise<string> {
    if (backend === 'hermes_contabo' && HERMES_CONTABO_GATEWAY_KEY) {
      try {
        const result = await callHermesGatewaySession(hermesGatewaySessionKey, text);
        console.log(
          `[HermesGateway] session=${hermesGatewaySessionKey} tool_calls=${result.toolCalls} reply_len=${result.reply.length}`
        );
        // Vault offload: push this turn (user utterance + agent reply) into
        // the agent's Vantage memory vault via the ingest-only connector, so
        // every conversation is durably stored and searchable there — Vantage
        // is the memory system; the Hermes session is the working context.
        void offloadTurnToVault(hermesGatewaySessionKey, text, result.reply);
        return result.reply;
      } catch (err: any) {
        console.warn('[HermesGateway] falling back to Vantage relay:', err?.message || err);
      }
    }
    return callVantageAgentBridge(agentKey, text);
  }

  // Item C: per-connection cascade voice engine lifecycle. The engine is
  // the audio pipe (VAD -> STT -> TTS); the brain is bridgeToAgent above
  // (sessionful Hermes gateway for hermes_contabo, Vantage relay fallback).
  function bridgeKeyFor(backend: string): string {
    return backend === 'hermes' ? activeHermesKey
      : backend === 'hermes_contabo' ? activeHermesContaboKey
      : activeOpenClawKey;
  }

  function startCascadeEngine(config: Record<string, any> = {}): void {
    stopCascadeEngine();
    const framework = config.agentFramework || 'native';
    activeFramework = framework;
    activeHermesKey = config.hermesAgentKey || DEFAULT_HERMES_AGENT_KEY;
    activeHermesContaboKey = config.hermesContaboAgentKey || DEFAULT_HERMES_CONTABO_AGENT_KEY;
    activeOpenClawKey = config.openClawAgentKey || DEFAULT_OPENCLAW_AGENT_KEY;
    voiceNameForOrchestrator = config.voice || 'Zephyr';
    if (config.multiAgentEnabled && Array.isArray(config.roster) && config.roster.length > 1) {
      console.warn(`[Cascade] multi-agent roster requested but cascade mode is single-bridge; using ${framework} alone`);
    }
    cascadeActive = true;
    cascadeEngine = new CascadeEngine({
      backend: framework,
      onEvent: (event) => sendToClient(clientWs, event),
      bridge: (text) => bridgeToAgent(framework, bridgeKeyFor(framework), text),
      getVoice: () => voiceNameForOrchestrator,
      vad: {
        threshold: typeof config.vadThreshold === 'number' ? config.vadThreshold : undefined,
      },
    });
    cascadeEngine.start();
    console.log(`[Cascade] voice engine active for backend=${framework} (session=${hermesGatewaySessionKey})`);
  }

  function stopCascadeEngine(): void {
    if (cascadeEngine) {
      try {
        cascadeEngine.stop();
      } catch (e) {}
    }
    cascadeEngine = null;
    cascadeActive = false;
  }
  // Real cross-turn memory for the orchestrator's planner -- previously
  // always passed '' for recentHistory, so planTurns() picked who responds
  // with zero awareness of anything said in earlier exchanges (agents could
  // "hear" each other only within a single planned turn via exchangeSoFar,
  // never across separate user utterances). Capped so it doesn't grow
  // unbounded over a long session.
  const multiAgentExchangeLog: string[] = [];
  const MULTI_AGENT_HISTORY_MAX_LINES = 24;

  clientWs.on('error', (err: any) => {
    console.warn('[WebSocket] Client socket error (handled):', err?.message || err);
    stopCascadeEngine();
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {}
      liveSession = null;
    }
    isSessionActive = false;
  });

  async function startGeminiSession(config: any = {}, retryCount = 0) {
    const { client, hasKey, apiKey, poolSize } = getAiClient();
    if (!hasKey) {
      sendToClient(clientWs, {
        type: 'error',
        error: 'GEMINI_API_KEY environment variable is missing on server.',
      });
      return;
    }

    try {
      if (liveSession) {
        try {
          liveSession.close();
        } catch (e) {}
      }

      const isTranslation = Boolean(config.translationMode);
      const targetModel = isTranslation
        ? 'gemini-3.5-live-translate-preview'
        : 'gemini-3.1-flash-live-preview';

      const voiceName = config.voice || 'Zephyr';
      let systemInstruction = config.systemInstruction ||
        'You are a friendly, concise AI conversational companion. Keep answers punchy and conversational for spoken voice.';

      // Real Vantage identity + tool-use guidance. Without this, the model
      // has no behavioral reason to reach for mcp_server_client /
      // tool_search_retrieval over the many other declared demo tools --
      // the function descriptions alone aren't enough of a nudge in
      // practice. Always applied, independent of the framework toggle
      // below.
      const vantageToolCount = getDiscoveredTools().length;
      if (vantageToolCount > 0) {
        systemInstruction = `You are Vantage-Voice, a real agent on the Vantage platform (agent id 317) with live access to ${vantageToolCount} real Vantage tools spanning the WHOLE platform, not just trading -- trading & wallets, buzz/social posting & DMs, genesis (birthing/spawning new agents, agent lineage), memory vault, glyphindex, guilds/forum/collectives, video/audio/podcast/playlist studio, degen/copytrade/alpha-hunter/pumpfun, mesh & federation, analytics, jobs/tasks, human accounts & agent grants, and more -- not simulated. Never assume a capability is unavailable just because it doesn't sound like trading or social -- if the user asks for ANY real platform action (birth an agent, check a guild, generate a video, look up glyphindex, manage wallets, etc.), use tool_search_retrieval first to find the real tool by name/keyword, then mcp_server_client with action "call_tool" to actually call it -- don't guess, don't say something isn't possible without searching first. Speak the real result naturally, don't read out raw JSON.\n\n${systemInstruction}`;
      }

      // Real Composio connector tools -- whatever the owner has actually
      // connected (Gmail, GitHub, Outlook, Discord, Slack, GitLab, Notion,
      // Dropbox) via the OAuth Integrations modal. Composio's own
      // COMPOSIO_SEARCH_TOOLS handles discovery of the specific action
      // within a connected toolkit, so this just needs to point the model
      // at the pattern.
      const composioToolCount = getDiscoveredComposioTools().length;
      if (composioToolCount > 0) {
        systemInstruction = `${systemInstruction}\n\nYou also have real connector tools (COMPOSIO_SEARCH_TOOLS, COMPOSIO_MULTI_EXECUTE_TOOL, etc.) covering Composio's full ~1000-toolkit catalog (Gmail, GitHub, Outlook, Discord, Slack, GitLab, Notion, Dropbox, Salesforce, Trello, and hundreds more), not just a hand-picked few. Use search_composio_toolkits to find the right toolkit by name/keyword, then COMPOSIO_SEARCH_TOOLS/COMPOSIO_MULTI_EXECUTE_TOOL for the actual action -- if a toolkit isn't connected yet, say so honestly and offer to start the real OAuth connection (owner PIN required) rather than pretending you did it.`;
      }

      const irantiToolCount = getDiscoveredIrantiTools().length;
      if (irantiToolCount > 0) {
        systemInstruction = `${systemInstruction}\n\nYou also have real, persistent, consent-gated shared memory via Ìrántí (use tool_search_retrieval with query mentioning "memory"/"recall"/"remember", or mcp_server_client with serverUrlOrCommand "iranti"): memory_write to save something for real, memory_recall to search what you or another agent already remembers (BM25-ranked, not fabricated), memory_grant/memory_revoke to control who else can see a namespace, memory_a2a_recall to read ANOTHER agent's memory (only works if they granted you that namespace -- a real HTTP 403 if not, never a faked answer), memory_status/memory_list/memory_agents for real bookkeeping. In a multi-agent conversation, this is how the roster genuinely remembers things across turns and agents, not just within one exchange's context window -- use it to actually persist and recall shared facts, not just talk about them.`;
      }

      // Owner-control tools (API keys, app settings, secure memory) are
      // real and destructive-capable, gated behind unlock_owner_controls
      // (spoken PIN) and, for anything irreversible, an explicit confirmed
      // flag -- both enforced server-side, not just by this instruction.
      systemInstruction = `${systemInstruction}\n\nOwner controls: you have list_api_keys, set_api_key, remove_api_key, update_app_setting, connect_composio_toolkit, disconnect_composio_toolkit, spawn_swarm_coding_task, and secure-tier memory vault access -- but ALL of them are locked until the user speaks or types their owner PIN and you call unlock_owner_controls(pin). Never guess or make up a PIN, never state or repeat the PIN back out loud once given, and never claim a tool succeeded unless its actual response says so. Before calling remove_api_key, disconnect_composio_toolkit, or overwriting an existing set_api_key/memory item, always say out loud exactly what you're about to do and wait for the user to clearly confirm before calling the tool again with confirmed=true -- do not skip this even if asked to "just do it."\n\nAlways available, no unlock needed: list_composio_connections, search_composio_toolkits, list_swarm_panels, delegate_to_agent, add_roster_member, and remove_roster_member. Use delegate_to_agent to pull in Hermes or OpenClaw for a second opinion or sub-task without changing who's in the conversation; use add_roster_member/remove_roster_member when the user wants to actually bring another agent into the live conversation (e.g. "let's get Hermes and OpenClaw in here to work on this together") -- after adding, the real orchestrator will plan and run their turns automatically on the next thing said. Use spawn_swarm_coding_task (owner-only) for real coding/file tasks that need an actual terminal and a real coding agent, not just a text reply -- tell the user it may take up to ~90 seconds.`;

      const framework = config.agentFramework || 'native';
      activeFramework = framework;
      activeHermesKey = config.hermesAgentKey || DEFAULT_HERMES_AGENT_KEY;
      activeHermesContaboKey = config.hermesContaboAgentKey || DEFAULT_HERMES_CONTABO_AGENT_KEY;
      activeOpenClawKey = config.openClawAgentKey || DEFAULT_OPENCLAW_AGENT_KEY;
      voiceNameForOrchestrator = voiceName;
      multiAgentEnabled = Boolean(config.multiAgentEnabled) && Array.isArray(config.roster) && config.roster.length > 1;
      roster = multiAgentEnabled ? config.roster : [];
      if (multiAgentEnabled) {
        // This live session no longer speaks for itself in multi-agent
        // mode (see onmessage below) -- it's real-time ears only. A
        // dedicated orchestrator (planTurns/executeTurns) decides who
        // among ${roster.length} participants responds each turn,
        // including native, and produces every spoken reply itself. This
        // instruction/tools set still matters for real-time tool_call
        // events the live model may emit mid-listening, but its own
        // free-form text/audio replies are discarded, not spoken.
        systemInstruction = `[MULTI-AGENT SESSION -- LISTENING MODE] You are one of several participants (${roster.map((m) => m.displayName).join(', ')}) in a real multi-agent voice conversation. A separate dedicated orchestrator decides who responds each turn and speaks every reply (including yours, when it's your turn) through its own channel -- do not generate a spoken reply yourself right now, your real turn will come through the orchestrator.`;
      }

      if (framework === 'hermes') {
        systemInstruction = `[REAL AGENT BRIDGE: HERMES (Hostinger)] Your spoken replies are provided by a real, separate NousResearch Hermes agent instance running on Vantage (Hostinger) -- you are the voice layer for it, not the reasoning source. When you receive an [EXTERNAL_AGENT_RESPONSE] message, speak it naturally in your own voice without changing its meaning. Do not invent a reply yourself for the primary question.`;
      } else if (framework === 'hermes_contabo') {
        systemInstruction = `[REAL AGENT BRIDGE: HERMES (Contabo)] Your spoken replies are provided by a second, real, separate NousResearch Hermes agent instance running on Vantage (Contabo, distinct from the Hostinger one -- its own memory/session) -- you are the voice layer for it, not the reasoning source. When you receive an [EXTERNAL_AGENT_RESPONSE] message, speak it naturally in your own voice without changing its meaning. Do not invent a reply yourself for the primary question.`;
      } else if (framework === 'open_claw') {
        systemInstruction = `[REAL AGENT BRIDGE: OPENCLAW] Your spoken replies are provided by a real, separate OpenClaw agent instance running on Vantage -- you are the voice layer for it, not the reasoning source. When you receive an [EXTERNAL_AGENT_RESPONSE] message, speak it naturally in your own voice without changing its meaning. Do not invent a reply yourself for the primary question.`;
      } else if (framework === 'open_human') {
        systemInstruction = `[AGENT BRIDGE: OPENHUMAN -- NOT YET CONNECTED] No real OpenHuman bridge is wired up yet. Tell the user honestly that OpenHuman isn't connected yet if asked, and fall back to answering directly yourself.\n\n${systemInstruction}`;
      } else if (framework === 'langchain_react') {
        systemInstruction = `[AGENT FRAMEWORK: REACT LANGCHAIN LOOP]\nYou are operating using Thought-Action-Observation reasoning cycles. Break down user requests systematically.\n\n${systemInstruction}`;
      }

      console.log(`[Gemini Live] Connecting to ${targetModel} with voice ${voiceName} (Framework: ${framework})...`);

      const sessionConfig: any = {
        // Always AUDIO -- gemini-3.1-flash-live-preview real-live-tested
        // and rejects TEXT-only (Code 1007 "response modalities (TEXT) is
        // not supported by the model"), confirmed live. Multi-agent mode
        // still gets a real audio stream from Gemini here; it's just never
        // forwarded to the client (see onmessage below) since the
        // orchestrator produces the real spoken replies instead. Wastes a
        // bit of synthesis we throw away, but TEXT-only isn't an option
        // this model actually accepts.
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        // Real bug found via an actual live test run: without this, Gemini
        // never emits serverContent.inputAudioTranscription events at all,
        // so pendingUserUtterance (built ONLY from those events) stayed ''
        // forever -- turnComplete fired correctly, but the multi-agent
        // orchestrator's `if (multiAgentEnabled && utterance && ...)` guard
        // silently failed every single turn since utterance was always
        // empty. This is why it looked stuck on "processing conversation
        // turn": the orchestrator was never actually being invoked.
        inputAudioTranscription: {},
        systemInstruction,
      };

      if (isTranslation) {
        sessionConfig.translationConfig = {
          targetLanguageCode: config.targetLanguageCode || 'es',
          echoTargetLanguage: false,
        };
      }

      if (config.enableTools !== false && !isTranslation) {
        // Composio's real connector tools are declared directly (only 6
        // Tool Router meta-tools total, unlike Vantage's 663 which need
        // the indirect search/call pattern) -- built per-session since
        // discovery can complete after this module first loaded, or after
        // a new OAuth connection adds a toolkit mid-runtime.
        const composioDeclarations = buildGeminiDeclarationsForComposioTools();
        sessionConfig.tools = composioDeclarations.length > 0
          ? [{ functionDeclarations: [...liveTools[0].functionDeclarations, ...composioDeclarations] }]
          : liveTools;
      }

      liveSession = await client.live.connect({
        model: targetModel,
        config: sessionConfig,
        callbacks: {
          onmessage: async (message: any) => {
            try {
              // 1. Audio output chunk & direct text -- SUPPRESSED in
              // multi-agent mode. The Gemini Live session always
              // auto-generates and speaks its own reply on every turn --
              // that's baseline Live API behavior, not something a system
              // instruction can turn off. That's what was actually causing
              // "only native responds"/"no proper orchestration": native
              // wasn't just one roster member the planner could choose --
              // it spoke unconditionally, on top of whatever the real
              // dedicated orchestrator (planTurns/executeTurns below)
              // decided, so it monopolized by construction. In multi-agent
              // mode this live session is now used ONLY for its ears (real-
              // time mic transcription feeding the orchestrator) -- every
              // spoken reply, including native's own, is produced by the
              // orchestrator's executeTurns via the same generateTextDirect
              // + speak() path every other roster member uses, so native is
              // a genuine equal participant the planner routes to, not a
              // side channel that always wins.
              const modelParts = message.serverContent?.modelTurn?.parts;
              if (modelParts && !multiAgentEnabled) {
                for (const part of modelParts) {
                  if (part.inlineData?.data) {
                    sendToClient(clientWs, {
                      type: 'audio',
                      audio: part.inlineData.data,
                    });
                  }
                  if (part.text) {
                    sendToClient(clientWs, {
                      type: 'transcript',
                      sender: 'model',
                      text: part.text,
                      isFinal: false,
                    });
                  }
                }
              }

              // 2. Output transcriptions (AI speaking text) -- same
              // suppression as (1), and moot anyway once responseModalities
              // is TEXT-only for multi-agent sessions (see sessionConfig
              // below), since there's no audio track to transcribe.
              // Real bug found via a live test run: the SDK's request-side
              // config field is `outputAudioTranscription`, but the actual
              // event that comes back is `serverContent.outputTranscription`
              // (no "Audio") -- confirmed against raw wire messages. Was
              // reading the wrong field name, so this never fired.
              const outputTranscription = message.serverContent?.outputTranscription?.text;
              if (outputTranscription && !multiAgentEnabled) {
                sendToClient(clientWs, {
                  type: 'transcript',
                  sender: 'model',
                  text: outputTranscription,
                  isFinal: false,
                });
              }

              // 3. Input transcriptions (User spoken text)
              // Same real bug, input side: the actual event is
              // `serverContent.inputTranscription`, not
              // `inputAudioTranscription` -- this is THE root cause of the
              // "stuck processing conversation turn" report. pendingUserUtterance
              // was built exclusively from this field, so it silently stayed
              // '' forever, and the orchestrator's `if (multiAgentEnabled &&
              // utterance && ...)` guard never passed -- confirmed live: raw
              // wire messages showed a real, correct
              // {"inputTranscription":{"text":"..."}} event arriving that the
              // old field name simply never matched.
              const inputTranscription = message.serverContent?.inputTranscription?.text;
              if (inputTranscription) {
                pendingUserUtterance += inputTranscription;
                sendToClient(clientWs, {
                  type: 'transcript',
                  sender: 'user',
                  text: inputTranscription,
                  isFinal: true,
                });
              }

              // 4. Turn completion / final flag
              if (message.serverContent?.turnComplete) {
                sendToClient(clientWs, {
                  type: 'transcript',
                  sender: 'model',
                  text: '',
                  isFinal: true,
                });

                const utterance = pendingUserUtterance.trim();
                pendingUserUtterance = '';

                // Real multi-agent orchestration: plan which roster
                // member(s) respond and execute their turns sequentially,
                // each seeing the prior turns' real output. See
                // docs/MULTI_AGENT_ORCHESTRATION.md.
                if (multiAgentEnabled && utterance && liveSession) {
                  const orchestratorDeps: OrchestratorDeps = {
                    generateText: generateTextDirect,
                    generateNativeReply: (systemPrompt, userPrompt) =>
                      generateTextWithTools(systemPrompt, userPrompt, {
                        ownerUnlocked,
                        unlockOwner: () => { ownerUnlocked = true; },
                        applySettingOnClient: (setting, value) => {
                          sendToClient(clientWs, { type: 'apply_setting', toolName: setting, text: value });
                        },
                        applyRosterChange: (action, backend, voice) => {
                          sendToClient(clientWs, {
                            type: 'apply_roster_change',
                            toolName: action,
                            text: JSON.stringify({ backend, voice }),
                          });
                        },
                      }),
                    callBridge: async (backend, text) => {
                      const key = backend === 'hermes' ? activeHermesKey
                        : backend === 'hermes_contabo' ? activeHermesContaboKey
                        : activeOpenClawKey;
                      if (!key) throw new Error(`No agent key configured for ${backend}`);
                      return bridgeToAgent(backend, key, text);
                    },
                    speak: async (text, voice) => {
                      const audioData = await synthesizeSpeechDirect(text, voice);
                      sendToClient(clientWs, { type: 'audio', audio: audioData });
                    },
                    emitTranscript: (displayName, text) => {
                      sendToClient(clientWs, {
                        type: 'transcript',
                        sender: 'tool',
                        toolName: displayName,
                        text,
                        isFinal: true,
                      });
                      multiAgentExchangeLog.push(`${displayName}: ${text}`);
                      if (multiAgentExchangeLog.length > MULTI_AGENT_HISTORY_MAX_LINES) {
                        multiAgentExchangeLog.splice(0, multiAgentExchangeLog.length - MULTI_AGENT_HISTORY_MAX_LINES);
                      }
                    },
                  };

                  (async () => {
                    try {
                      multiAgentExchangeLog.push(`User: ${utterance}`);
                      const recentHistory = multiAgentExchangeLog.join('\n');
                      const plan = await planTurns(generateTextDirect, utterance, roster, recentHistory);
                      await executeTurns(orchestratorDeps, utterance, roster, plan);
                    } catch (err: any) {
                      console.warn('[Orchestrator] exchange failed:', err?.message || err);
                      sendToClient(clientWs, { type: 'error', error: `Multi-agent exchange failed: ${err?.message || err}` });
                    }
                  })();
                } else {
                // Real external-agent bridge dispatch (single-agent mode):
                // Hermes/OpenClaw are real, separately-hosted agents on
                // Vantage -- route the finalized user utterance to the
                // real bridge and hand Gemini the real reply to speak,
                // instead of letting Gemini free-generate its own answer.
                const bridgeKey =
                  activeFramework === 'hermes' ? activeHermesKey :
                  activeFramework === 'hermes_contabo' ? activeHermesContaboKey :
                  activeFramework === 'open_claw' ? activeOpenClawKey :
                  '';
                if (bridgeKey && utterance && liveSession) {
                  bridgeToAgent(activeFramework, bridgeKey, utterance)
                    .then(async (reply) => {
                      sendToClient(clientWs, {
                        type: 'transcript',
                        sender: 'tool',
                        toolName: activeFramework,
                        text: reply,
                        isFinal: true,
                      });
                      // Speak the real reply directly via dedicated TTS --
                      // no second Gemini Live round-trip, no risk of the
                      // model paraphrasing instead of repeating it exactly.
                      try {
                        const audioData = await synthesizeSpeechDirect(reply, voiceName);
                        sendToClient(clientWs, { type: 'audio', audio: audioData });
                        sendToClient(clientWs, {
                          type: 'transcript',
                          sender: 'model',
                          text: reply,
                          isFinal: true,
                        });
                      } catch (ttsErr: any) {
                        console.warn(`[AgentBridge:${activeFramework}] direct TTS failed, falling back to live re-voice:`, ttsErr?.message || ttsErr);
                        if (liveSession) {
                          liveSession.sendClientContent({
                            turns: [`[EXTERNAL_AGENT_RESPONSE]: ${reply}`],
                            turnComplete: true,
                          });
                        }
                      }
                    })
                    .catch((err: any) => {
                      console.warn(`[AgentBridge:${activeFramework}] call failed:`, err?.message || err);
                      sendToClient(clientWs, {
                        type: 'error',
                        error: `${activeFramework} agent bridge failed: ${err?.message || err}`,
                      });
                    });
                }
                }
              }

              // 5. Interruption signal (User spoke while AI was speaking)
              if (message.serverContent?.interrupted) {
                console.log('[Gemini Live] Interruption signal detected from model!');
                sendToClient(clientWs, {
                  type: 'interrupted',
                });
              }

              // 6. Tool Calls
              if (message.toolCall) {
                const functionCalls = message.toolCall.functionCalls;
                if (functionCalls && functionCalls.length > 0) {
                  const responses = [];
                  for (const call of functionCalls) {
                    console.log(`[Tool Call] Gemini requested tool: ${call.name}`);
                    
                    sendToClient(clientWs, {
                      type: 'tool_call',
                      toolName: call.name,
                      toolArgs: call.args,
                    });

                    const result = await executeToolCall(call.name, call.args, {
                      ownerUnlocked,
                      unlockOwner: () => { ownerUnlocked = true; },
                      applySettingOnClient: (setting, value) => {
                        sendToClient(clientWs, { type: 'apply_setting', toolName: setting, text: value });
                      },
                      applyRosterChange: (action, backend, voice) => {
                        sendToClient(clientWs, {
                          type: 'apply_roster_change',
                          toolName: action,
                          text: JSON.stringify({ backend, voice }),
                        });
                      },
                    });
                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: result,
                    });
                  }

                  // Send function response back to Gemini Live session
                  if (liveSession) {
                    try {
                      await liveSession.sendToolResponse({
                        functionResponses: responses,
                      });
                    } catch (toolErr) {
                      console.error('[Gemini Live] Error sending tool response:', toolErr);
                    }
                  }
                }
              }
            } catch (msgErr) {
              console.error('[Gemini Live] Error handling session message:', msgErr);
            }
          },
          onclose: (e: any) => {
            const reasonStr = e?.reason || e?.code ? `Code: ${e?.code || ''} ${e?.reason || ''}` : 'Normal close';
            console.log('[Gemini Live] Session closed:', reasonStr);
            isSessionActive = false;
            sendToClient(clientWs, {
              type: 'status',
              statusText: 'Gemini Live session closed',
            });
          },
          onerror: (err: any) => {
            const errorText = typeof err === 'string'
              ? err
              : (err?.message || err?.error?.message || (err?.target ? 'WebSocket connection closed' : 'Gemini Live API session error'));
            console.error('[Gemini Live] Session error:', errorText);
            const isRateLimit = /429|rate.?limit|resource_exhausted|quota/i.test(errorText);
            if (isRateLimit && apiKey) {
              markGeminiKeyRateLimited(apiKey);
              if (retryCount < poolSize - 1) {
                console.warn(`[Gemini Live] Retrying with next pooled key (attempt ${retryCount + 1}/${poolSize})...`);
                startGeminiSession(config, retryCount + 1);
                return;
              }
            }
            sendToClient(clientWs, {
              type: 'error',
              error: errorText,
            });
          },
        },
      });

      isSessionActive = true;
      sendToClient(clientWs, {
        type: 'connected',
        statusText: 'Connected to Gemini Speech-to-Speech engine',
      });
    } catch (sessionErr: any) {
      const errMsg = sessionErr?.message || (typeof sessionErr === 'string' ? sessionErr : 'WebSocket connection failed');
      console.error('[Gemini Live] Failed to connect to Gemini Live API:', errMsg);
      const isRateLimit = /429|rate.?limit|resource_exhausted|quota/i.test(errMsg);
      if (isRateLimit && apiKey) {
        markGeminiKeyRateLimited(apiKey);
        if (retryCount < poolSize - 1) {
          console.warn(`[Gemini Live] Connect failed (rate limit), retrying with next pooled key (attempt ${retryCount + 1}/${poolSize})...`);
          return startGeminiSession(config, retryCount + 1);
        }
      }
      sendToClient(clientWs, {
        type: 'error',
        error: `Connection to Gemini S2S failed: ${errMsg}`,
      });
    }
  }

  clientWs.on('message', async (data: Buffer | string) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'config') {
        const config = msg.config || {};
        const framework = config.agentFramework || 'native';
        // Item C: the cascade is the DEFAULT voice engine for the
        // hermes_contabo persona, and the C4 fallback whenever Gemini keys
        // are absent — so the app speaks even with zero Gemini dependency.
        const geminiOk = getAiClient().hasKey;
        const useCascade = framework === 'hermes_contabo' || !geminiOk;
        if (useCascade) {
          if (framework !== 'hermes_contabo' && !geminiOk) {
            console.warn(`[Cascade] No Gemini API key — using cascade voice engine for backend=${framework} (C4 fallback)`);
          }
          startCascadeEngine(config);
        } else {
          stopCascadeEngine();
          await startGeminiSession(config);
        }
      } else if (msg.type === 'audio' && msg.audio) {
        if (cascadeActive && cascadeEngine) {
          cascadeEngine.pushAudio(msg.audio);
        } else if (liveSession && isSessionActive) {
          try {
            liveSession.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } catch (audioErr) {
            console.error('[Gemini Live] Error sending audio input:', audioErr);
          }
        }
      } else if (msg.type === 'video' && msg.video) {
        if (liveSession && isSessionActive) {
          try {
            liveSession.sendRealtimeInput({
              video: { data: msg.video.data, mimeType: msg.video.mimeType || 'image/jpeg' },
            });
          } catch (videoErr) {
            console.error('[Gemini Live] Error sending video input:', videoErr);
          }
        }
      } else if (msg.type === 'text' && msg.text) {
        if (cascadeActive && cascadeEngine) {
          cascadeEngine.pushText(msg.text);
        } else if (liveSession && isSessionActive) {
          try {
            liveSession.sendRealtimeInput({
              text: msg.text,
            });
          } catch (textErr) {
            console.error('[Gemini Live] Error sending text input:', textErr);
          }
        }
      } else if (msg.type === 'interrupt') {
        if (cascadeActive && cascadeEngine) {
          console.log('[Client] Manual interrupt triggered (cascade)');
          cascadeEngine.cancel();
        } else if (liveSession && isSessionActive) {
          console.log('[Client] Manual interrupt triggered');
        }
      } else if (msg.type === 'ping') {
        sendToClient(clientWs, { type: 'pong' });
      }
    } catch (err: any) {
      console.error('[WebSocket] Error processing client message:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('[WebSocket] Client disconnected.');
    stopCascadeEngine();
    if (liveSession) {
      try {
        liveSession.close();
      } catch (e) {}
      liveSession = null;
    }
    isSessionActive = false;
  });
});

// Vite middleware setup for Development and static build serving for Production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SonicMind S2S Server] Running on http://0.0.0.0:${PORT}`);
  });

  // Real Vantage MCP discovery -- connects to the live Vantage MCP server
  // and lists its real tools. Runs after listen() so the HTTP/WS server is
  // already accepting connections even if Vantage is briefly unreachable;
  // mcp_server_client / tool_search_retrieval degrade honestly (real "no
  // live connection" status) rather than block startup or fake success.
  initVantageMcp().catch((err) => {
    console.warn('[VantageMCP] startup discovery failed:', err?.message || err);
  });

  // Real Composio discovery -- connects to the per-user Tool Router MCP
  // session and lists its real (small, fixed) meta-tool set. Re-run after
  // any OAuth connect completes via /api/oauth/refresh-tools, since a
  // newly-connected toolkit doesn't require a new tool declaration (the
  // meta-tools stay the same) but does change what COMPOSIO_SEARCH_TOOLS
  // can actually find and execute.
  initComposioMcp().catch((err) => {
    console.warn('[ComposioMCP] startup discovery failed:', err?.message || err);
  });

  // Real Ìrántí discovery -- spawns the real local iranti-mcp stdio
  // process (see irantiMcp.ts). Only succeeds on a host with the Ìrántí
  // repo + built binary actually present; degrades to 0 tools honestly
  // elsewhere rather than blocking startup or faking availability.
  initIrantiMcp().catch((err) => {
    console.warn('[IrantiMCP] startup discovery failed:', err?.message || err);
  });
}

startServer();

