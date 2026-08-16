/**
 * Write-through client for Vantage's voice-session surface.
 *
 * Until now a conversation here left no durable trace on Vantage: the platform
 * saw scattered MCP tool calls and /api/copilot/chat POSTs, with no session,
 * no transcript, and no record of what the model actually invoked. This opens a
 * real session on Vantage per WebSocket connection and streams the transcript
 * and tool calls into it, so the conversation is visible, searchable and
 * auditable on the platform side.
 *
 * Two rules shape everything below:
 *
 *  1. Never break the call. Vantage being down must not take the voice session
 *     with it, so every write is fire-and-forget and failures are swallowed.
 *  2. Never fail silently. Swallowing an error without saying so is the exact
 *     pattern that makes an operator think they are looking at persisted data
 *     when they are not, so every failure logs loudly and flips a status flag
 *     that /api/vantage/voice-session/status reports.
 *
 * The session's vvoice_ token is scoped to one session and can do nothing but
 * append to it, so this module never handles the agent key beyond the single
 * request that opens the session.
 */

const VANTAGE_BASE = process.env.VANTAGE_BASE_URL || 'https://omokoda.duckdns.org';
const VANTAGE_AGENT_KEY = process.env.VANTAGE_AGENT_KEY || '';
const REQUEST_TIMEOUT_MS = 8000;

export type VoiceSessionHandle = {
  sessionId: string;
  token: string;
  /** Set once a write has failed, so status reporting can say so. */
  degraded: boolean;
  lastError: string;
  turnsWritten: number;
  toolCallsWritten: number;
};

export type VoiceSessionStatus = {
  configured: boolean;
  active: boolean;
  sessionId: string | null;
  degraded: boolean;
  lastError: string;
  turnsWritten: number;
  toolCallsWritten: number;
};

/** True when there is an agent key to open a session with. */
export function isVantageVoiceSessionConfigured(): boolean {
  return Boolean(VANTAGE_AGENT_KEY);
}

/** Every session this process currently has open, for status reporting. */
const liveSessions = new Set<VoiceSessionHandle>();

/**
 * Process-wide view of whether voice conversations are actually reaching
 * Vantage. Surfaced over HTTP so "is this being recorded?" has a real answer
 * instead of being inferred from log scrollback.
 */
export function voiceSessionFleetStatus(): {
  configured: boolean;
  baseUrl: string;
  liveSessions: number;
  degradedSessions: number;
  totalTurnsWritten: number;
  totalToolCallsWritten: number;
  lastError: string;
} {
  let degraded = 0;
  let turns = 0;
  let toolCalls = 0;
  let lastError = '';
  for (const s of liveSessions) {
    if (s.degraded) {
      degraded += 1;
      lastError = s.lastError || lastError;
    }
    turns += s.turnsWritten;
    toolCalls += s.toolCallsWritten;
  }
  return {
    configured: isVantageVoiceSessionConfigured(),
    baseUrl: VANTAGE_BASE,
    liveSessions: liveSessions.size,
    degradedSessions: degraded,
    totalTurnsWritten: turns,
    totalToolCallsWritten: toolCalls,
    lastError,
  };
}

async function request(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${VANTAGE_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function note(handle: VoiceSessionHandle | null, what: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (handle) {
    handle.degraded = true;
    handle.lastError = `${what}: ${message}`;
  }
  // Loud on purpose -- see rule 2 above.
  console.warn(`[VantageVoiceSession] ${what} FAILED (not persisted to Vantage): ${message}`);
}

/**
 * Open a session on Vantage. Returns null when unconfigured or unreachable --
 * the caller carries on with the voice call either way.
 */
export async function openVoiceSession(opts: {
  engine?: string;
  framework?: string;
  persona?: string;
  voice?: string;
  metadata?: Record<string, unknown>;
}): Promise<VoiceSessionHandle | null> {
  if (!VANTAGE_AGENT_KEY) {
    console.warn(
      '[VantageVoiceSession] VANTAGE_AGENT_KEY is unset — this conversation will NOT be ' +
        'recorded on Vantage (no session, no transcript, no tool-call audit).'
    );
    return null;
  }
  try {
    const res = await request('/api/agents/me/voice/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': VANTAGE_AGENT_KEY },
      body: JSON.stringify({
        engine: opts.engine || 'gemini_live',
        framework: opts.framework || 'native',
        persona: opts.persona || '',
        voice: opts.voice || '',
        metadata: opts.metadata || {},
      }),
    });
    if (!res.ok) {
      note(null, `open session (HTTP ${res.status})`, await res.text().catch(() => ''));
      return null;
    }
    const body: any = await res.json();
    console.log(`[VantageVoiceSession] opened ${body.session_id} on ${VANTAGE_BASE}`);
    const handle: VoiceSessionHandle = {
      sessionId: body.session_id,
      token: body.token,
      degraded: false,
      lastError: '',
      turnsWritten: 0,
      toolCallsWritten: 0,
    };
    liveSessions.add(handle);
    return handle;
  } catch (err) {
    note(null, 'open session', err);
    return null;
  }
}

