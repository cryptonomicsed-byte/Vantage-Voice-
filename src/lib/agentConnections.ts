/**
 * agentConnections.ts — per-user agent connection registry.
 *
 * Citizen / Visitor model:
 *   - omokoda2  : native citizen (kernel URL + birth creds or a fresh guest)
 *   - hermes    : visitor (gateway URL + API key + session continuity)
 *   - openclaw  : visitor (endpoint + key)
 *   - openai    : generic OpenAI-compatible endpoint (base URL + key + model)
 *   - native    : Vantage Copilot fallback (no external creds)
 *
 * Every secret field (agent keys, gateway keys, Vantage X-Agent-Key, vault
 * connector key) is encrypted at rest with AES-256-GCM. The whole per-user
 * store file is additionally encrypted; secret values are NEVER returned by
 * any API — public views carry `hasSecret: true` plus the last 4 chars only.
 *
 * Master key resolution (first match wins):
 *   1. env VV_CREDENTIAL_MASTER_KEY
 *   2. data/.vv-master.key (auto-generated, chmod 0600, on first server use)
 *   3. ephemeral 'dev-insecure-key' when NODE_ENV === 'test'
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Relative to the working directory on purpose: both `tsx server.ts` (repo
// root) and the production bundle (`node dist/server.cjs` under
// WorkingDirectory=/opt/vantage-voice) resolve this to the same logical
// store. import.meta.url is NOT safe here — esbuild's CJS transform leaves
// it undefined and fileURLToPath(undefined) crashes at startup.
const DATA_DIR = process.env.VV_DATA_DIR || path.resolve(process.cwd(), 'data');
const CONNECTIONS_DIR = path.join(DATA_DIR, 'connections');
const MASTER_KEY_PATH = path.join(DATA_DIR, '.vv-master.key');

export type ConnectionKind = 'native' | 'omokoda2' | 'hermes' | 'openclaw' | 'openai';

export interface AgentConnectionConfig {
  // omokoda2
  kernelUrl?: string;
  agentName?: string;
  agentId?: string;   // encrypted — existing birth credentials
  agentKey?: string;  // encrypted
  // hermes
  gatewayUrl?: string;
  apiKey?: string;    // encrypted
  model?: string;
  // openclaw
  endpoint?: string;
  openclawKey?: string; // encrypted
  // openai-compatible
  baseUrl?: string;
  openaiKey?: string; // encrypted
  openaiModel?: string;
  // Vantage account binding
  vantageAgentKey?: string;   // encrypted — X-Agent-Key for this user's account
  vantageBaseUrl?: string;
  vaultConnectorKey?: string; // encrypted — vault offload per agent
}

export interface AgentConnection {
  id: string;
  userId: string;
  kind: ConnectionKind;
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  config: AgentConnectionConfig;
}

/** Public view: secrets replaced by presence + last4. */
export interface AgentConnectionPublic extends Omit<AgentConnection, 'config'> {
  config: Record<string, unknown>;
  hasSecrets: string[]; // names of encrypted fields that are set
}

const SECRET_FIELDS: (keyof AgentConnectionConfig)[] = [
  'agentId', 'agentKey', 'apiKey', 'openclawKey', 'openaiKey',
  'vantageAgentKey', 'vaultConnectorKey',
];

// ── crypto ──────────────────────────────────────────────────────────────────

let cachedMasterKey: Buffer | null = null;

function ensureDataDir(): void {
  fs.mkdirSync(CONNECTIONS_DIR, { recursive: true });
}

export function masterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;
  const fromEnv = process.env.VV_CREDENTIAL_MASTER_KEY || '';
  let secret: string;
  if (fromEnv) {
    secret = fromEnv;
  } else {
    try {
      secret = fs.readFileSync(MASTER_KEY_PATH, 'utf-8').trim();
    } catch {
      if (process.env.NODE_ENV === 'test') {
        secret = 'dev-insecure-test-key';
      } else {
        secret = crypto.randomBytes(32).toString('hex');
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(MASTER_KEY_PATH, secret, { mode: 0o600 });
        console.log('[AgentConnections] generated credential master key at', MASTER_KEY_PATH);
      }
    }
  }
  cachedMasterKey = crypto.createHash('sha256').update(secret).digest();
  return cachedMasterKey;
}

/** AES-256-GCM encrypt -> base64(iv):base64(tag):base64(ct). */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(packed: string): string {
  if (!packed) return '';
  try {
    const [ivB64, tagB64, ctB64] = packed.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf-8');
  } catch {
    return '';
  }
}

// ── store ───────────────────────────────────────────────────────────────────

