/**
 * Runtime credential loading for the cascade voice engine.
 *
 * Keys are read from the 0600 file ~/.vv-cascade-keys.env on this machine
 * (or the process environment, which wins when set). NEVER commit keys,
 * never put them in argv/ps/shell history — the file is the source of
 * truth at runtime AND at deploy time on Contabo (scp'd with 0600 perms).
 *
 * File format (plain KEY=value lines, same as a .env):
 *   GROQ_API_KEY=...
 *   ELEVENLABS_API_KEY=...
 *   DEEPSEEK_API_KEY=...
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const KEY_FILE_CANDIDATES = [
  path.join(os.homedir(), '.vv-cascade-keys.env'),
  path.join(process.cwd(), '.vv-cascade-keys.env'),
  '/root/.vv-cascade-keys.env',
];

export interface CascadeKeys {
  groqApiKey: string;
  elevenLabsApiKey: string;
  deepseekApiKey: string;
}

let cached: CascadeKeys | null = null;
let lastMtimeMs = 0;

function readKeyFile(): Record<string, string> {
  for (const candidate of KEY_FILE_CANDIDATES) {
    try {
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      const raw = fs.readFileSync(candidate, 'utf-8');
      const out: Record<string, string> = {};
      for (const line of raw.split('\n')) {
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim().replace(/^"|"$/g, '');
        if (key && value) out[key] = value;
      }
      return out;
    } catch {
      /* try next candidate */
    }
  }
  return {};
}

/** Load keys once, then re-read only if the file changed (cheap freshness). */
export function getCascadeKeys(): CascadeKeys {
  let mtimeMs = 0;
  for (const candidate of KEY_FILE_CANDIDATES) {
    try {
      mtimeMs = fs.statSync(candidate).mtimeMs;
      break;
    } catch {
      /* keep going */
    }
  }
  if (!cached || mtimeMs !== lastMtimeMs) {
    const file = readKeyFile();
    cached = {
      groqApiKey: process.env.GROQ_API_KEY || file.GROQ_API_KEY || '',
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || file.ELEVENLABS_API_KEY || '',
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || file.DEEPSEEK_API_KEY || '',
    };
    lastMtimeMs = mtimeMs;
  }
  return cached;
}

/** STT endpoint config: Groq Whisper via the OpenAI-compatible override (same as s2s). */
export const STT_BASE_URL = 'https://api.groq.com/openai/v1';
export const STT_MODEL = 'whisper-large-v3-turbo';
export const TTS_MODEL = 'eleven_flash_v2_5';
/** s2s default voice; overridable via ELEVENLABS_VOICE_ID. */
export const TTS_DEFAULT_VOICE =
  process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

/** True when the requested voice name is a raw ElevenLabs voice id (20+ chars, alnum). */
export function isElevenLabsVoiceId(voice: string): boolean {
  return /^[A-Za-z0-9]{20,}$/.test(voice);
}
