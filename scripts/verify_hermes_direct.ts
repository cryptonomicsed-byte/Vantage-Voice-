// Live verification of the stateful Hermes direct bridge against the real
// Fold 4 gateway (:8642). Proves: session creation, streamed agent turn,
// tool events, and memory continuity across two turns in one session.
import { HermesStatefulClient } from '../src/lib/hermesDirect.js';
import fs from 'fs';

const KEY = fs.readFileSync(process.env.HOME + '/.hermes/.env', 'utf8')
  .split('\n').map(l => l.trim()).find(l => l.startsWith('API_SERVER_KEY='))
  ?.split('=')[1] || '';

const brain = new HermesStatefulClient({
  baseUrl: 'http://127.0.0.1:8642',
  apiKey: KEY,
  sessionKey: 'vv-verify-' + Date.now(),
});

const probe = await brain.probe();
console.log('probe:', probe === null ? 'HEALTHY' : probe);
if (probe !== null) process.exit(1);

// Turn 1: prove the agent loop runs (should use tools / memory).
const t0 = Date.now();
const r1 = await brain.streamTurn(
  'Check your memory: what is the name of the trading platform you operate? Reply in one sentence.',
  { onToolProgress: (e) => console.log(`  [tool:${e.status}] ${e.tool}${e.detail ? ' — ' + e.detail.slice(0, 60) : ''}`) },
);
console.log(`\nTURN 1 (${((Date.now() - t0) / 1000).toFixed(1)}s) session=${r1.sessionId}`);
console.log('  reply:', r1.reply.slice(0, 400));
console.log('  toolEvents:', r1.toolEvents.length);

// Turn 2: same session, prove memory continuity (session id carried).
const r2 = await brain.streamTurn('Remember the answer you just gave — what was it?', {});
console.log(`\nTURN 2 (same session=${r2.sessionId === r1.sessionId})`);
console.log('  reply:', r2.reply.slice(0, 400));

console.log('\nVERIFY: session continuity', r1.sessionId && r2.sessionId === r1.sessionId ? 'PASS' : 'FAIL');
