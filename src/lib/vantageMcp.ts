/**
 * Real MCP client connecting voice turns to Vantage's live MCP server.
 *
 * Multi-user: one client scope PER X-Agent-Key. Each scope owns its own
 * transport, its own discovered tool list and its own name map, so a user's
 * agent connection can only ever see and call the Vantage tools their key is
 * authorized for. The module-level (no-suffix) functions below are the
 * legacy single-key surface and delegate to the DEFAULT key (env
 * VANTAGE_AGENT_KEY) — kept so existing call sites keep working; new code
 * must use the *For(agentKey) variants.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';

const VANTAGE_MCP_URL = process.env.VANTAGE_MCP_URL || 'https://omokoda.duckdns.org/mcp';
const DEFAULT_AGENT_KEY = process.env.VANTAGE_AGENT_KEY || '';
// A voice turn shouldn't hang on the MCP SDK's 60s default -- fail fast
// enough that the caller can speak a real error instead of the user
// sitting in silence.
const CALL_TIMEOUT_MS = 20_000;
// Defense against a malformed/runaway argument payload.
const MAX_ARGS_BYTES = 50_000;
// Per-scope concurrency cap (in-flight counter, not a queue).
const MAX_CONCURRENT_CALLS = 5;

export interface VantageMcpTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface McpScope {
  client: Client | null;
  connecting: Promise<Client> | null;
  tools: VantageMcpTool[];
  nameMap: Map<string, string>; // gemini alias -> real tool name
  inFlight: number;
}

const scopes = new Map<string, McpScope>();

function scopeFor(agentKey: string): McpScope {
  let scope = scopes.get(agentKey);
  if (!scope) {
    scope = { client: null, connecting: null, tools: [], nameMap: new Map(), inFlight: 0 };
    scopes.set(agentKey, scope);
  }
  return scope;
}

/** Vantage tool names -> Gemini function names (dots/slashes sanitized). */
export function toGeminiFunctionName(vantageToolName: string): string {
  return `vantage__${vantageToolName}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

async function connect(agentKey: string): Promise<Client> {
  const scope = scopeFor(agentKey);
  if (scope.client) return scope.client;
  if (scope.connecting) return scope.connecting;

  scope.connecting = (async () => {
    if (!agentKey) {
      throw new Error('no Vantage X-Agent-Key for this connection -- cannot authenticate to Vantage MCP');
    }
    const transport = new StreamableHTTPClientTransport(new URL(VANTAGE_MCP_URL), {
      requestInit: { headers: { 'X-Agent-Key': agentKey } },
    });
    const c = new Client({ name: 'vantage-voice', version: '1.0.0' }, { capabilities: {} });
    await c.connect(transport);
    scope.client = c;
    console.log(`[VantageMCP] connected scope for key ...${agentKey.slice(-4)} (${scopes.size} scopes)`);
    return c;
  })();

  try {
    return await scope.connecting;
  } finally {
    scope.connecting = null;
  }
}

/** Discover Vantage's real tool list for one key. Failures log, never throw. */
export async function initVantageMcpFor(agentKey: string): Promise<VantageMcpTool[]> {
  const scope = scopeFor(agentKey);
  try {
    const c = await connect(agentKey);
    const result = await c.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
    scope.tools = result.tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
    }));
    scope.nameMap.clear();
    for (const t of scope.tools) scope.nameMap.set(toGeminiFunctionName(t.name), t.name);
    console.log(`[VantageMCP] key ...${agentKey.slice(-4)}: discovered ${scope.tools.length} tools`);
    return scope.tools;
  } catch (err: any) {
    console.warn(`[VantageMCP] discovery failed for key ...${agentKey.slice(-4)}:`, err?.message || err);
    scope.tools = [];
    return [];
  }
}

export function getToolsFor(agentKey: string): VantageMcpTool[] {
  return scopeFor(agentKey).tools;
}

export function isVantageToolNameFor(agentKey: string, geminiFunctionName: string): boolean {
  return scopeFor(agentKey).nameMap.has(geminiFunctionName);
}

export function disconnectScope(agentKey: string): void {
  const scope = scopes.get(agentKey);
  if (!scope) return;
  scope.client?.close().catch(() => {});
  scopes.delete(agentKey);
}

// ── money-moving gate (per scope, name-map aware) ──────────────────────────

const MONEY_MOVING = [
  /order/i, /trade/i, /trading/i, /wallet/i, /execute/i,
  /withdraw/i, /transfer/i, /swap/i, /buy/i, /sell/i, /sign/i,
];
const READ_ONLY_VERBS = /^(get|list|read|show|fetch|search|status)/i;

export function isMoneyMovingVantageToolFor(agentKey: string, geminiFunctionName: string): boolean {
  const real = scopeFor(agentKey).nameMap.get(geminiFunctionName);
  if (!real) return false;
  if (READ_ONLY_VERBS.test(real)) return false;
  return MONEY_MOVING.some((p) => p.test(real));
}

// ── schema -> Gemini declarations (per key) ────────────────────────────────

function mapSchemaType(jsonType: string | undefined): Type {
  switch (jsonType) {
    case 'integer': case 'number': return Type.NUMBER;
    case 'boolean': return Type.BOOLEAN;
    case 'object': return Type.OBJECT;
    case 'array': return Type.ARRAY;
    default: return Type.STRING;
  }
}

function convertProperties(schema: any): Record<string, any> {
  const props = schema?.properties || {};
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries<any>(props)) {
    const type = mapSchemaType(val?.type);
    const converted: any = { type, description: val?.description || val?.title || key };
    if (type === Type.ARRAY) {
      converted.items = val?.items
        ? { type: mapSchemaType(val.items.type), description: val.items.description || '' }
        : { type: Type.STRING };
    }
    out[key] = converted;
  }
  return out;
}

export function buildDeclarationsFor(agentKey: string): FunctionDeclaration[] {
  return scopeFor(agentKey).tools.map((t) => {
    const properties = convertProperties(t.inputSchema);
    const required = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
    return {
      name: toGeminiFunctionName(t.name),
      description: `[Vantage] ${t.description}`.slice(0, 1000),
      parameters: { type: Type.OBJECT, properties, required },
    } as FunctionDeclaration;
  });
}

/** Execute one Vantage tool for one key. Real result or a real error. */
export async function callVantageToolFor(
  agentKey: string,
  geminiFunctionName: string,
  args: Record<string, any>,
): Promise<any> {
  const scope = scopeFor(agentKey);
  const realName = scope.nameMap.get(geminiFunctionName);
  if (!realName) throw new Error(`Unknown Vantage MCP tool: ${geminiFunctionName}`);
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Tool arguments must be a plain object');
  }
  if (JSON.stringify(args).length > MAX_ARGS_BYTES) {
    throw new Error(`Tool arguments too large (max ${MAX_ARGS_BYTES} bytes)`);
  }
  if (scope.inFlight >= MAX_CONCURRENT_CALLS) {
    throw new Error(`Vantage MCP is busy (${scope.inFlight} calls already in flight)`);
  }

  const attempt = async () => {
    const c = await connect(agentKey);
    return c.callTool({ name: realName, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  };

  scope.inFlight++;
  let result;
  try {
    try {
      result = await attempt();
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isRetryable = /session|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(msg);
      if (isRetryable) {
        console.warn(`[VantageMCP] retryable error, reconnecting scope and retrying once ('${realName}'):`, msg);
        scope.client = null;
        await new Promise((r) => setTimeout(r, 300));
        result = await attempt();
      } else {
        throw err;
      }
    }
  } finally {
    scope.inFlight--;
  }

  if (result.isError) {
    const errText = Array.isArray(result.content)
      ? result.content.map((c: any) => c.text || '').join('\n')
      : String(result.content);
    throw new Error(`Vantage tool '${realName}' returned an error: ${errText}`);
  }
  return result.content;
}

// ── legacy single-key surface (delegates to DEFAULT_AGENT_KEY) ─────────────

export async function initVantageMcp(): Promise<VantageMcpTool[]> {
  return initVantageMcpFor(DEFAULT_AGENT_KEY);
}
export function getDiscoveredTools(): VantageMcpTool[] {
  return getToolsFor(DEFAULT_AGENT_KEY);
}
export function isVantageToolName(geminiFunctionName: string): boolean {
  return isVantageToolNameFor(DEFAULT_AGENT_KEY, geminiFunctionName);
}
export function buildGeminiDeclarationsForVantageTools(): FunctionDeclaration[] {
  return buildDeclarationsFor(DEFAULT_AGENT_KEY);
}
export function callVantageTool(geminiFunctionName: string, args: Record<string, any>): Promise<any> {
  return callVantageToolFor(DEFAULT_AGENT_KEY, geminiFunctionName, args);
}
export function isMoneyMovingVantageTool(geminiFunctionName: string): boolean {
  return isMoneyMovingVantageToolFor(DEFAULT_AGENT_KEY, geminiFunctionName);
}

/** Test seam. */
export function __setNameMapForTests(map: Map<string, string>): void {
  const scope = scopeFor(DEFAULT_AGENT_KEY);
  scope.nameMap.clear();
  for (const [alias, real] of map) scope.nameMap.set(alias, real);
}
