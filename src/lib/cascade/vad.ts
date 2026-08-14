/**
 * Energy-based server-side Voice Activity Detection.
 *
 * Ported from s2s server pipeline/vad.ts (proven, provider-agnostic). The
 * OpenAI Realtime / Gemini Live APIs run VAD upstream; the cascade voice
 * engine has to do it here so the browser can keep streaming audio
 * continuously and still get turn boundaries and barge-in.
 */

export interface VadOptions {
  sampleRate: number;
  /** 0..1, higher = less sensitive (matches OpenAI's `threshold`). */
  threshold: number;
  /** Audio kept before speech onset, prepended to the utterance. */
  prefixPaddingMs: number;
  /** Trailing silence that ends the turn. */
  silenceDurationMs: number;
  /** Utterances shorter than this are treated as noise. */
  minSpeechMs: number;
  /** Hard cap so a stuck-open mic cannot buffer forever. */
  maxUtteranceMs: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  sampleRate: 24000,
  threshold: 0.5,
  prefixPaddingMs: 300,
  silenceDurationMs: 500,
  minSpeechMs: 200,
  maxUtteranceMs: 30000,
};

export type VadEvent =
  | { type: 'speech_started'; atMs: number }
  | { type: 'speech_stopped'; atMs: number; speechMs: number; audio: Buffer };

const FRAME_MS = 20;

/** RMS of a mono PCM16 little-endian frame, normalised to 0..1. */
export function frameRms(frame: Buffer): number {
  const samples = frame.length >> 1;
  if (samples === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const sample = frame.readInt16LE(i * 2) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples);
}

export class EnergyVad {
  private options: VadOptions;
  private frameBytes: number;
  private carry: Buffer = Buffer.alloc(0);

  private prefix: Buffer[] = [];
  private prefixFrames: number;

  private utterance: Buffer[] = [];
  private speaking = false;
  private consecutiveSpeechFrames = 0;
  private silenceMs = 0;
  private speechMs = 0;
  private elapsedMs = 0;

  private noiseFloor = 0.004;

  constructor(options: Partial<VadOptions> = {}) {
    this.options = { ...DEFAULT_VAD_OPTIONS, ...options };
    this.frameBytes = Math.round((this.options.sampleRate * FRAME_MS) / 1000) * 2;
    this.prefixFrames = Math.max(1, Math.round(this.options.prefixPaddingMs / FRAME_MS));
  }

  /** Update tuning without losing the current utterance. */
  configure(options: Partial<VadOptions>): void {
    this.options = { ...this.options, ...options };
    this.prefixFrames = Math.max(1, Math.round(this.options.prefixPaddingMs / FRAME_MS));
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Threshold the next frame has to clear to count as speech. */
  private get openThreshold(): number {
    const t = Math.min(1, Math.max(0, this.options.threshold));
    const absoluteFloor = 0.005 + t * 0.02;
    const relativeFloor = this.noiseFloor * (2.5 + t * 7);
    return Math.max(absoluteFloor, relativeFloor);
  }

  /** Feed PCM16 mono audio. Returns the turn events it produced. */
  push(pcm: Buffer): VadEvent[] {
    const events: VadEvent[] = [];
    const buffer = this.carry.length > 0 ? Buffer.concat([this.carry, pcm]) : pcm;

    let offset = 0;
    while (offset + this.frameBytes <= buffer.length) {
      const frame = buffer.subarray(offset, offset + this.frameBytes);
      offset += this.frameBytes;
      this.processFrame(frame, events);
    }
    this.carry = Buffer.from(buffer.subarray(offset));
    return events;
  }

  private processFrame(frame: Buffer, events: VadEvent[]): void {
    this.elapsedMs += FRAME_MS;
    const rms = frameRms(frame);
    const open = this.openThreshold;
    // Closing is more forgiving than opening, so quiet syllables inside a
    // sentence do not end the turn.
    const close = open * 0.6;

    if (!this.speaking) {
      // Only adapt the noise floor while nobody is talking.
      this.noiseFloor = Math.min(0.05, Math.max(0.0005, this.noiseFloor * 0.95 + rms * 0.05));

      this.prefix.push(Buffer.from(frame));
      if (this.prefix.length > this.prefixFrames) this.prefix.shift();

      if (rms > open) {
        this.consecutiveSpeechFrames += 1;
        // Two frames (40 ms) of energy before we believe it.
        if (this.consecutiveSpeechFrames >= 2) {
          this.speaking = true;
          this.consecutiveSpeechFrames = 0;
          this.silenceMs = 0;
          this.speechMs = FRAME_MS * 2;
          this.utterance = [...this.prefix];
          this.prefix = [];
          events.push({ type: 'speech_started', atMs: this.elapsedMs });
        }
      } else {
        this.consecutiveSpeechFrames = 0;
      }
      return;
    }

    this.utterance.push(Buffer.from(frame));

    if (rms > close) {
      this.silenceMs = 0;
      this.speechMs += FRAME_MS;
    } else {
      this.silenceMs += FRAME_MS;
    }

    const utteranceMs = this.utterance.length * FRAME_MS;
    if (this.silenceMs >= this.options.silenceDurationMs || utteranceMs >= this.options.maxUtteranceMs) {
      events.push({
        type: 'speech_stopped',
        atMs: this.elapsedMs,
        speechMs: this.speechMs,
        audio: Buffer.concat(this.utterance),
      });
      this.endTurn();
    }
  }

  private endTurn(): void {
    this.speaking = false;
    this.utterance = [];
    this.prefix = [];
    this.silenceMs = 0;
    this.speechMs = 0;
    this.consecutiveSpeechFrames = 0;
  }

  /** Drop any buffered audio (used for buffer clear / cancel). */
  reset(): void {
    this.carry = Buffer.alloc(0);
    this.endTurn();
  }

  /** Shortest utterance we will bother transcribing. */
  get minSpeechMs(): number {
    return this.options.minSpeechMs;
  }
}
