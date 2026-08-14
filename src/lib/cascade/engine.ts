/**
 * Cascade voice engine for Vantage-Voice.
 *
 * Port of the s2s CascadeProvider (server VAD -> speech-to-text -> agent
 * bridge -> streaming text-to-speech, barge-in via VAD) adapted to
 * Vantage-Voice's existing wire contract, so the client needs ZERO changes:
 *
 *   in:  {type:'audio', audio:<base64 PCM16 16kHz>}  (client mic stream)
 *        {type:'text',  text:<string>}               (typed input)
 *        {type:'interrupt'}                          (manual cancel)
 *   out: {type:'connected'|'audio'|'transcript'|'interrupted'|'error'|'status'}
 *
 * The agent brain is the existing bridgeToAgent (sessionful Hermes gateway)
 * — this engine is audio pipe only. The Gemini path is never touched here;
 * it is gated in server.ts.
 */

import { CASCADE_SAMPLE_RATE, CLIENT_MIC_SAMPLE_RATE, pcmDurationMs, resamplePcm16 } from './audio.js';
import { EnergyVad } from './vad.js';
import { createTranscriber } from './stt.js';
import { createSynthesizer, type Synthesizer } from './tts.js';
import { SentenceChunker, prepareSpokenText } from './sentenceChunker.js';
import { SpeechQueue } from './speechQueue.js';

export interface CascadeEngineOptions {
  /** Outbound event sink (server's sendToClient). */
  onEvent(event: Record<string, unknown>): void;
  /** Real agent brain: full reply text for a user utterance. */
  bridge(text: string): Promise<string>;
  /** Current voice selection (client config voice name). */
  getVoice(): string;
  /** Stable label for logs, e.g. 'hermes_contabo'. */
  backend: string;
  vad?: { threshold?: number; prefixPaddingMs?: number; silenceDurationMs?: number };
}

const BARGE_IN_THRESHOLD_BOOST = 0.2;

export class CascadeEngine {
  private vad: EnergyVad;
  private transcriber = createTranscriber();
  private synthesizer: Synthesizer = createSynthesizer();

  private stopped = false;
  private turnCounter = 0;

  /** Turn currently in flight (bridge fetch + speech). */
  private pendingTurn: Promise<void> = Promise.resolve();
  private speech: SpeechQueue | null = null;
  private speaking = false;

  /** Barge-in: supersede the in-flight turn so its late reply is discarded. */
  private supersede(): void {
    this.pendingSuperseded?.();
    this.speech?.abort();
    this.speech = null;
    this.speaking = false;
    if (!this.stopped) {
      this.onEvent({ type: 'interrupted' });
    }
  }

  constructor(private options: CascadeEngineOptions) {
    this.vad = new EnergyVad({
      sampleRate: CASCADE_SAMPLE_RATE,
      threshold: options.vad?.threshold ?? 0.5,
      prefixPaddingMs: options.vad?.prefixPaddingMs ?? 300,
      silenceDurationMs: options.vad?.silenceDurationMs ?? 500,
    });
  }

  get sttLabel(): string {
    return `${this.transcriber.name}/${this.transcriber.model}`;
  }

  get ttsLabel(): string {
    return `${this.synthesizer.name}/${this.synthesizer.model}`;
  }

  start(): void {
    this.log(`cascade voice engine online (backend=${this.options.backend}, stt=${this.sttLabel}, tts=${this.ttsLabel})`);
    this.onEvent({
      type: 'connected',
      statusText: `Connected to cascade voice engine (STT: ${this.sttLabel}, TTS: ${this.ttsLabel}, agent: ${this.options.backend})`,
    });
  }

  /** Feed a client audio frame: base64 PCM16 at the client mic rate (16 kHz). */
  pushAudio(base64: string): void {
    if (this.stopped) return;
    let pcm: Buffer;
    try {
      pcm = Buffer.from(base64, 'base64');
    } catch {
      return;
    }
    const audio = resamplePcm16(pcm, CLIENT_MIC_SAMPLE_RATE, CASCADE_SAMPLE_RATE);
    for (const event of this.vad.push(audio)) {
      if (event.type === 'speech_started') {
        this.log('VAD: speech started');
        // Barge-in: the moment the user speaks, the assistant stops.
        if (this.speaking || this.speech) {
          this.log('VAD: BARGE-IN — user speech interrupted assistant playback');
          this.supersede();
        }
        continue;
      }
      this.log(`VAD: speech stopped (${Math.round(event.speechMs)}ms)`);
      if (event.speechMs < this.vad.minSpeechMs) {
        this.log(`ignored ${Math.round(event.speechMs)}ms blip`);
        this.onEvent({ type: 'status', statusText: 'listening (utterance too short)' });
        continue;
      }
      const itemId = `item_${++this.turnCounter}`;
      this.queueTurn(event.audio, itemId);
    }
  }

  /** Typed input — same turn machinery, no microphone involved. */
  pushText(text: string): void {
    if (this.stopped || !text.trim()) return;
    const itemId = `item_${++this.turnCounter}`;
    this.queueTurn(null, itemId, text.trim());
  }

