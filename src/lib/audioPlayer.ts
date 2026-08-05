import { base64ToFloat32PCM, calculatePeakLevel, calculateRMS } from './audioUtils';

export class AudioPlayer {
  private audioCtx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate: number = 24000; // Gemini Live API output sample rate
  private volumeNode: GainNode | null = null;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1.0;
  private currentVolumeRMS: number = 0;
  private onVolumeChange?: (rms: number, peak: number) => void;
  private onPlaybackEnded?: () => void;
  private checkEndingTimer: NodeJS.Timeout | null = null;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  public setPlaybackSpeed(speed: number) {
    this.playbackSpeed = Math.max(0.5, Math.min(2.0, speed));
  }

  public setVolumeCallback(cb: (rms: number, peak: number) => void) {
    this.onVolumeChange = cb;
  }

  public setEndedCallback(cb: () => void) {
    this.onPlaybackEnded = cb;
  }

  private initContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
      this.volumeNode = this.audioCtx.createGain();
      this.volumeNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Enqueues a base64 encoded PCM 24kHz chunk for gapless playback.
   */
  public playChunk(base64Audio: string) {
    this.initContext();
    if (!this.audioCtx || !this.volumeNode) return;

    try {
      const float32PCM = base64ToFloat32PCM(base64Audio);
      if (float32PCM.length === 0) return;

      // Calculate RMS and Peak level for visualizer
      const rms = calculateRMS(float32PCM);
      const peak = calculatePeakLevel(float32PCM);
      this.currentVolumeRMS = rms;
      if (this.onVolumeChange) {
        this.onVolumeChange(rms, peak);
      }

      // Create audio buffer
      const buffer = this.audioCtx.createBuffer(1, float32PCM.length, this.sampleRate);
      buffer.getChannelData(0).set(float32PCM);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this.playbackSpeed;
      source.connect(this.volumeNode);

      const currentTime = this.audioCtx.currentTime;
      // Schedule chunk sequentially for gapless audio adjusted for playback speed
      const startTime = Math.max(currentTime, this.nextStartTime);
      source.start(startTime);
      const chunkDuration = buffer.duration / this.playbackSpeed;
      this.nextStartTime = startTime + chunkDuration;

      this.activeSources.add(source);
      this.isPlaying = true;

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0) {
          this.isPlaying = false;
          if (this.onVolumeChange) this.onVolumeChange(0, 0);
          if (this.onPlaybackEnded) this.onPlaybackEnded();
        }
      };

      this.scheduleEndingCheck();
    } catch (err) {
      console.error('Error playing audio chunk in AudioPlayer:', err);
    }
  }

  /**
   * Instantly halts all active audio playback and clears the playback queue.
   * Called during barge-in / user interruption.
   */
  public interrupt() {
    this.activeSources.forEach((source) => {
      try {
        source.stop(0);
        source.disconnect();
      } catch (e) {
        // Ignore if already stopped
      }
    });
    this.activeSources.clear();
    this.isPlaying = false;
    this.currentVolumeRMS = 0;
    if (this.audioCtx) {
      this.nextStartTime = this.audioCtx.currentTime;
    }
    if (this.onVolumeChange) {
      this.onVolumeChange(0, 0);
    }
    if (this.checkEndingTimer) {
      clearTimeout(this.checkEndingTimer);
    }
  }

  public setVolume(level: number) {
    if (this.volumeNode) {
      this.volumeNode.gain.value = Math.max(0, Math.min(1, level));
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public close() {
    this.interrupt();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
    this.audioCtx = null;
  }

  private scheduleEndingCheck() {
    if (this.checkEndingTimer) clearTimeout(this.checkEndingTimer);
    this.checkEndingTimer = setTimeout(() => {
      if (this.activeSources.size === 0) {
        this.isPlaying = false;
        if (this.onVolumeChange) this.onVolumeChange(0, 0);
      }
    }, 300);
  }
}