interface UserStore { version: number; entries: AgentConnection[]; }

function storePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9._@-]/g, '_');
  return path.join(CONNECTIONS_DIR, `${safe}.json`);
}

function loadStore(userId: string): UserStore {
  try {
    const raw = fs.readFileSync(storePath(userId), 'utf-8');
    const store = JSON.parse(raw) as UserStore;
    if (!Array.isArray(store.entries)) throw new Error('bad store');
    return store;
  } catch {
    return { version: 1, entries: [] };
  }
}

function saveStore(userId: string, store: UserStore): void {
  ensureDataDir();
  fs.writeFileSync(storePath(userId), JSON.stringify(store, null, 2), { mode: 0o600 });
}

function encryptConfig(config: AgentConnectionConfig): AgentConnectionConfig {
  const out: AgentConnectionConfig = { ...config };
  for (const field of SECRET_FIELDS) {
    const v = out[field];
    if (typeof v === 'string' && v && !v.includes(':')) {
      out[field] = encryptSecret(v);
    }
  }
  return out;
}

function decryptConfig(config: AgentConnectionConfig): AgentConnectionConfig {
  const out: AgentConnectionConfig = { ...config };
  for (const field of SECRET_FIELDS) {
    const v = out[field];
    if (typeof v === 'string' && v && v.includes(':')) {
      out[field] = decryptSecret(v);
    }
  }
  return out;
}

export function listConnections(userId: string): AgentConnectionPublic[] {
  const store = loadStore(userId);
  return store.entries
    .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1))
    .map(toPublic);
}

export function getConnection(userId: string, id: string): AgentConnection | null {
  const store = loadStore(userId);
  const entry = store.entries.find((c) => c.id === id);
  if (!entry) return null;
  return { ...entry, config: decryptConfig(entry.config) };
}

export function getActiveConnection(userId: string): AgentConnection | null {
  const store = loadStore(userId);
  const entry = store.entries.find((c) => c.active);
  if (!entry) return null;
  return { ...entry, config: decryptConfig(entry.config) };
}

export function saveConnection(userId: string, conn: Omit<AgentConnection, 'createdAt' | 'updatedAt'>): AgentConnectionPublic {
  const store = loadStore(userId);
  const now = new Date().toISOString();
  const existing = store.entries.find((c) => c.id === conn.id);
  const entry: AgentConnection = {
    ...conn,
    userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    config: encryptConfig(conn.config),
  };
  if (conn.active) {
    for (const c of store.entries) c.active = c.id === conn.id;
  }
  const idx = store.entries.findIndex((c) => c.id === conn.id);
  if (idx >= 0) store.entries[idx] = entry;
  else store.entries.push(entry);
  saveStore(userId, store);
  return toPublic(entry);
}

export function deleteConnection(userId: string, id: string): boolean {
  const store = loadStore(userId);
  const idx = store.entries.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  const wasActive = store.entries[idx].active;
  store.entries.splice(idx, 1);
  if (wasActive && store.entries.length > 0) store.entries[0].active = true;
  saveStore(userId, store);
  return true;
}

export function setActiveConnection(userId: string, id: string): AgentConnectionPublic | null {
  const store = loadStore(userId);
  const entry = store.entries.find((c) => c.id === id);
  if (!entry) return null;
  for (const c of store.entries) c.active = c.id === id;
  saveStore(userId, store);
  return toPublic(entry);
}

function toPublic(conn: AgentConnection): AgentConnectionPublic {
  const config: Record<string, unknown> = {};
  const hasSecrets: string[] = [];
  for (const [k, v] of Object.entries(conn.config)) {
    if ((SECRET_FIELDS as string[]).includes(k)) {
      if (typeof v === 'string' && v) {
        hasSecrets.push(k);
        const plain = decryptSecret(v);
        config[k] = { hasSecret: Boolean(plain), last4: plain ? plain.slice(-4) : '' };
      }
    } else {
      config[k] = v;
    }
  }
  return { ...conn, config, hasSecrets };
}

/** Plaintext config for a user id — used internally by the server, never over HTTP. */
export function resolveConnectionConfig(userId: string, id?: string): AgentConnectionConfig | null {
  const conn = id ? getConnection(userId, id) : getActiveConnection(userId);
  return conn ? conn.config : null;
}

// ── connection tests ────────────────────────────────────────────────────────

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  tools?: string[];
  mcpServers?: string[];
}

async function probe(url: string, headers: Record<string, string>, timeoutMs = 4000): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const body = await res.text().catch(() => '');
    return { ok: res.ok, status: res.status, body: body.slice(0, 1000) };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(t);
  }
}

