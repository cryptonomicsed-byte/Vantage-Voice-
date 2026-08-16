/**
 * Real MCP server exposing this app's own PIN-gated owner-control tools
 * (env var / secret management, live settings, memory vault) to an
 * external agent -- specifically the Hermes gateway session that now
 * drives the voice loop (see callHermesGatewaySession in server.ts).
 *
 * Previously these tools only existed as Gemini function declarations
 * called from inside this same process (server.ts ~line 300-1400). That
 * meant an agent brain running OUTSIDE this process (Hermes, via the
 * gateway) had no way to manage app secrets or write to the shared memory
 * vault. This mounts an actual MCP server (streamable HTTP transport, the
 * same protocol Vantage's own MCP server uses) on this app's Express
 * instance so Hermes can register it as an mcp_servers entry and call it
 * like any other tool -- same PIN check, same masked secrets, same
 * managed-key allowlist as the in-process Gemini tools.
 */
import type { Express, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { verifyOwnerPin } from './ownerPin.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

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
// Same rule as server.ts's in-process tools: the owner PIN itself is never
// readable, writable, or clearable through this surface.

const VOICE_OWNER_MCP_KEY = process.env.VOICE_OWNER_MCP_KEY || '';

interface MemoryVaultItem {
  id: string;
  key: string;
  value: string;
  category: string;
  tier: 'secure' | 'personal' | 'regular';
  tags: string[];
  updatedAt: string;
}

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

function checkPin(pin: string): { ok: boolean; message?: string } {
  // Shares one gate with the voice tool path (ownerPin.ts): constant-time
  // compare, escalating lockout, audit log. Sharing matters -- two independent
  // counters would let an attacker alternate surfaces to double their budget.
  const result = verifyOwnerPin(pin, 'owner_mcp');
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'vantage-voice-owner', version: '1.0.0' });

  server.registerTool(
    'list_memory',
    {
      description: 'List everything stored in this voice app\'s persistent memory vault (owner PIN required).',
      inputSchema: { pin: z.string().describe('Owner voice PIN') },
    },
    async ({ pin }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      const items = loadMemoryVault();
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    }
  );

  server.registerTool(
    'remember',
    {
      description: 'Save or update a fact in this voice app\'s persistent memory vault (owner PIN required).',
      inputSchema: {
        pin: z.string().describe('Owner voice PIN'),
        key: z.string().describe('Short label for this memory, e.g. "client_call_preference"'),
        value: z.string().describe('The fact to remember'),
        category: z.string().optional().describe('Free-form grouping, e.g. "clients", "preferences"'),
        tier: z.enum(['secure', 'personal', 'regular']).optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ pin, key, value, category, tier, tags }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      const items = loadMemoryVault();
      const existingIdx = items.findIndex((i) => i.key === key);
      const item: MemoryVaultItem = {
        id: existingIdx >= 0 ? items[existingIdx].id : randomUUID(),
        key,
        value,
        category: category || 'general',
        tier: tier || 'regular',
        tags: tags || [],
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) items[existingIdx] = item;
      else items.push(item);
      saveMemoryVault(items);
      return { content: [{ type: 'text', text: `Remembered "${key}".` }] };
    }
  );

  server.registerTool(
    'recall',
    {
      description: 'Recall a specific fact from this voice app\'s persistent memory vault by key (owner PIN required).',
      inputSchema: { pin: z.string(), key: z.string() },
    },
    async ({ pin, key }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      const items = loadMemoryVault();
      const item = items.find((i) => i.key === key);
      return { content: [{ type: 'text', text: item ? JSON.stringify(item, null, 2) : `No memory found for "${key}".` }] };
    }
  );

  server.registerTool(
    'forget',
    {
      description: 'Delete a fact from this voice app\'s persistent memory vault (owner PIN required).',
      inputSchema: { pin: z.string(), key: z.string() },
    },
    async ({ pin, key }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      const items = loadMemoryVault();
      const next = items.filter((i) => i.key !== key);
      saveMemoryVault(next);
      return { content: [{ type: 'text', text: next.length < items.length ? `Forgot "${key}".` : `No memory found for "${key}".` }] };
    }
  );

  server.registerTool(
    'get_app_secret_status',
    {
      description: 'List this voice app\'s managed secrets/settings with masked values (owner PIN required).',
      inputSchema: { pin: z.string() },
    },
    async ({ pin }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      const status = MANAGED_ENV_KEYS.map((k) => ({ key: k, value: maskSecret(process.env[k] || '') }));
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }
  );

  server.registerTool(
    'set_app_secret',
    {
      description: 'Set one of this voice app\'s managed secrets/settings (owner PIN required, restart may be needed for some keys).',
      inputSchema: { pin: z.string(), key: z.string(), value: z.string() },
    },
    async ({ pin, key, value }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      if (!MANAGED_ENV_KEYS.includes(key)) {
        return { content: [{ type: 'text', text: `"${key}" is not a managed key. Managed keys: ${MANAGED_ENV_KEYS.join(', ')}` }], isError: true };
      }
      setEnvVar(key, value);
      return { content: [{ type: 'text', text: `Set ${key} = ${maskSecret(value)}.` }] };
    }
  );

  server.registerTool(
    'remove_app_secret',
    {
      description: 'Remove one of this voice app\'s managed secrets/settings (owner PIN required).',
      inputSchema: { pin: z.string(), key: z.string() },
    },
    async ({ pin, key }) => {
      const check = checkPin(pin);
      if (!check.ok) return { content: [{ type: 'text', text: check.message! }], isError: true };
      if (!MANAGED_ENV_KEYS.includes(key)) {
        return { content: [{ type: 'text', text: `"${key}" is not a managed key.` }], isError: true };
      }
      removeEnvVar(key);
      return { content: [{ type: 'text', text: `Removed ${key}.` }] };
    }
  );

  return server;
}

/**
 * Mounts the owner MCP server at POST/GET/DELETE /mcp/voice-owner on the
 * given Express app, stateless per the SDK's streamable HTTP transport
 * (no session persistence needed -- every tool call carries its own PIN).
 * Optional bearer-token gate (VOICE_OWNER_MCP_KEY) sits in front of the
 * PIN check as a second, coarser layer since this endpoint is reachable
 * wherever the app itself is reachable.
 */
export function mountVoiceOwnerMcp(app: Express) {
  app.all('/mcp/voice-owner', async (req: Request, res: Response) => {
    if (VOICE_OWNER_MCP_KEY) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${VOICE_OWNER_MCP_KEY}`) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
    }
    try {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error('[VoiceOwnerMCP] request failed:', err?.message || err);
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
    }
  });
  console.log('[VoiceOwnerMCP] mounted at /mcp/voice-owner');
}
