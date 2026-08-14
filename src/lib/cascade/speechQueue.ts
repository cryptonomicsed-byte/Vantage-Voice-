/**
 * Ordered, look-ahead speech queue.
 *
 * Ported from s2s server pipeline/speechQueue.ts. Sentences arrive while
 * the agent reply is being chunked; synthesizing them one at a time would
 * leave a gap between every sentence, so the queue keeps a couple of
 * requests in flight and buffers whatever finishes early — audio is still
 * emitted strictly in order. `abort()` implements barge-in: kill synthesis
 * and drop everything not yet emitted.
 */

import type { Synthesizer } from './tts.js';

interface Job {
  text: string;
  chunks: Buffer[];
  started: boolean;
  done: boolean;
  error?: Error;
  controller: AbortController;
  wake: () => void;
  waiter: Promise<void>;
}

function makeJob(text: string): Job {
  const job: Partial<Job> = { text, chunks: [], started: false, done: false, controller: new AbortController() };
  arm(job as Job);
  return job as Job;
}

function arm(job: Job): void {
  job.waiter = new Promise<void>((resolve) => {
    job.wake = resolve;
  });
}

export interface SpeechQueueOptions {
  synthesizer: Synthesizer;
  voice: string;
  maxInFlight?: number;
  onChunk(pcm: Buffer): void;
  onSentenceStart?(text: string): void;
  onError(error: Error): void;
}

export class SpeechQueue {
  private jobs: Job[] = [];
  private pumping = false;
  private finished = false;
  private aborted = false;
  private idle: Promise<void> = Promise.resolve();
  private resolveIdle: (() => void) | null = null;
  private readonly maxInFlight: number;

  constructor(private options: SpeechQueueOptions) {
    this.maxInFlight = options.maxInFlight ?? 2;
  }

  /** Queue a sentence for synthesis. */
  enqueue(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.aborted || this.finished) return;

    if (this.jobs.length === 0 && !this.pumping) {
      this.idle = new Promise<void>((resolve) => {
        this.resolveIdle = resolve;
      });
    }
    this.jobs.push(makeJob(trimmed));
    this.fill();
    void this.pump();
  }

  /** No more sentences are coming; resolves once queued audio has been sent. */
  async finish(): Promise<void> {
    this.finished = true;
    await this.idle;
  }

  /** Barge-in: cancel synthesis and drop everything not yet emitted. */
  abort(): void {
    this.aborted = true;
    for (const job of this.jobs) {
      job.controller.abort();
      job.chunks = [];
      job.done = true;
      job.wake();
    }
    this.jobs = [];
    this.settleIdle();
  }

  private settleIdle(): void {
    this.resolveIdle?.();
    this.resolveIdle = null;
  }

  private fill(): void {
    if (this.aborted) return;
    let inFlight = this.jobs.filter((job) => job.started && !job.done).length;
    for (const job of this.jobs) {
      if (inFlight >= this.maxInFlight) break;
      if (job.started) continue;
      job.started = true;
      inFlight += 1;
      void this.run(job);
    }
  }

  private async run(job: Job): Promise<void> {
    // The synthesizer streams raw PCM16 over the network in arbitrary byte
    // chunks that don't respect 2-byte sample boundaries. Emitting them as-is
    // corrupts every sample after a chunk that splits mid-sample (heard as
    // static). Carry a dangling odd byte forward to the next chunk instead.
    let carry: Buffer | null = null;
    try {
      for await (const chunk of this.options.synthesizer.stream(job.text, this.options.voice, job.controller.signal)) {
        if (this.aborted) break;
        const combined: Buffer = carry ? Buffer.concat([carry, chunk]) : chunk;
        const usable: number = combined.length - (combined.length % 2);
        carry = usable < combined.length ? combined.subarray(usable) : null;
        if (usable > 0) {
          job.chunks.push(combined.subarray(0, usable));
          job.wake();
        }
      }
    } catch (error) {
      if (!this.aborted) job.error = error instanceof Error ? error : new Error(String(error));
    } finally {
      job.done = true;
      job.wake();
      this.fill();
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;

    try {
      while (this.jobs.length > 0 && !this.aborted) {
        const job = this.jobs[0];
        this.options.onSentenceStart?.(job.text);

        for (;;) {
          if (this.aborted) break;
          if (job.chunks.length > 0) {
            const chunk = job.chunks.shift()!;
            this.options.onChunk(chunk);
            continue;
          }
          if (job.done) break;
          await job.waiter;
          arm(job);
        }

        if (job.error && !this.aborted) this.options.onError(job.error);
        this.jobs.shift();
        this.fill();
      }
    } finally {
      this.pumping = false;
      if (this.jobs.length === 0) this.settleIdle();
    }
  }
}
