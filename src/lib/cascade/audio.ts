/**
 * Cascade audio utilities (adapted from s2s server util/wav.ts + client
 * audioUtils.ts for Vantage-Voice's wire contract):
 *   - client mic streams base64 PCM16 at 16 kHz (audioRecorder)
 *   - client player consumes base64 PCM16 at 24 kHz (audioPlayer)
 *   - the cascade pipeline runs everything at 24 kHz (same SAMPLE_RATE as s2s)
 * so ingress audio is linearly upsampled 16k -> 24k before VAD/STT.
 */

export const CASCADE_SAMPLE_RATE = 24000;
export const CLIENT_MIC_SAMPLE_RATE = 16000;

/** Linear interpolation upsample of int16 PCM (the client's own resampler, generalized). */
export function resamplePcm16(src: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return src;
  const ratio = fromRate / toRate; // source position per output sample
  const outLen = Math.round(src.length / 2 / ratio) * 2;
  const out = Buffer.alloc(outLen);
  const sampleCount = outLen / 2;
  for (let i = 0; i < sampleCount; i++) {
    const origin = i * ratio;
    const lo = Math.floor(origin);
    const hi = Math.min(src.length / 2 - 1, Math.ceil(origin));
    const frac = origin - lo;
    const a = src.readInt16LE(lo * 2);
    const b = src.readInt16LE(hi * 2);
    out.writeInt16LE(Math.round(a * (1 - frac) + b * frac), i * 2);
  }
  return out;
}

/** Encode mono int16 PCM as a WAV container (required by OpenAI-compatible STT). */
export function encodeWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  pcm.copy(buf, 44);
  return buf;
}

export function pcmDurationMs(pcm: Buffer, sampleRate: number): number {
  return (pcm.length / 2 / sampleRate) * 1000;
}
