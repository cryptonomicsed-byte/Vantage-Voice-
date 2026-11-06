/**
 * openAiCompat.ts — generic OpenAI-compatible chat client (SSE streaming).
 *
 * Visitor path for ANY agent that exposes /v1/chat/completions (OpenAI
 * format). Deliberately free of Hermes-specific headers so a user can point
 * Vantage Voice at OpenClaw, a self-hosted vLLM, an OpenAI proxy, or any
 * other compatible endpoint. Tool calls in the stream are surfaced as
 * events so the cascade/UI can show what the agent is doing.
 */

export interface OpenAiToolEvent {
  tool: string;
  status: 'started' | 'completed' | 'failed' | 'delta';
  detail?: string;
}

export interface OpenAiTurnResult {
  reply: string;
  finishReason: string;
  toolEvents: OpenAiToolEvent[];
}

interface SseFrame { event: string; data: string; }

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
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf('\n\n');
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of raw.split('\n')) {
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

export interface OpenAiClientOptions {
  baseUrl: string;   // e.g. http://127.0.0.1:8642/v1  (the /v1 prefix is optional)
  apiKey?: string;
  model?: string;
}

export class OpenAiCompatClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: OpenAiClientOptions) {
    this.base = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'gpt-4o-mini';
  }

  get baseUrl(): string { return this.base; }
  get modelName(): string { return this.model; }

  async probe(timeoutMs = 4000): Promise<string | null> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}/models`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) return 'endpoint rejected the API key';
      if (!res.ok) return `endpoint returned HTTP ${res.status}`;
      return null;
    } catch (err) {
      return `endpoint unreachable at ${this.base} (${err instanceof Error ? err.message : String(err)})`;
    } finally {
      clearTimeout(t);
    }
  }

  async listModels(timeoutMs = 4000): Promise<string[]> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.base}/models`, { headers: this.headers(), signal: controller.signal });
      if (!res.ok) return [];
      const body: any = await res.json();
      return Array.isArray(body?.data) ? body.data.map((m: any) => String(m.id)) : [];
    } catch {
      return [];
    } finally {
      clearTimeout(t);
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  /**
   * One chat turn. `tools` are optional OpenAI-format function definitions —
   * pass the Vantage MCP tool set here when the endpoint can take tool calls
   * (tool injection for agents that don't have Vantage wired natively).
   */
  async streamTurn(
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>,
    opts: {
      tools?: Array<Record<string, unknown>>;
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
      onDelta?: (text: string) => void;
      onToolCall?: (name: string, args: string) => void;
    } = {},
  ): Promise<OpenAiTurnResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
    };
    if (opts.tools && opts.tools.length > 0) body.tools = opts.tools;

    const res = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 400);
      throw new Error(`agent endpoint request failed (${res.status}): ${detail}`);
    }

    let reply = '';
    let finishReason = 'stop';
    const toolEvents: OpenAiToolEvent[] = [];
    const toolCallBuffer = new Map<number, { name: string; args: string }>();

    try {
      for await (const frame of sseFrames(res)) {
        if (frame.data === '[DONE]') break;
        let payload: Record<string, any>;
        try {
          payload = JSON.parse(frame.data);
        } catch { continue; }
        if (payload.error) {
          throw new Error(`agent endpoint stream error: ${payload.error?.message ?? JSON.stringify(payload.error)}`);
        }
        const choice = payload.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content) {
          reply += delta.content;
          opts.onDelta?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = typeof tc.index === 'number' ? tc.index : 0;
            const cur = toolCallBuffer.get(idx) ?? { name: '', args: '' };
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.args += tc.function.arguments;
            toolCallBuffer.set(idx, cur);
            if (cur.name && !toolEvents.some((e) => e.tool === cur.name)) {
              toolEvents.push({ tool: cur.name, status: 'started' });
            }
          }
        }
        if (choice.finish_reason) finishReason = String(choice.finish_reason);
      }
    } catch (err) {
      if (opts.signal?.aborted) {
        return { reply, finishReason: 'cancelled', toolEvents };
      }
      throw err;
    }

    for (const { name, args } of toolCallBuffer.values()) {
      if (name) opts.onToolCall?.(name, args);
      const evt = toolEvents.find((e) => e.tool === name);
      if (evt) evt.status = 'completed';
    }
    return { reply, finishReason, toolEvents };
  }
}
