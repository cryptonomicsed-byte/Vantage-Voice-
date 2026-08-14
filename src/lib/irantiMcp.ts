/**
 * Real MCP client connecting this voice agent to Ìrántí -- the sovereign
 * agent-memory mesh at /Users/bino/iranti. Unlike Vantage's own MCP server
 * (a remote HTTP endpoint, see vantageMcp.ts), Ìrántí only exposes its full
 * 13-tool surface over stdio (it spawns the real `iranti` Rust CLI per
 * call) -- its HTTP daemon on 127.0.0.1:38400 only implements `status` and
 * grant-checked `a2a_recall`, not write/grant/revoke/birth/dream/echo. So
 * this connects over stdio, spawning the real iranti-mcp Node process
 * (mcp/dist/index.js in that repo), which in turn shells out to the real
 * `iranti` binary -- same "wrap a real local process" shape as
 * herdrSwarm.ts, not a simulated or hosted connection.
 *
 * This only works on a host where the Ìrántí repo + built binary actually
 * exist (this Mac, right now) -- IRANTI_MCP_CMD/IRANTI_MCP_CWD are
 * env-overridable so a future Contabo deployment (real binary + store
 * copied/rebuilt there) is a config change, not a code change.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';

const IRANTI_MCP_CMD = process.env.IRANTI_MCP_CMD || 'node';
const IRANTI_MCP_ARGS = process.env.IRANTI_MCP_ARGS
  ? process.env.IRANTI_MCP_ARGS.split(' ')
  : ['dist/index.js'];
const IRANTI_MCP_CWD = process.env.IRANTI_MCP_CWD || '/Users/bino/iranti/mcp';
const CALL_TIMEOUT_MS = 20_000;
const MAX_ARGS_BYTES = 50_000;

export interface IrantiMcpTool {
  name: string;
  description: string;
  inputSchema: any;
}

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
let discoveredTools: IrantiMcpTool[] = [];
const nameMap = new Map<string, string>(); // gemini name -> real iranti tool name

export function toGeminiFunctionName(irantiToolName: string): string {
  return `iranti__${irantiToolName}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
}

async function connect(): Promise<Client> {
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const transport = new StdioClientTransport({
      command: IRANTI_MCP_CMD,
      args: IRANTI_MCP_ARGS,
      cwd: IRANTI_MCP_CWD,
      stderr: 'pipe',
    });
    const c = new Client({ name: 'vantage-voice', version: '1.0.0' }, { capabilities: {} });
    await c.connect(transport);
    client = c;
    console.log(`[IrantiMCP] connected (stdio) to ${IRANTI_MCP_CMD} ${IRANTI_MCP_ARGS.join(' ')} in ${IRANTI_MCP_CWD}`);
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Connects and discovers Ìrántí's real tool list. Called once at server
 * startup; failures are logged, not thrown, so a missing local Ìrántí
 * install (e.g. on a host that isn't this Mac) degrades this feature
 * instead of crashing the whole voice server.
 */
export async function initIrantiMcp(): Promise<IrantiMcpTool[]> {
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
    console.log(`[IrantiMCP] discovered ${discoveredTools.length} real tools from Ìrántí`);
    return discoveredTools;
  } catch (err: any) {
    console.warn('[IrantiMCP] discovery failed (voice will run without Ìrántí memory tools):', err?.message || err);
    discoveredTools = [];
    return [];
  }
}

export function getDiscoveredIrantiTools(): IrantiMcpTool[] {
  return discoveredTools;
}

export function isIrantiToolName(geminiFunctionName: string): boolean {
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
    // Same fix as vantageMcp.ts/composioMcp.ts -- Gemini Live rejects the
    // ENTIRE session setup if any ARRAY property lacks `items` (real,
    // live-confirmed bug earlier this session). Ìrántí's memory_echo tool
    // has an `agents` array param, so this matters here too, not just
    // defensively.
    if (type === Type.ARRAY) {
      converted.items = val?.items
        ? { type: mapSchemaType(val.items.type), description: val.items.description || '' }
        : { type: Type.STRING };
    }
    out[key] = converted;
  }
  return out;
}

export function buildGeminiDeclarationsForIrantiTools(): FunctionDeclaration[] {
  return discoveredTools.map((t) => {
    const properties = convertProperties(t.inputSchema);
    const required = Array.isArray(t.inputSchema?.required) ? t.inputSchema.required : [];
    return {
      name: toGeminiFunctionName(t.name),
      description: `[Ìrántí memory] ${t.description}`.slice(0, 1000),
      parameters: {
        type: Type.OBJECT,
        properties,
        required,
      },
    } as FunctionDeclaration;
  });
}

export async function callIrantiTool(geminiFunctionName: string, args: Record<string, any>): Promise<any> {
  const realName = nameMap.get(geminiFunctionName);
  if (!realName) {
    throw new Error(`Unknown Ìrántí MCP tool: ${geminiFunctionName}`);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Tool arguments must be a plain object');
  }
  const argsSize = JSON.stringify(args).length;
  if (argsSize > MAX_ARGS_BYTES) {
    throw new Error(`Tool arguments too large (${argsSize} bytes, max ${MAX_ARGS_BYTES})`);
  }

  const c = await connect();
  const result = await c.callTool({ name: realName, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });

  if (result.isError) {
    const errText = Array.isArray(result.content)
      ? result.content.map((c: any) => c.text || '').join('\n')
      : String(result.content);
    throw new Error(`Ìrántí tool '${realName}' returned an error: ${errText}`);
  }
  return result.content;
}