  cancel(): void {
    this.log('manual interrupt');
    this.supersede();
  }

  stop(): void {
    this.stopped = true;
    this.supersede();
    this.vad.reset();
  }

  private log(message: string): void {
    console.log(`[Cascade:${this.options.backend}] ${message}`);
  }

  private onEvent(event: Record<string, unknown>): void {
    try {
      this.options.onEvent(event);
    } catch (err) {
      console.warn('[Cascade] event sink failed:', err instanceof Error ? err.message : err);
    }
  }

  /** Serialise turns so overlapping speech can never interleave two responses. */
  private queueTurn(pcm: Buffer | null, itemId: string, typedText?: string): void {
    this.pendingTurn = this.pendingTurn
      .catch(() => undefined)
      .then(() => this.runTurn(pcm, itemId, typedText));
  }

  private async runTurn(pcm: Buffer | null, itemId: string, typedText?: string): Promise<void> {
    if (this.stopped) return;

    let text = typedText ?? '';
    if (pcm) {
      try {
        this.onEvent({ type: 'status', statusText: 'transcribing…' });
        const result = await this.transcriber.transcribe(pcm);
        if (this.stopped) return;
        this.log(`STT: ${Math.round(pcmDurationMs(pcm, CASCADE_SAMPLE_RATE))}ms audio -> "${result.text}" (${result.latencyMs}ms)`);
        text = result.text;
      } catch (error) {
        this.log(`STT error: ${error instanceof Error ? error.message : error}`);
        this.onEvent({
          type: 'error',
          error: `Speech recognition failed: ${error instanceof Error ? error.message : error}`,
        });
        this.onEvent({ type: 'status', statusText: 'listening' });
        return;
      }
    }

    if (!text.trim()) {
      this.log('empty transcript');
      this.onEvent({ type: 'status', statusText: 'listening' });
      return;
    }

    this.onEvent({ type: 'transcript', sender: 'user', text, isFinal: true });

    // Agent turn. Track supersession so a barge-in mid-fetch discards the
    // late reply instead of speaking over the user.
    let superseded = false;
    const turnSuperseded = () => {
      superseded = true;
    };
    this.pendingSuperseded = turnSuperseded;

    const chunker = new SentenceChunker();
    const speech = new SpeechQueue({
      synthesizer: this.synthesizer,
      voice: this.options.getVoice(),
      onChunk: (chunk) => {
        this.onEvent({ type: 'audio', audio: chunk.toString('base64') });
      },
      onSentenceStart: (sentence) => {
        this.log(`TTS: speaking "${sentence.slice(0, 80)}${sentence.length > 80 ? '…' : ''}"`);
      },
      onError: (error) => {
        this.log(`TTS error: ${error.message}`);
        this.onEvent({ type: 'error', error: `Speech synthesis failed: ${error.message}` });
      },
    });
    this.speech = speech;

    const speak = (sentences: string[]): void => {
      for (const sentence of sentences) {
        const spoken = prepareSpokenText(sentence);
        if (spoken) speech.enqueue(spoken);
      }
    };

    this.onEvent({ type: 'status', statusText: `${this.options.backend} is thinking…` });

    let assistantText = '';
    let failure: string | null = null;
    try {
      const started = Date.now();
      const reply = await this.options.bridge(text);
      this.log(`AGENT: ${this.options.backend} turn took ${Date.now() - started}ms, reply ${reply.length} chars`);
      if (this.stopped || superseded) {
        this.log('AGENT: reply discarded (superseded by barge-in / stop)');
        return;
      }
      this.onEvent({
        type: 'transcript',
        sender: 'tool',
        toolName: this.options.backend,
        text: reply,
        isFinal: true,
      });
      chunker.push(reply);
      const tail = chunker.flush();
      speak(tail.sentences);
      assistantText = tail.spoken;
      if (tail.sentences.length > 0) this.speaking = true;
      await speech.finish();
      if (this.speech === speech) this.speaking = false;
    } catch (error) {
      if (this.stopped || superseded) return;
      failure = error instanceof Error ? error.message : String(error);
      this.log(`AGENT turn failed: ${failure}`);
      this.onEvent({ type: 'error', error: `${this.options.backend} agent bridge failed: ${failure}` });
    } finally {
      this.pendingSuperseded = null;
      if (this.speech === speech) {
        this.speech = null;
        this.speaking = false;
      }
    }

    if (this.stopped || superseded) return;

    if (assistantText.trim()) {
      this.onEvent({ type: 'transcript', sender: 'model', text: assistantText.trim(), isFinal: true });
    }
    this.onEvent({ type: 'status', statusText: 'listening' });
    if (failure) return;
    this.log(`TURN complete: "${assistantText.trim().slice(0, 100)}${assistantText.trim().length > 100 ? '…' : ''}"`);
  }

  private pendingSuperseded: (() => void) | null = null;
}
