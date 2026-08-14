#!/usr/bin/env node
/**
 * Composio Tool Router session refresher for the Contabo Hermes instance.
 *
 * WHY: Composio mints a ONE-TIME Tool Router session URL+key per
 * `composio.create(userId, { mcp: true })` call. The Hermes config.yaml
 * (mcp_servers.composio) holds a hardcoded URL+key that silently expires —
 * the Hermes brain then loses all composio tools (Gmail/GitHub/Outlook/
 * Discord/Slack/GitLab/Notion/Dropbox) with no refresh. This script:
 *
 *   1. mints a FRESH session under the SAME userId (connected accounts are
 *      tied to the userId, not the session — re-minting keeps them),
 *   2. best-effort DELETEs the previous session (DELETE /api/v3.1/
 *      tool_router/session/{id}) so old credentials don't leak,
 *   3. rewrites ONLY the mcp_servers.composio block in the Hermes
 *      config.yaml (in place, preserves everything else),
 *   4. prints a timestamped JSON line = machine-verifiable evidence.
 *
 * Usage: node scripts/composio-refresh.mjs [--config /path/to/config.yaml]
 * Env: COMPOSIO_API_KEY (or ~/.vv-cascade-keys.env), COMPOSIO_USER_ID.
 * Safe to run repeatedly; idempotent; never touches other config blocks.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Composio } from '@composio/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── key resolution (never argv/ps; 0600 file, voice app .env, or env) ────
function loadKeys() {
  const candidates = [
    path.join(os.homedir(), '.vv-cascade-keys.env'),
    path.join(ROOT, '.vv-cascade-keys.env'),
    '/root/.vv-cascade-keys.env',
    // The voice app's own env carries the live COMPOSIO_API_KEY + USER_ID
    // (the same creds the voice server's composio client uses).
    '/opt/vantage-voice/.env',
    path.join(ROOT, '.env'),
  ];
  const out = {};
  for (const c of candidates) {
    try {
      const raw = fs.readFileSync(c, 'utf-8');
      for (const line of raw.split('\n')) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^"|"$/g, '');
        // Prefer the FIRST value found for each key across all candidates;
        // don't stop at the first file (the cascade keys file has no
        // COMPOSIO key, but the voice app .env does).
        if (k && v && !(k in out)) out[k] = v;
      }
    } catch { /* next */ }
  }
  return out;
}

const keys = loadKeys();
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || keys.COMPOSIO_API_KEY || '';
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || keys.COMPOSIO_USER_ID || 'vantage-voice-owner';

function log(obj) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

// ── config.yaml composio block rewrite (preserve everything else) ────────
// The Hermes config lives at the compose-mounted data dir on the host:
// /opt/hermes-agent-contabo/data/config.yaml (inside the container it is
// /opt/data/config.yaml, same file via the ./data:/opt/data volume).
const CONFIG_PATH = process.argv.find((a) => a.startsWith('--config='))?.split('=')[1]
  || process.env.HERMES_CONFIG
  || '/opt/hermes-agent-contabo/data/config.yaml';

function rewriteComposioBlock(yaml, url, apiKey) {
  const lines = yaml.split('\n');
  // Find the composio: entry under mcp_servers: and its indented block.
  const start = lines.findIndex((l) => /^\s{2}composio:\s*$/.test(l));
  if (start === -1) throw new Error('mcp_servers.composio block not found in config.yaml');
  let end = start + 1;
  while (end < lines.length && /^\s{4}/.test(lines[end])) end++;
  const indent = '    ';
  const block = [
    '  composio:',
    `${indent}url: ${url}`,
    `${indent}headers:`,
    `${indent}  x-api-key: ${apiKey}`,
    `${indent}timeout: 60`,
    `${indent}connect_timeout: 30`,
  ];
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join('\n');
}

async function main() {
  if (!COMPOSIO_API_KEY) {
    log({ ok: false, error: 'COMPOSIO_API_KEY not found (env or ~/.vv-cascade-keys.env)' });
    process.exit(2);
  }
  log({ ok: true, step: 'keys', user: COMPOSIO_USER_ID, keyPrefix: COMPOSIO_API_KEY.slice(0, 6) + '…' });

  const composio = new Composio({ apiKey: COMPOSIO_API_KEY });

  // Read the OLD url/session id from config (best-effort cleanup later).
  let oldSessionId = null;
  try {
    const oldYaml = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const oldUrl = oldYaml.match(/^\s{2}composio:\s*\n\s{4}url:\s*(\S+)/m)?.[1] || '';
    const m = oldUrl.match(/\/tool_router\/([^/]+)\//);
    if (m) oldSessionId = m[1];
  } catch { /* config may not exist yet (first boot) */ }

  // Mint a FRESH session.
  log({ ok: true, step: 'mint_start' });
  const session = await composio.create(COMPOSIO_USER_ID, { mcp: true });
  const url = session.mcp.url;
  const apiKey = session.mcp.headers['x-api-key'] || session.mcp.headers['X-Api-Key'];
  const newSessionId = session.sessionId || (url.match(/\/tool_router\/([^/]+)\//) || [])[1];
  if (!url || !apiKey) throw new Error('minted session missing mcp url/headers');
  log({ ok: true, step: 'mint_done', sessionId: newSessionId, url, keyPrefix: apiKey.slice(0, 6) + '…' });

  // Best-effort delete the OLD session (avoids credential leak).
  if (oldSessionId && oldSessionId !== newSessionId) {
    try {
      await composio.client.delete(`/api/v3.1/tool_router/session/${encodeURIComponent(oldSessionId)}`);
      log({ ok: true, step: 'old_session_deleted', sessionId: oldSessionId });
    } catch (err) {
      log({ ok: true, step: 'old_session_delete_failed', sessionId: oldSessionId, error: err?.message });
    }
  }

  // Rewrite config.yaml composio block.
  const yaml = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const next = rewriteComposioBlock(yaml, url, apiKey);
  fs.writeFileSync(CONFIG_PATH, next);
  log({ ok: true, step: 'config_rewritten', path: CONFIG_PATH, url, keyPrefix: apiKey.slice(0, 6) + '…' });

  console.log('COMPOSIO_REFRESH_OK');
}

main().catch((err) => {
  log({ ok: false, error: err?.message || String(err) });
  process.exit(1);
});