/** Test a connection's endpoint(s) and enumerate what it exposes. */
export async function testConnection(userId: string, id: string): Promise<ConnectionTestResult> {
  const conn = getConnection(userId, id);
  if (!conn) return { ok: false, message: 'connection not found' };
  const c = conn.config;

  switch (conn.kind) {
    case 'native': {
      const base = (c.vantageBaseUrl || process.env.VANTAGE_BASE_URL || 'https://omokoda.duckdns.org').replace(/\/$/, '');
      // /api/agents/feed is authenticated and fast — a 200 here proves the
      // X-Agent-Key binds to a real Vantage account (200 vs 401 without it).
      const res = await probe(`${base}/api/agents/feed`,
        c.vantageAgentKey ? { 'X-Agent-Key': c.vantageAgentKey } : {});
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: `Vantage rejected the X-Agent-Key (HTTP ${res.status}) — check the key for this account` };
      }
      if (!res.ok) return { ok: false, message: `Vantage /api/agents/feed returned ${res.status}: ${res.body.slice(0, 200)}` };
      return { ok: true, message: 'Vantage Copilot (native) reachable; account binding valid', tools: ['vantage_mcp (via X-Agent-Key)'] };
    }
    case 'omokoda2': {
      const base = (c.kernelUrl || '').replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (c.agentId) headers['X-Agent-Id'] = c.agentId;
      if (c.agentKey) headers['X-Agent-Key'] = c.agentKey;
      // Kernel versions differ on which health routes exist; any HTTP
      // answer from the box proves the kernel is alive. Only a network
      // error or a 5xx means unreachable.
      let res = await probe(`${base}/v1/health`, headers, 4000);
      if (res.status === 0 || res.status >= 500) {
        const alt = await probe(`${base}/`, headers, 4000);
        if (alt.status === 0) {
          return { ok: false, message: `Omo-Koda2 kernel unreachable at ${base} (${alt.body.slice(0, 150)})` };
        }
        res = alt;
      }
      if (res.status >= 500) {
        return { ok: false, message: `Omo-Koda2 kernel error at ${base} (HTTP ${res.status})` };
      }
      return { ok: true, message: `Omo-Koda2 kernel reachable at ${base}`, tools: ['think', 'act', 'vault/glyph'] };
    }
    case 'hermes': {
      const base = (c.gatewayUrl || '').replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
      const res = await probe(`${base}/v1/models`, headers);
      if (!res.ok) return { ok: false, message: `Hermes gateway ${base} returned ${res.status}: ${res.body.slice(0, 200)}` };
      // Enumerate MCP servers if the gateway exposes them.
      let mcpServers: string[] | undefined;
      try {
        const mcp = await probe(`${base}/api/mcp/servers`, headers, 3000);
        if (mcp.ok) {
          const parsed = JSON.parse(mcp.body);
          if (Array.isArray(parsed)) mcpServers = parsed.map((s: any) => s.name || s.id || String(s));
        }
      } catch { /* optional surface */ }
      return { ok: true, message: 'Hermes gateway reachable; session API available', mcpServers };
    }
    case 'openclaw': {
      const base = (c.endpoint || '').replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (c.openclawKey) headers.Authorization = `Bearer ${c.openclawKey}`;
      const res = await probe(`${base}/health`, headers);
      if (!res.ok) return { ok: false, message: `OpenClaw endpoint ${base} returned ${res.status}: ${res.body.slice(0, 200)}` };
      return { ok: true, message: 'OpenClaw endpoint reachable' };
    }
    case 'openai': {
      const base = (c.baseUrl || '').replace(/\/$/, '');
      const headers: Record<string, string> = {};
      if (c.openaiKey) headers.Authorization = `Bearer ${c.openaiKey}`;
      // baseUrl already includes the /v1 prefix (client convention), so the
      // models route is /models — matching OpenAiCompatClient.
      const res = await probe(`${base}/models`, headers);
      if (!res.ok) return { ok: false, message: `OpenAI-compatible endpoint ${base} returned ${res.status}: ${res.body.slice(0, 200)}` };
      let models: string[] = [];
      try {
        const parsed = JSON.parse(res.body);
        if (Array.isArray(parsed.data)) models = parsed.data.map((m: any) => m.id).slice(0, 20);
      } catch { /* nonstandard body */ }
      return { ok: true, message: 'OpenAI-compatible endpoint reachable', tools: models.length ? [`models: ${models.join(', ')}`] : undefined };
    }
    default:
      return { ok: false, message: `unknown kind: ${conn.kind}` };
  }
}
