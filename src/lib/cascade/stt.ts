/**
 * Speech-to-text for the cascade voice engine.
 *
 * Ported from s2s server pipeline/stt.ts, pointed at Groq Whisper via the
 * OpenAI-compatible override (STT_PROVIDER=openai,
 * STT_OPENAI_BASE_URL=https://api.groq.com/openai/v1,
 * STT_MODEL=whisper-large-v3-turbo) — verified working, zero Gemini.
 */

import { STT_BASE_URL, STT_MODEL, getCascadeKeys } from './keys.js';
import { CASCADE_SAMPLE_RATE, encodeWav } from './audio.js';

export interface SttResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export class GroqTranscriber {
  readonly name = 'groq';
  readonly model = STT_MODEL;

  constructor(private apiKey: string) {}

  async transcribe(pcm: Buffer, signal?: AbortSignal): Promise<SttResult> {
    const started = Date.now();
    const form = new FormData();
    const wav = encodeWav(pcm, CASCADE_SAMPLE_RATE);
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', this.model);
    form.append('response_format', 'json');

    const response = await fetch(`${STT_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal,
    });

    if (!response.ok) {
      const detail = await safeText(response);
      throw new Error(`Groq transcription failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as { text?: string };
    return {
      text: (payload.text ?? '').trim(),
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - started,
    };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return '<no body>';
  }
}

export function createTranscriber(): GroqTranscriber {
  return new GroqTranscriber(getCascadeKeys().groqApiKey);
}

export function sttReady(): boolean {
  return Boolean(getCascadeKeys().groqApiKey);
}
