import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

const AUDIT_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vv-audit-')), 'owner-audit.log');
process.env.OWNER_AUDIT_LOG_PATH = AUDIT_PATH;

const { verifyOwnerPin, lockoutRemainingMs, auditOwnerAction, __resetOwnerPinGuard } = await import('./ownerPin.js');

const CORRECT = '8421';

function readAudit(): Array<Record<string, unknown>> {
  if (!fs.existsSync(AUDIT_PATH)) return [];
  return fs
    .readFileSync(AUDIT_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe('owner PIN gate', () => {
  beforeEach(() => {
    __resetOwnerPinGuard();
    process.env.OWNER_VOICE_PIN = CORRECT;
    if (fs.existsSync(AUDIT_PATH)) fs.rmSync(AUDIT_PATH);
  });

  after(() => fs.rmSync(path.dirname(AUDIT_PATH), { recursive: true, force: true }));

  it('accepts the correct PIN', () => {
    assert.equal(verifyOwnerPin(CORRECT, 'test').ok, true);
  });

  it('rejects a wrong PIN', () => {
    const r = verifyOwnerPin('0000', 'test');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'incorrect');
  });

  it('refuses to unlock when no PIN is configured', () => {
    process.env.OWNER_VOICE_PIN = '';
    const r = verifyOwnerPin('', 'test');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not_configured');
  });

  it('does not treat a prefix of the PIN as correct', () => {
    assert.equal(verifyOwnerPin('842', 'test').ok, false);
    assert.equal(verifyOwnerPin('84210', 'test').ok, false);
  });

  it('locks out after repeated wrong guesses', () => {
    for (let i = 0; i < 4; i++) {
      assert.equal(verifyOwnerPin('0000', 'test').reason, 'incorrect', `attempt ${i + 1}`);
    }
    const fifth = verifyOwnerPin('0000', 'test');
    assert.equal(fifth.reason, 'locked_out');
    assert.ok((fifth.retryAfterMs ?? 0) > 0);
    assert.ok(lockoutRemainingMs() > 0);
  });

  it('rejects even the CORRECT pin while locked out', () => {
    for (let i = 0; i < 5; i++) verifyOwnerPin('0000', 'test');
    const r = verifyOwnerPin(CORRECT, 'test');
    assert.equal(r.ok, false, 'a lockout that the real PIN can bypass is not a lockout');
    assert.equal(r.reason, 'locked_out');
  });

  // Note: the escalating backoff (60s doubling to 15m across repeat lockouts)
  // is not covered here -- verifyOwnerPin reads Date.now() directly, so testing
  // it would mean either sleeping through a real lockout or injecting a clock.
  // Worth doing if the backoff schedule ever becomes load-bearing.

  it('writes an audit line for both success and failure, never containing the PIN', () => {
    verifyOwnerPin('0000', 'voice_tool');
    verifyOwnerPin(CORRECT, 'owner_mcp');

    const lines = readAudit();
    assert.equal(lines.length, 2);
    assert.equal(lines[0].outcome, 'denied');
    assert.equal(lines[0].source, 'voice_tool');
    assert.equal(lines[1].outcome, 'allowed');
    assert.equal(lines[1].source, 'owner_mcp');

    const raw = fs.readFileSync(AUDIT_PATH, 'utf-8');
    assert.ok(!raw.includes(CORRECT), 'the audit log must never record the PIN itself');
  });

  it('shares one attempt budget across both surfaces', () => {
    // Alternating surfaces must not double the guess budget.
    verifyOwnerPin('1111', 'voice_tool');
    verifyOwnerPin('2222', 'owner_mcp');
    verifyOwnerPin('3333', 'voice_tool');
    verifyOwnerPin('4444', 'owner_mcp');
    assert.equal(verifyOwnerPin('5555', 'voice_tool').reason, 'locked_out');
  });

  it('records privileged actions separately from unlocks', () => {
    auditOwnerAction('set_api_key', { key: 'GEMINI_API_KEY' });
    const lines = readAudit();
    assert.equal(lines[0].action, 'set_api_key');
    assert.equal(lines[0].outcome, 'allowed');
    assert.equal(lines[0].key, 'GEMINI_API_KEY');
  });
});
