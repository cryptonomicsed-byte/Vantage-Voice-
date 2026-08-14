/**
 * Splits an agent reply into speakable sentences.
 *
 * Ported from s2s server pipeline/sentenceChunker.ts (modelled on Hermes
 * Agent's tools.tts_streaming.SentenceChunker): accumulates text, strips
 * `<think>` blocks, and flushes complete sentences so TTS can start after
 * the first clause instead of after the whole reply.
 */

const OPEN_TAGS = ['<think>', '<thinking>', '<reasoning>'];
const CLOSE_TAGS = ['</think>', '</thinking>', '</reasoning>'];

export interface ChunkResult {
  /** Complete sentences, ready to synthesize. */
  sentences: string[];
  /** Visible (non-reasoning) text seen in this delta. */
  spoken: string;
  /** Reasoning text seen in this delta, for display only. */
  reasoning: string;
}

const EMPTY: ChunkResult = { sentences: [], spoken: '', reasoning: '' };

/** True when `text` ends with a strict prefix of any tag in `tags`. */
function pendingTagLength(text: string, tags: string[]): number {
  for (let take = Math.min(text.length, 12); take > 0; take--) {
    const tail = text.slice(text.length - take);
    if (tags.some((tag) => tag.length > tail.length && tag.startsWith(tail))) return take;
  }
  return 0;
}

function firstTagIndex(text: string, tags: string[]): { index: number; tag: string } | null {
  let best: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const index = text.indexOf(tag);
    if (index !== -1 && (best === null || index < best.index)) best = { index, tag };
  }
  return best;
}

export class SentenceChunker {
  private raw = '';
  private speech = '';
  private inThink = false;
  /** Maximum characters to hold before force-flushing at a soft boundary. */
  private readonly maxChars: number;

  constructor(maxChars = 220) {
    this.maxChars = maxChars;
  }

  push(delta: string): ChunkResult {
    if (!delta) return EMPTY;
    this.raw += delta;

    let spoken = '';
    let reasoning = '';

    // Consume everything except a possibly-incomplete trailing tag.
    for (;;) {
      if (!this.inThink) {
        const open = firstTagIndex(this.raw, OPEN_TAGS);
        if (open) {
          spoken += this.raw.slice(0, open.index);
          this.raw = this.raw.slice(open.index + open.tag.length);
          this.inThink = true;
          continue;
        }
        const hold = pendingTagLength(this.raw, OPEN_TAGS);
        spoken += this.raw.slice(0, this.raw.length - hold);
        this.raw = this.raw.slice(this.raw.length - hold);
        break;
      }

      const close = firstTagIndex(this.raw, CLOSE_TAGS);
      if (close) {
        reasoning += this.raw.slice(0, close.index);
        this.raw = this.raw.slice(close.index + close.tag.length);
        this.inThink = false;
        continue;
      }
      const hold = pendingTagLength(this.raw, CLOSE_TAGS);
      reasoning += this.raw.slice(0, this.raw.length - hold);
      this.raw = this.raw.slice(this.raw.length - hold);
      break;
    }

    this.speech += spoken;
    return { sentences: this.drainSentences(), spoken, reasoning };
  }

  /** Emit whatever is left at the end of the turn. */
  flush(): ChunkResult {
    const tail = this.raw;
    const wasThinking = this.inThink;
    this.raw = '';
    this.inThink = false;
    if (!wasThinking) this.speech += tail;

    const remainder = this.speech.trim();
    this.speech = '';
    return {
      sentences: remainder ? [remainder] : [],
      spoken: wasThinking ? '' : tail,
      reasoning: wasThinking ? tail : '',
    };
  }

  private drainSentences(): string[] {
    const out: string[] = [];
    for (;;) {
      const cut = this.findBoundary(this.speech);
      if (cut === -1) break;
      const sentence = this.speech.slice(0, cut).trim();
      this.speech = this.speech.slice(cut);
      if (sentence) out.push(sentence);
    }
    return out;
  }

  /** Index just past a sentence end, or -1. */
  private findBoundary(text: string): number {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (ch === '\n') {
        // A blank line or a newline after real content ends a chunk.
        if (text.slice(0, i).trim()) return i + 1;
        continue;
      }

      if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…' && ch !== '。' && ch !== '？' && ch !== '！') {
        continue;
      }

      // "3.5" / "e.g." style dots are not sentence ends.
      if (ch === '.') {
        const prev = text[i - 1];
        const next = text[i + 1];
        if (prev && /\d/.test(prev) && next && /\d/.test(next)) continue;
        if (prev && /[A-Z]/.test(prev) && (!next || next === ' ')) {
          // Single capital before a dot ("J. Smith") — keep going.
          const before = text[i - 2];
          if (!before || /[\s(]/.test(before)) continue;
        }
      }

      // Absorb trailing quotes/brackets and the following whitespace.
      let end = i + 1;
      while (end < text.length && '"\'”’)]'.includes(text[end])) end++;
      if (end >= text.length) return -1; // wait for more, it may still grow
      if (!/\s/.test(text[end])) continue;
      while (end < text.length && /\s/.test(text[end])) end++;
      if (text.slice(0, end).trim()) return end;
    }

    if (text.length > this.maxChars) {
      // Long run-on: cut at the last comma or space so speech keeps flowing.
      const window = text.slice(0, this.maxChars);
      const soft = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(' '));
      if (soft > 40) return soft + 1;
    }
    return -1;
  }
}

/**
 * Make model output speakable: drop markdown scaffolding, code fences, URLs
 * and stray symbols that a TTS voice would spell out.
 */
export function prepareSpokenText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
