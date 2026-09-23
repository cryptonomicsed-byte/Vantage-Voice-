/**
 * hermesDirect.ts — direct, sessionful bridge to a real Hermes agent instance.
 *
 * Ported from ~/s2s/server/src/agents/chatAgent.ts (proven 2026-08-05): the
 * Hermes gateway API server (:8642, API_SERVER_ENABLED) runs the FULL agent
 * behind /v1/chat/completions — tools, skills, long-term memory, subagent
 * delegation — and exposes session continuity via two headers:
 *
 *   X-Hermes-Session-Key  minted per connection (scopes long-term memory)
 *   X-Hermes-Session-Id   returned by the agent; send it back on later turns
 *                         so memory/skills carry across the conversation
 *
 * Unlike the Vantage copilot relay (one-shot text echo), this is the real
 * agent loop: the reply you get back is produced by the agent using its own
 * tools, and `event: hermes.tool.progress` frames arrive for every tool call
 * the agent makes.
 */

export interface HermesToolEvent {
  tool: string;
  status: string;
  detail?: string;
}

export interface HermesTurnResult {
  reply: string;
  sessionId: string | null;
  toolEvents: HermesToolEvent[];
  finishReason: string;
}

interface SseFrame {
  event: string;
  data: string;
}

/** Split an SSE byte stream into `event:`/`data:` frames. */
async function* sseFrames(response: Response): AsyncGenerator<SseFrame> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const rawFrame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');

        let event = 'message';
        const dataLines: string[] = [];
        for (const line of rawFrame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface HermesDirectOptions {
  /** e.g. http://127.0.0.1:18642 (tunneled Fold 4 brain) or http://127.0.0.1:8642 */
  baseUrl: string;
  /** The gateway's API_SERVER_KEY (Bearer). */
  apiKey: string;
  /** Model id the API server answers to. */
  model?: string;
  /** Per-connection session key; omit to mint one (s2s-<rand><ts>). */
  sessionKey?: string;
}

export class HermesDirect {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly sessionKey: string;
  private sessionId: string | null = null;
  private toolEvents: HermesToolEvent[] = [];

  constructor(options: HermesDirectOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model || 'hermes-agent';
    this.sessionKey =
      options.sessionKey || `vv-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /** Cheap reachability probe. Returns null when healthy, else a reason. */
  async probe(timeoutMs = 2500): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) return 'brain rejected the API key';
      if (!response.ok) return `brain returned HTTP ${response.status}`;
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `brain unreachable at ${this.baseUrl} (${reason})`;
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    headers['X-Hermes-Session-Key'] = this.sessionKey;
    if (this.sessionId) headers['X-Hermes-Session-Id'] = this.sessionId;
    return headers;
  }

  /**
   * Run one full agent turn. Returns the assembled reply plus the session id
   * (send it back on the next turn for memory continuity) and any tool events
   * the agent emitted while working.
   */
  async streamTurn(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    opts: {
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      onDelta?: (text: string) => void;
      onReasoning?: (text: string) => void;
      onToolProgress?: (event: HermesToolEvent) => void;
    } = {},
  ): Promise<HermesTurnResult> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
        stream: true,
      }),
      signal: opts.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.text()).slice(0, 400);
      } catch {
        /* ignore */
      }
      throw new Error(`Hermes direct request failed (${response.status}): ${detail}`);
    }

    const returnedSession = response.headers.get('X-Hermes-Session-Id');
    if (returnedSession) this.sessionId = returnedSession;

    let finishReason = 'stop';
    let reply = '';
    const toolEvents: HermesToolEvent[] = [];
    const signal = opts.signal;

    try {
      for await (const frame of sseFrames(response)) {
        if (frame.data === '[DONE]') break;

        let payload: Record<string, any>;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue;
        }

        if (frame.event === 'hermes.tool.progress') {
          const evt: HermesToolEvent = {
            tool: String(payload.tool ?? payload.name ?? 'tool'),
            status: String(payload.status ?? 'running'),
            detail: typeof payload.detail === 'string' ? payload.detail : undefined,
          };
          toolEvents.push(evt);
          opts.onToolProgress?.(evt);
          continue;
        }

        if (payload.error) {
          throw new Error(`Hermes direct: ${payload.error.message ?? 'stream error'}`);
        }

        const choice = payload.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta ?? {};
        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          opts.onReasoning?.(delta.reasoning_content);
        }
        if (typeof delta.content === 'string' && delta.content) {
          reply += delta.content;
          opts.onDelta?.(delta.content);
        }
        if (choice.finish_reason) finishReason = String(choice.finish_reason);
      }
    } catch (error) {
      if (signal?.aborted) {
        return { reply, sessionId: this.sessionId, toolEvents, finishReason: 'cancelled' };
      }
      throw error;
    }

    return { reply, sessionId: this.sessionId, toolEvents, finishReason };
  }
}

/**
 * Convenience wrapper for the voice server: run one turn against the direct
 * brain and return the reply + session id + tool events. `sessionCtx` carries
 * the per-connection session key + last session id so a WS connection keeps
 * ONE Hermes conversation (memory/skills carry across turns).
 */
export interface HermesSessionCtx {
  sessionKey: string;
  sessionId: string | null;
}

export async function bridgeToHermesDirect(
  ctx: HermesSessionCtx,
  text: string,
  opts: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    systemPrompt?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
): Promise<{ reply: string; sessionId: string | null; toolEvents: HermesToolEvent[] }> {
  const client = new HermesDirect({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    sessionKey: ctx.sessionKey,
  });
  // Re-attach the prior session id so the agent continues its memory.
  // HermesDirect reads it from the stored id; we can't set it post-hoc, so
  // carry it via a fresh client + session-id header injection below.
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  if (opts.history) {
    for (const h of opts.history) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: 'user', content: text });

  // If we already have a session id from a previous turn, pass it through the
  // header — HermesDirect only sends it when set, so prime it via a one-off
  // fetch-compatible approach: rebuild headers by calling the low-level path.
  if (ctx.sessionId) {
    // Direct header injection: re-run streamTurn but with the stored session
    // id forced. We do this by temporarily setting the private field through
    // the public surface — HermesDirect sends X-Hermes-Session-Id whenever
    // sessionId is set, so expose it via a setter-free trick: recreate the
    // client with a preloaded id using the internal constructor path.
    // Simplest robust approach: add the id to the request via an extra turn
    // on a client that already carries it — so reuse the same client when the
    // caller keeps one around. For the stateless wrapper, prime the header by
    // constructing with a stored id through a small private accessor.
    (client as any).sessionId = ctx.sessionId;
  }

  const result = await client.streamTurn(messages);
  return { reply: result.reply, sessionId: result.sessionId, toolEvents: result.toolEvents };
}

/** Mint a fresh per-connection session key (scopes the agent's memory). */
export function mintHermesSessionKey(prefix = 'vv'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/**
 * STATEFUL direct bridge (preferred over HermesDirect's stateless path).
 *
 * Uses the gateway's real session API instead of /v1/chat/completions:
 *   POST /api/sessions                     — create a persistent session row
 *   POST /api/sessions/{id}/chat/stream    — one agent turn, SSE stream
 *
 * The agent keeps its own conversation history server-side (loaded via
 * SessionDB per turn), long-term memory is scoped by X-Hermes-Session-Key,
 * and tool events arrive as explicit SSE events (tool.started/completed/
 * failed + tool.progress for reasoning). Verified live 2026-08-14 against
 * the Fold 4 gateway (:8642): session id returned, content streams, full
 * agent context (~18.8k prompt tokens incl. memory) on every turn.
 */
export class HermesStatefulClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly sessionKey: string;
  private sessionId: string | null = null;

  constructor(options: { baseUrl: string; apiKey: string; model?: string; sessionKey: string }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model || 'hermes-agent';
    this.sessionKey = options.sessionKey;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /** Cheap reachability probe. Returns null when healthy, else a reason. */
  async probe(timeoutMs = 2500): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) return 'brain rejected the API key';
      if (!response.ok) return `brain returned HTTP ${response.status}`;
      return null;
    } catch (error) {
      return `brain unreachable at ${this.baseUrl} (${error instanceof Error ? error.message : String(error)})`;
    } finally {
      clearTimeout(timer);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    headers['X-Hermes-Session-Key'] = this.sessionKey;
    if (this.sessionId) headers['X-Hermes-Session-Id'] = this.sessionId;
    return headers;
  }

  /** Create the persistent session (idempotent — safe to call every turn). */
  async createSession(options: { systemPrompt?: string } = {}): Promise<string> {
    if (this.sessionId) return this.sessionId;
    const body: Record<string, string> = { model: this.model };
    if (options.systemPrompt) body.system_prompt = options.systemPrompt;
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Hermes createSession failed (${response.status}): ${detail}`);
    }
    const data = await response.json();
    const sid = data?.session?.id ?? null;
    if (!sid) throw new Error('Hermes createSession returned no session id');
    this.sessionId = sid;
    return sid;
  }

  /**
   * Run one agent turn against the persisted session. The agent keeps its
   * own history server-side, so only the new user message is sent. Returns
   * the assembled reply plus the tool events the agent emitted while working.
   */
  async streamTurn(
    message: string,
    opts: {
      systemMessage?: string;
      signal?: AbortSignal;
      onDelta?: (text: string) => void;
      onToolProgress?: (event: HermesToolEvent) => void;
    } = {},
  ): Promise<HermesTurnResult> {
    const sessionId = await this.createSession();
    const body: Record<string, string> = { message };
    if (opts.systemMessage) body.system_message = opts.systemMessage;

    const response = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Hermes chat/stream failed (${response.status}): ${detail}`);
    }

    const toolEvents: HermesToolEvent[] = [];
    let reply = '';
    let finishReason = 'completed';

    try {
      for await (const frame of sseFrames(response)) {
        let payload: Record<string, any>;
        try {
          payload = JSON.parse(frame.data);
        } catch {
          continue;
        }

        switch (frame.event) {
          case 'assistant.delta': {
            if (typeof payload.delta === 'string' && payload.delta) {
              reply += payload.delta;
              opts.onDelta?.(payload.delta);
            }
            break;
          }
          case 'tool.progress': {
            const evt: HermesToolEvent = {
              tool: String(payload.tool_name ?? '_thinking'),
              status: 'thinking',
              detail: typeof payload.delta === 'string' ? payload.delta : undefined,
            };
            toolEvents.push(evt);
            opts.onToolProgress?.(evt);
            break;
          }
          case 'tool.started': {
            const evt: HermesToolEvent = {
              tool: String(payload.tool_name ?? 'tool'),
              status: 'started',
              detail: typeof payload.preview === 'string' ? payload.preview : undefined,
            };
            toolEvents.push(evt);
            opts.onToolProgress?.(evt);
            break;
          }
          case 'tool.completed': {
            const evt: HermesToolEvent = {
              tool: String(payload.tool_name ?? 'tool'),
              status: 'completed',
              detail: typeof payload.preview === 'string' ? payload.preview : undefined,
            };
            toolEvents.push(evt);
            opts.onToolProgress?.(evt);
            break;
          }
          case 'tool.failed': {
            const evt: HermesToolEvent = {
              tool: String(payload.tool_name ?? 'tool'),
              status: 'failed',
              detail: typeof payload.preview === 'string' ? payload.preview : undefined,
            };
            toolEvents.push(evt);
            opts.onToolProgress?.(evt);
            break;
          }
          case 'assistant.completed': {
            if (typeof payload.content === 'string' && payload.content && !reply) {
              reply = payload.content;
            }
            break;
          }
          case 'error': {
            throw new Error(`Hermes session turn error: ${payload.message ?? 'unknown'}`);
          }
          case 'done':
            break;
          default:
            break; // run.started / message.started / run.completed / keepalives
        }
      }
    } catch (error) {
      if (opts.signal?.aborted) {
        return { reply, sessionId: this.sessionId, toolEvents, finishReason: 'cancelled' };
      }
      throw error;
    }

    return { reply, sessionId: this.sessionId, toolEvents, finishReason };
  }
}

/**
 * One-off stateful turn (used by the delegate_to_agent tool, where the
 * caller doesn't own a WS connection). Fresh session per delegation —
 * long-term memory is still injected; only conversation history resets.
 */
export async function oneShotHermesTurn(
  text: string,
  opts: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    systemMessage?: string;
    sessionKeyPrefix?: string;
  },
): Promise<{ reply: string; toolEvents: HermesToolEvent[] }> {
  const client = new HermesStatefulClient({
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    model: opts.model,
    sessionKey: mintHermesSessionKey(opts.sessionKeyPrefix || 'vv-delegate'),
  });
  const result = await client.streamTurn(text, { systemMessage: opts.systemMessage });
  return { reply: result.reply, toolEvents: result.toolEvents };
}
