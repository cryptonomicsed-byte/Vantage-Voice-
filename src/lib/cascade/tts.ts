/**
 * Text-to-speech for the cascade voice engine.
 *
 * Ported from s2s server pipeline/tts.ts — ElevenLabs streaming
 * synthesizer (eleven_flash_v2_5) streaming 24 kHz mono PCM16, exactly the
 * format Vantage-Voice's client audio player already consumes.
 */

import { CASCADE_SAMPLE_RATE } from './audio.js';
import { TTS_DEFAULT_VOICE, TTS_MODEL, getCascadeKeys, isElevenLabsVoiceId } from './keys.js';

export interface Synthesizer {
  readonly name: string;
  readonly model: string;
  readonly defaultVoice: string;
  /** Streams 24 kHz mono PCM16 chunks for `text`. */
  stream(text: string, voice: string, signal: AbortSignal): AsyncIterable<Buffer>;
}

async function* readBody(response: Response): AsyncGenerator<Buffer> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) yield Buffer.from(value);
    }
  } finally {
    reader.releaseLock();
  }
}

async function failure(response: Response, who: string): Promise<Error> {
  let detail = '<no body>';
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  return new Error(`${who} synthesis failed (${response.status}): ${detail}`);
}

export class ElevenLabsSynthesizer implements Synthesizer {
  readonly name = 'elevenlabs';
  readonly model = TTS_MODEL;
  readonly defaultVoice = TTS_DEFAULT_VOICE;

  constructor(private apiKey: string) {}

  async *stream(text: string, voice: string, signal: AbortSignal): AsyncIterable<Buffer> {
    const voiceId = voice && isElevenLabsVoiceId(voice) ? voice : this.defaultVoice;
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream` +
      `?output_format=pcm_${CASCADE_SAMPLE_RATE}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/pcm',
      },
      body: JSON.stringify({ text, model_id: this.model }),
      signal,
    });
    if (!response.ok) throw await failure(response, 'ElevenLabs');
    yield* readBody(response);
  }
}

export function createSynthesizer(): ElevenLabsSynthesizer {
  return new ElevenLabsSynthesizer(getCascadeKeys().elevenLabsApiKey);
}

export function ttsReady(): boolean {
  return Boolean(getCascadeKeys().elevenLabsApiKey);
}

/**
 * Single-shot synthesis for REST endpoints (/api/tts) and the Gemini-dead
 * fallback: synthesize the full text and return base64 24 kHz PCM16 — the
 * same shape the old Gemini direct-TTS path produced, so callers and the
 * client player need no changes.
 */
export async function synthesizeBase64(
  text: string,
  voice: string,
  signal?: AbortSignal,
): Promise<string> {
  const synth = createSynthesizer();
  const chunks: Buffer[] = [];
  for await (const chunk of synth.stream(text, voice, signal ?? new AbortController().signal)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('base64');
}
