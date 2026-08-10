/**
 * Real MCP client connecting this voice agent to Composio's per-user Tool
 * Router MCP server -- the same real OAuth connections made in the OAuth
 * Integrations modal (Gmail, GitHub, Outlook, Discord, Slack, GitLab,
 * Notion, Dropbox) become real, callable tools here. No simulated tool
 * results: an unconnected toolkit returns Composio's real "not connected"
 * error, not a fabricated success.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';
import { getComposioMcpSession, isComposioConfigured } from './composioOAuth.js';

export interface ComposioMcpTool {
  name: string;
  description: string;
  inputSchema: any;
}

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let discoveredTools: ComposioMcpTool[] = [];
const nameMap = new Map<string, string>(); // gemini name -> real composio tool name

// Same hardening rationale as vantageMcp.ts: a voice turn shouldn't hang
// on a slow/dead remote MCP server, a runaway argument payload shouldn't
// reach Composio, and calls shouldn't pile up unbounded if several fire
// in quick succession (e.g. from multi-agent orchestration).
const CALL_TIMEOUT_MS = 20_000;
const MAX_ARGS_BYTES = 50_000;
const MAX_CONCURRENT_CALLS = 5;
let inFlightCalls = 0;

export function toGeminiFunctionName(composioToolName: string): string {
  return `composio__${composioToolName}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

async function connect(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    // Composio mints a brand-new tool-router session URL on every
    // create() call -- fetch it once here and reuse the same MCP
    // connection for the process lifetime, same pattern as Vantage's
    // client but with a dynamically-issued endpoint instead of a fixed one.
    const { url, headers } = await getComposioMcpSession();
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers },
    });
    const c = new Client({ name: 'vantage-voice', version: '1.0.0' }, { capabilities: {} });
    await c.connect(transport);
    client = c;
    console.log(`[ComposioMCP] connected to ${url}`);
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Connects and (re)discovers Composio's real tool list. Safe to call
 * repeatedly -- called at startup and again after any OAuth connect
 * completes, since a newly-connected toolkit's tools weren't visible
 * before. Failures are logged, not thrown, so a Composio outage degrades
 * this feature instead of crashing the whole voice server.
 */
export async function initComposioMcp(): Promise<ComposioMcpTool[]> {
  if (!isComposioConfigured()) {
    discoveredTools = [];
    return [];
  }
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
    console.log(`[ComposioMCP] discovered ${discoveredTools.length} real tools from connected toolkits`);
    return discoveredTools;
  } catch (err: any) {
    console.warn('[ComposioMCP] discovery failed (voice will run without live Composio tools):', err?.message || err);
    discoveredTools = [];
    return [];
  }
}

export function getDiscoveredComposioTools(): ComposioMcpTool[] {
  return discoveredTools;
}

export function isComposioToolName(geminiFunctionName: string): boolean {
  return nameMap.has(geminiFunctionName);
}

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
    // Gemini's Live API rejects the WHOLE session setup if any ARRAY
    // property lacks `items` -- this is what was actually killing every
    // native-framework session (1007 "properties[tool_slugs].items:
    // missing field", tool_slugs being a real Composio search param).
    // Same fix as vantageMcp.ts's convertProperties -- default to STRING
    // items when Composio's own schema omits them.
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
 * Builds real Gemini FunctionDeclarations from Composio's real discovered
 * tools -- Tool Router's meta-tool set (COMPOSIO_SEARCH_TOOLS,
 * COMPOSIO_EXECUTE_TOOL, etc.) rather than one declaration per toolkit
 * action, since the router keeps the catalog small regardless of how
 * many toolkits are connected.
 */
export function buildGeminiDeclarationsForComposioTools(): FunctionDeclaration[] {
  return discoveredTools.map((t) => {
    const properties = convertProperties(t.inputSchema);
    const required = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
    return {
      name: toGeminiFunctionName(t.name),
      description: `[Composio connector] ${t.description}`.slice(0, 1000),
      parameters: {
        type: Type.OBJECT,
        properties,
        required,
      },
    } as FunctionDeclaration;
  });
}

/**
 * Executes a real Composio tool call by its Gemini-declared name. Returns
 * the real result (or throws with Composio's real error, e.g. "toolkit
 * not connected") -- never a fabricated success.
 */
export async function callComposioTool(geminiFunctionName: string, args: Record<string, any>): Promise<any> {
  const realName = nameMap.get(geminiFunctionName);
  if (!realName) {
    throw new Error(`Unknown Composio tool: ${geminiFunctionName}`);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Tool arguments must be a plain object');
  }
  const argsSize = JSON.stringify(args).length;
  if (argsSize > MAX_ARGS_BYTES) {
    throw new Error(`Tool arguments too large (${argsSize} bytes, max ${MAX_ARGS_BYTES})`);
  }
  if (inFlightCalls >= MAX_CONCURRENT_CALLS) {
    throw new Error(`Composio MCP is busy (${inFlightCalls} calls already in flight) -- try again in a moment`);
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
      const isRetryable = /session|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(msg);
      if (isRetryable) {
        console.warn(`[ComposioMCP] retryable error, reconnecting and retrying once ('${realName}'):`, msg);
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
    throw new Error(`Composio tool '${realName}' returned an error: ${errText}`);
  }
  return result.content;
}
