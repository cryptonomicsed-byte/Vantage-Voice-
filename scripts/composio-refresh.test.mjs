/**
 * Unit test for scripts/composio-refresh.mjs's config rewrite logic.
 * Pure string manipulation — no network, no credentials. Run: node scripts/composio-refresh.test.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import the rewrite function by reading the source (the .mjs uses env at
// top-level, so extract just the pure function via eval of its definition).
const src = fs.readFileSync(path.join(__dirname, 'composio-refresh.mjs'), 'utf-8');
const fnSrc = src.match(/function rewriteComposioBlock\([\s\S]*?\n}/)?.[0];
if (!fnSrc) throw new Error('rewriteComposioBlock not found in source');
const rewriteComposioBlock = eval(`(${fnSrc.replace('function rewriteComposioBlock', 'function')})`);

const SAMPLE = `model:
  provider: deepseek
  default: deepseek-chat
mcp_servers:
  vantage:
    url: https://omokoda.duckdns.org/mcp
    headers:
      X-Agent-Key: vantage_key
  composio:
    url: https://backend.composio.dev/tool_router/trs_OLDID/mcp
    headers:
      x-api-key: ak_old
    timeout: 60
    connect_timeout: 30
  voice_owner:
    url: https://vantage-voice/mcp/voice-owner
    headers:
      Authorization: Bearer x
`;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`); }
}

const out = rewriteComposioBlock(SAMPLE, 'https://backend.composio.dev/tool_router/trs_NEWID/mcp', 'ak_newkey');

check('replaces url', out.includes('/tool_router/trs_NEWID/mcp'));
check('replaces key', out.includes('x-api-key: ak_newkey'));
check('drops old url', !out.includes('trs_OLDID'));
check('drops old key', !out.includes('ak_old'));
check('preserves vantage block', out.includes('vantage_key'));
check('preserves voice_owner block', out.includes('voice-owner'));
check('preserves model block', out.includes('deepseek-chat'));
check('keeps timeout lines', out.includes('timeout: 60') && out.includes('connect_timeout: 30'));
check('single composio url block', (out.match(/^\s{2}composio:/gm) || []).length === 1);

// Round-trip: rewritten config parses as YAML-ish and is stable under re-rewrite
const out2 = rewriteComposioBlock(out, 'https://backend.composio.dev/tool_router/trs_THIRD/mcp', 'ak_third');
check('re-rewrite is stable', out2.includes('trs_THIRD') && !out2.includes('trs_NEWID') && out2.includes('vantage_key'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
