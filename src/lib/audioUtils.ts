/**
 * Utility functions for Speech-to-Speech audio processing:
 * - Converting Float32 Web Audio buffers to 16-bit PCM (16kHz)
 * - Base64 encoding/decoding for WebSocket messages
 * - RMS calculation for Voice Activity Detection (VAD)
 */

/**
 * Calculates the Root Mean Square (RMS) audio level from a Float32 channel array.
 * Values range from 0.0 (silence) to 1.0 (full volume).
 */
export function calculateRMS(float32Array: Float32Array): number {
  if (!float32Array || float32Array.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < float32Array.length; i++) {
    sumSquares += float32Array[i] * float32Array[i];
  }
  return Math.sqrt(sumSquares / float32Array.length);
}

/**
 * Calculates the Peak audio level (0.0 to 1.0) from a Float32 channel array.
 */
export function calculatePeakLevel(float32Array: Float32Array): number {
  if (!float32Array || float32Array.length === 0) return 0;
  let maxAbs = 0;
  for (let i = 0; i < float32Array.length; i++) {
    const abs = Math.abs(float32Array[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  return maxAbs;
}

/**
 * Converts Float32 audio samples (standard Web Audio API) to Int16 PCM data.
 */
export function float32ToInt16PCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp sample between -1.0 and 1.0
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

/**
 * Converts an Int16Array buffer into a Base64 string.
 */
export function pcmToBase64(int16Array: Int16Array): string {
  const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string of raw 16-bit PCM audio back into a Float32Array
 * suitable for playback with Web Audio AudioBuffer.
 */
export function base64ToFloat32PCM(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / (int16[i] < 0 ? 32768 : 32767);
  }
  
  return float32;
}

/**
 * Simple linear resampling utility to downsample or upsample audio buffer to 16000Hz
 * if the browser AudioContext runs at a native rate like 44100Hz or 48000Hz.
 */
export function resampleAudioBuffer(
  inputBuffer: Float32Array,
  fromSampleRate: number,
  toSampleRate: number = 16000
): Float32Array {
  if (fromSampleRate === toSampleRate) {
    return inputBuffer;
  }
  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.round(inputBuffer.length / ratio);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const originIndex = i * ratio;
    const indexFloor = Math.floor(originIndex);
    const indexCeil = Math.min(inputBuffer.length - 1, Math.ceil(originIndex));
    const interpolationFraction = originIndex - indexFloor;
    
    result[i] =
      inputBuffer[indexFloor] * (1 - interpolationFraction) +
      inputBuffer[indexCeil] * interpolationFraction;
  }
  
  return result;
}
