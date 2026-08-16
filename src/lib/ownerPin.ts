/**
 * Owner PIN verification and privileged-action audit log.
 *
 * The PIN gates every destructive owner tool (set/remove API keys, Composio
 * connect/disconnect, secure-tier memory writes, swarm task spawn), and it was
 * previously checked with a bare `pin !== realPin` in two separate places, with
 * no attempt limit and no record of who unlocked what. Three problems with
 * that, all fixed here:
 *
 *  1. `!==` on strings short-circuits at the first differing byte, so response
 *     time leaks a prefix. Compared as fixed-length SHA-256 digests through
 *     timingSafeEqual instead, which also sidesteps the length-mismatch throw.
 *  2. Nothing limited guesses. A 4-digit PIN over the tool-call path is
 *     exhaustible in seconds. Failures now trigger an escalating lockout.
 *  3. Nothing was recorded. Privileged actions now append to an audit log, so
 *     "when was this key changed, and did an unlock precede it" is answerable.
 *
 * This is the transitional hardening. The real fix is Vantage-issued scoped
 * session tokens (see the voice-session surface in the Vantage repo), which
 * remove the need for a shared secret spoken aloud over a voice channel.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const AUDIT_LOG_PATH = process.env.OWNER_AUDIT_LOG_PATH || path.join('data', 'owner-audit.log');

// Escalating lockout: the first few fat-finger attempts stay cheap, sustained
// guessing gets expensive fast.
const FAILURES_BEFORE_LOCKOUT = 5;
const BASE_LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

type GuardState = { failures: number; lockedUntil: number; lockoutCount: number };

// Single-user app, so one global gate rather than per-connection -- otherwise
// an attacker just opens a new WebSocket to reset their attempt count.
const state: GuardState = { failures: 0, lockedUntil: 0, lockoutCount: 0 };

export type PinResult = {
  ok: boolean;
  reason?: 'not_configured' | 'locked_out' | 'incorrect';
  message?: string;
  retryAfterMs?: number;
};

function constantTimeEquals(a: string, b: string): boolean {
  // Hashing first makes both sides 32 bytes, so timingSafeEqual never throws on
  // a length mismatch and the comparison itself leaks no length information.
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Append one line to the audit log. Best-effort: a failure to write must not
 * block the action, but it is reported rather than swallowed.
 */
export function auditOwnerAction(
  action: string,
  detail: Record<string, unknown> = {},
  outcome: 'allowed' | 'denied' | 'error' = 'allowed'
): void {
  const line = JSON.stringify({ at: new Date().toISOString(), action, outcome, ...detail });
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_LOG_PATH, line + '\n');
  } catch (err: any) {
    console.warn(`[OwnerAudit] could not write audit log: ${err?.message || err}`);
  }
  console.log(`[OwnerAudit] ${line}`);
}

/** Whether the PIN gate is currently locked, without consuming an attempt. */
export function lockoutRemainingMs(now = Date.now()): number {
  return Math.max(0, state.lockedUntil - now);
}

/**
 * Verify a supplied PIN. Never logs the PIN itself, only the outcome.
 *
 * `source` identifies which surface asked (the voice tool path or the owner
 * MCP server), so the audit log distinguishes them.
 */
export function verifyOwnerPin(supplied: string, source: string): PinResult {
  const realPin = process.env.OWNER_VOICE_PIN || '';
  const now = Date.now();

  if (!realPin) {
    auditOwnerAction('unlock_owner_controls', { source, reason: 'not_configured' }, 'error');
    return { ok: false, reason: 'not_configured', message: 'No owner PIN is configured on this server.' };
  }

  const remaining = lockoutRemainingMs(now);
  if (remaining > 0) {
    auditOwnerAction('unlock_owner_controls', { source, reason: 'locked_out', retryAfterMs: remaining }, 'denied');
    return {
      ok: false,
      reason: 'locked_out',
      retryAfterMs: remaining,
      message: `Too many incorrect attempts. Locked for another ${Math.ceil(remaining / 1000)}s.`,
    };
  }

  if (!constantTimeEquals(String(supplied || ''), realPin)) {
    state.failures += 1;
    let lockedFor = 0;
    if (state.failures >= FAILURES_BEFORE_LOCKOUT) {
      lockedFor = Math.min(BASE_LOCKOUT_MS * 2 ** state.lockoutCount, MAX_LOCKOUT_MS);
      state.lockedUntil = now + lockedFor;
      state.lockoutCount += 1;
      state.failures = 0;
    }
    auditOwnerAction(
      'unlock_owner_controls',
      { source, reason: 'incorrect', failures: state.failures, lockedForMs: lockedFor },
      'denied'
    );
    return {
      ok: false,
      reason: lockedFor ? 'locked_out' : 'incorrect',
      retryAfterMs: lockedFor || undefined,
      message: lockedFor
        ? `Incorrect PIN. Too many attempts — locked for ${Math.ceil(lockedFor / 1000)}s.`
        : 'Incorrect PIN.',
    };
  }

  // Success clears the failure count but deliberately not lockoutCount, so a
  // correct guess partway through an attack doesn't reset the escalation.
  state.failures = 0;
  auditOwnerAction('unlock_owner_controls', { source }, 'allowed');
  return { ok: true };
}

/** Test seam: reset the gate between cases. */
export function __resetOwnerPinGuard(): void {
  state.failures = 0;
  state.lockedUntil = 0;
  state.lockoutCount = 0;
}