/** Append one turn. Fire-and-forget: callers should not await this on the hot path. */
export async function recordTurn(
  handle: VoiceSessionHandle | null,
  role: 'user' | 'assistant' | 'system' | 'tool',
  text: string,
  extra: { audioTranscript?: string; toolCallId?: string } = {}
): Promise<void> {
  if (!handle || !text.trim()) return;
  try {
    const res = await request(`/api/agents/me/voice/sessions/${handle.sessionId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
      body: JSON.stringify({
        role,
        content_text: text,
        content_audio_transcript: extra.audioTranscript || '',
        tool_call_id: extra.toolCallId,
      }),
    });
    if (!res.ok) {
      note(handle, `record ${role} turn (HTTP ${res.status})`, await res.text().catch(() => ''));
      return;
    }
    handle.turnsWritten += 1;
  } catch (err) {
    note(handle, `record ${role} turn`, err);
  }
}

/**
 * Log a dispatched tool call, returning its id so the result can be attached.
 * Written before the tool runs, so one that hangs still leaves evidence.
 */
export async function recordToolCall(
  handle: VoiceSessionHandle | null,
  toolName: string,
  toolSource: string,
  args: unknown
): Promise<string | null> {
  if (!handle) return null;
  try {
    const res = await request(`/api/agents/me/voice/sessions/${handle.sessionId}/tool-calls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
      body: JSON.stringify({ tool_name: toolName, tool_source: toolSource, arguments: args }),
    });
    if (!res.ok) {
      note(handle, `record tool call ${toolName} (HTTP ${res.status})`, await res.text().catch(() => ''));
      return null;
    }
    handle.toolCallsWritten += 1;
    return (await res.json()).tool_call_id ?? null;
  } catch (err) {
    note(handle, `record tool call ${toolName}`, err);
    return null;
  }
}

export async function completeToolCall(
  handle: VoiceSessionHandle | null,
  callId: string | null,
  result: unknown,
  isError: boolean,
  durationMs: number
): Promise<void> {
  if (!handle || !callId) return;
  try {
    const res = await request(
      `/api/agents/me/voice/sessions/${handle.sessionId}/tool-calls/${callId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${handle.token}` },
        body: JSON.stringify({ result, is_error: isError, duration_ms: Math.round(durationMs) }),
      }
    );
    if (!res.ok) note(handle, `complete tool call (HTTP ${res.status})`, await res.text().catch(() => ''));
  } catch (err) {
    note(handle, 'complete tool call', err);
  }
}

/** Keep a quiet session inside its idle TTL. */
export async function heartbeat(handle: VoiceSessionHandle | null): Promise<void> {
  if (!handle) return;
  try {
    await request(`/api/agents/me/voice/sessions/${handle.sessionId}/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${handle.token}` },
    });
  } catch (err) {
    note(handle, 'heartbeat', err);
  }
}

/** Close the session so Vantage stops showing it as live and burns the token. */
export async function closeVoiceSession(
  handle: VoiceSessionHandle | null,
  reason = 'client_disconnected'
): Promise<void> {
  if (!handle) return;
  try {
    await request(`/api/agents/me/voice/sessions/${handle.sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': VANTAGE_AGENT_KEY },
      body: JSON.stringify({ reason }),
    });
    console.log(
      `[VantageVoiceSession] closed ${handle.sessionId} ` +
        `(${handle.turnsWritten} turns, ${handle.toolCallsWritten} tool calls)`
    );
  } catch (err) {
    note(handle, 'close session', err);
  } finally {
    liveSessions.delete(handle);
  }
}

export function statusOf(handle: VoiceSessionHandle | null): VoiceSessionStatus {
  return {
    configured: isVantageVoiceSessionConfigured(),
    active: Boolean(handle),
    sessionId: handle?.sessionId ?? null,
    degraded: handle?.degraded ?? false,
    lastError: handle?.lastError ?? '',
    turnsWritten: handle?.turnsWritten ?? 0,
    toolCallsWritten: handle?.toolCallsWritten ?? 0,
  };
}
