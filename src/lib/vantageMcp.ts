/**
 * Real MCP client connecting this voice agent to Vantage's live MCP server.
 *
 * Vantage exposes ~500+ real endpoints (trading, wallet, buzz, jobs, etc.)
 * as MCP tools via fastapi-mcp (see /opt/ares/Vantage/backend/mcp_server.py
 * on the Vantage side). This module connects to that server for real,
 * discovers its real tool list at startup, and executes real tool calls --
 * replacing the previous hardcoded template-string "MCP" stubs in
 * server.ts entirely.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';

const VANTAGE_MCP_URL = process.env.VANTAGE_MCP_URL || 'https://omokoda.duckdns.org/mcp';
const VANTAGE_AGENT_KEY = process.env.VANTAGE_AGENT_KEY || '';
// A voice turn shouldn't hang on the MCP SDK's 60s default -- fail fast
// enough that the caller can speak a real error instead of the user
// sitting in silence.
const CALL_TIMEOUT_MS = 20_000;
// Defense against a malformed/runaway argument payload (e.g. the model
// looping garbage into a tool call) -- reject before it ever reaches
// Vantage rather than sending an oversized request.
const MAX_ARGS_BYTES = 50_000;
// Real concurrency cap: this module holds one MCP connection for the
// whole process; without a cap, multi-agent orchestration or several
// rapid tool calls could pile up requests faster than Vantage answers
// them. Simple in-flight counter, not a queue -- excess calls fail fast
// with a real "busy" error rather than silently stacking up.
const MAX_CONCURRENT_CALLS = 5;
let inFlightCalls = 0;

export interface VantageMcpTool {
  name: string;
  description: string;
  inputSchema: any;
}

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let discoveredTools: VantageMcpTool[] = [];

/**
 * Real Vantage tool names collide with Gemini's function-name character
 * rules in a few places (dots, slashes) and can be long -- prefix + sanitize
 * so every declared function name is stable and unambiguous.
 */
