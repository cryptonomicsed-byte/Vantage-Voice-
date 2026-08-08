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
    const result = await c.listTools();
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
    out[key] = {
      type: mapSchemaType(val?.type),
      description: val?.description || val?.title || key,
    };
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
 */
export async function callVantageTool(geminiFunctionName: string, args: Record<string, any>): Promise<any> {
  const realName = nameMap.get(geminiFunctionName);
  if (!realName) {
    throw new Error(`Unknown Vantage MCP tool: ${geminiFunctionName}`);
  }
  const c = await connect();
  const result = await c.callTool({ name: realName, arguments: args });
  if (result.isError) {
    const errText = Array.isArray(result.content)
      ? result.content.map((c: any) => c.text || '').join('\n')
      : String(result.content);
    throw new Error(`Vantage tool '${realName}' returned an error: ${errText}`);
  }
  return result.content;
}