export function toGeminiFunctionName(vantageToolName: string): string {
  return `vantage__${vantageToolName}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

const nameMap = new Map<string, string>(); // gemini name -> real vantage tool name

async function connect(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    if (!VANTAGE_AGENT_KEY) {
      throw new Error('VANTAGE_AGENT_KEY is not set -- cannot authenticate to Vantage MCP server');
    }
    const transport = new StreamableHTTPClientTransport(new URL(VANTAGE_MCP_URL), {
      requestInit: {
        headers: { 'X-Agent-Key': VANTAGE_AGENT_KEY },
      },
    });
    const c = new Client({ name: 'vantage-voice', version: '1.0.0' }, { capabilities: {} });
    await c.connect(transport);
    client = c;
    console.log(`[VantageMCP] connected to ${VANTAGE_MCP_URL}`);
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Connects and discovers Vantage's real tool list. Called once at server
 * startup; failures are logged, not thrown, so a Vantage outage degrades
 * this feature instead of crashing the whole voice server.
 */
export async function initVantageMcp(): Promise<VantageMcpTool[]> {
  try {
    const c = await connect();
    const result = await c.listTools(undefined, { timeout: CALL_TIMEOUT_MS });
    discoveredTools = result.tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
    }));
    nameMap.clear();
    for (const t of discoveredTools) {
      nameMap.set(toGeminiFunctionName(t.name), t.name);
    }
    console.log(`[VantageMCP] discovered ${discoveredTools.length} real tools from Vantage`);
    return discoveredTools;
  } catch (err: any) {
    console.warn('[VantageMCP] discovery failed (voice will run without live Vantage tools):', err?.message || err);
    discoveredTools = [];
    return [];
  }
}

export function getDiscoveredTools(): VantageMcpTool[] {
  return discoveredTools;
}

export function isVantageToolName(geminiFunctionName: string): boolean {
  return nameMap.has(geminiFunctionName);
}

/** Best-effort JSON Schema -> Gemini Type mapping for the handful of shapes fastapi-mcp actually emits. */
function mapSchemaType(jsonType: string | undefined): Type {
  switch (jsonType) {
    case 'integer':
    case 'number':
      return Type.NUMBER;
    case 'boolean':
      return Type.BOOLEAN;
    case 'object':
      return Type.OBJECT;
    case 'array':
      return Type.ARRAY;
    default:
      return Type.STRING;
  }
}

function convertProperties(schema: any): Record<string, any> {
  const props = schema?.properties || {};
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries<any>(props)) {
    const type = mapSchemaType(val?.type);
    const converted: any = {
      type,
      description: val?.description || val?.title || key,
    };
    // Gemini's Live API rejects the ENTIRE session setup (all tools, not
    // just this one) if any ARRAY property lacks `items` -- found live via
    // real "processing conversation turn" hangs: the WS session was
    // actually being killed at connect time with a 1007 schema error
    // ("properties[tool_slugs].items: missing field") from a real Vantage
    // tool's array param, so no turn -- not even the first one -- could
    // ever complete. Real Vantage/fastapi-mcp array schemas sometimes omit
    // `items` too (e.g. an untyped List[str]), so default to STRING items
    // rather than dropping the property or crashing the declaration build.
    if (type === Type.ARRAY) {
      converted.items = val?.items
        ? { type: mapSchemaType(val.items.type), description: val.items.description || '' }
        : { type: Type.STRING };
    }
    out[key] = converted;
  }
  return out;
}

/**
 * Builds real Gemini FunctionDeclarations from Vantage's real discovered
 * MCP tools -- these get merged into server.ts's `liveTools` alongside the
 * (still-present) generic/demo tools, so the model can call real Vantage
 * capabilities directly by name instead of through an indirect meta-tool.
 */
export function buildGeminiDeclarationsForVantageTools(): FunctionDeclaration[] {
  return discoveredTools.map((t) => {
    const properties = convertProperties(t.inputSchema);
    const required = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
    return {
      name: toGeminiFunctionName(t.name),
      description: `[Vantage] ${t.description}`.slice(0, 1000),
      parameters: {
        type: Type.OBJECT,
        properties,
        required,
      },
    } as FunctionDeclaration;
  });
}

/**
 * Executes a real Vantage MCP tool call by its Gemini-declared name.
 * Returns the real tool result content (or throws with a real error
 * message) -- no template strings, no simulated success.
 *
 * If Vantage's own backend restarts, the streamable-HTTP session this
 * client was holding becomes invalid server-side ("No valid session ID
 * provided") even though the client object itself still looks connected
 * -- found live during a real audit of this path. Detected here and
 * retried once with a fresh connection rather than failing until the
 * whole voice server is manually restarted.
 */
export async function callVantageTool(geminiFunctionName: string, args: Record<string, any>): Promise<any> {
  const realName = nameMap.get(geminiFunctionName);
  if (!realName) {
    throw new Error(`Unknown Vantage MCP tool: ${geminiFunctionName}`);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Tool arguments must be a plain object');
  }
  const argsSize = JSON.stringify(args).length;
  if (argsSize > MAX_ARGS_BYTES) {
    throw new Error(`Tool arguments too large (${argsSize} bytes, max ${MAX_ARGS_BYTES})`);
  }

  if (inFlightCalls >= MAX_CONCURRENT_CALLS) {
    throw new Error(`Vantage MCP is busy (${inFlightCalls} calls already in flight) -- try again in a moment`);
  }

  const attempt = async () => {
    const c = await connect();
    return c.callTool({ name: realName, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  };

  inFlightCalls++;
  let result;
  try {
    try {
      result = await attempt();
    } catch (err: any) {
      const msg = err?.message || String(err);
      // Retry once for a stale session (server restarted -- see prior
      // fix) or a transient network blip. Anything else (a real tool
      // error, a real 4xx) is not worth retrying and surfaces immediately.
      const isRetryable = /session|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(msg);
      if (isRetryable) {
        console.warn(`[VantageMCP] retryable error, reconnecting and retrying once ('${realName}'):`, msg);
        client = null;
        await new Promise((r) => setTimeout(r, 300));
        result = await attempt();
      } else {
        throw err;
      }
    }
  } finally {
    inFlightCalls--;
  }

  if (result.isError) {
    const errText = Array.isArray(result.content)
      ? result.content.map((c: any) => c.text || '').join('\n')
      : String(result.content);
    throw new Error(`Vantage tool '${realName}' returned an error: ${errText}`);
  }
  return result.content;
}
