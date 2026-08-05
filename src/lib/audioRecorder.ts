import { calculatePeakLevel, calculateRMS, float32ToInt16PCM, pcmToBase64, resampleAudioBuffer } from './audioUtils';

export interface AudioRecorderCallbacks {
  onAudioData: (base64Pcm16k: string, rms: number, peak: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onVADVolumeChange?: (rms: number, peak: number) => void;
  onError?: (err: Error) => void;
}

export class AudioRecorder {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private isRecording: boolean = false;
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private targetSampleRate: number = 16000;
  private vadThreshold: number = 0.02; // RMS sensitivity
  private silenceTimeoutMs: number = 1200;
  private enableDSPFilters: boolean = true;
  private enableVoiceIsolationGate: boolean = true;
  private estimatedNoiseFloor: number = 0.005;
  private callbacks: AudioRecorderCallbacks;

  constructor(callbacks: AudioRecorderCallbacks) {
    this.callbacks = callbacks;
  }

  public setVADThreshold(threshold: number) {
    this.vadThreshold = threshold;
  }

  public setSilenceTimeout(timeoutMs: number) {
    this.silenceTimeoutMs = timeoutMs;
  }

  public setNoiseSuppressionConfig(enableFilters: boolean, enableIsolationGate: boolean) {
    this.enableDSPFilters = enableFilters;
    this.enableVoiceIsolationGate = enableIsolationGate;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public async start(): Promise<boolean> {
    if (this.isRecording) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // Support browser-native voice isolation if supported
          ...({ voiceIsolation: true } as any),
        },
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const nativeSampleRate = this.audioCtx.sampleRate;
      this.mediaSource = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Create Web Audio DSP Filters for Speech Bandpass
      this.highPassFilter = this.audioCtx.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.setValueAtTime(90, this.audioCtx.currentTime); // Cut HVAC rumble & AC hum (<90Hz)

      this.lowPassFilter = this.audioCtx.createBiquadFilter();
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.setValueAtTime(3800, this.audioCtx.currentTime); // Cut high fan hiss (>3.8kHz)

      // Connect DSP chain: source -> highPass -> lowPass -> scriptProcessor -> destination
      if (this.enableDSPFilters) {
        this.mediaSource.connect(this.highPassFilter);
        this.highPassFilter.connect(this.lowPassFilter);
        this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1);
        this.lowPassFilter.connect(this.scriptProcessor);
      } else {
        this.scriptProcessor = this.audioCtx.createScriptProcessor(4096, 1, 1);
        this.mediaSource.connect(this.scriptProcessor);
      }

      this.scriptProcessor.connect(this.audioCtx.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isRecording || this.isMuted) return;

        const rawInputData = e.inputBuffer.getChannelData(0);
        const inputChannelData = new Float32Array(rawInputData.length);
        inputChannelData.set(rawInputData);
        
        // Calculate RMS and Peak level for Voice Activity Detection & visualization
        const rms = calculateRMS(inputChannelData);
        const peak = calculatePeakLevel(inputChannelData);
        if (this.callbacks.onVADVolumeChange) {
          this.callbacks.onVADVolumeChange(rms, peak);
        }

        // Dynamically update estimated background noise floor during non-speech periods
        if (rms < this.vadThreshold) {
          this.estimatedNoiseFloor = this.estimatedNoiseFloor * 0.95 + rms * 0.05;
        }

        // Voice Isolation Noise Gate Logic:
        // If voice isolation gate is enabled and volume is below speech threshold,
        // zero out or suppress ambient noise samples so background chatter/fan is ignored.
        const isVoiceDetected = rms > this.vadThreshold;

        if (this.enableVoiceIsolationGate && !isVoiceDetected) {
          // Attenuate ambient background noise by 95%
          for (let i = 0; i < inputChannelData.length; i++) {
            inputChannelData[i] *= 0.05;
          }
        }

        // VAD State Machine
        if (isVoiceDetected) {
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            if (this.callbacks.onSpeechStart) {
              this.callbacks.onSpeechStart();
            }
          }
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }
        } else if (this.isSpeaking) {
          if (!this.silenceTimer) {
            this.silenceTimer = setTimeout(() => {
              this.isSpeaking = false;
              if (this.callbacks.onSpeechEnd) {
                this.callbacks.onSpeechEnd();
              }
              this.silenceTimer = null;
            }, this.silenceTimeoutMs);
          }
        }

        // Resample to 16kHz for Gemini API input
        const resampledData = resampleAudioBuffer(
          inputChannelData,
          nativeSampleRate,
          this.targetSampleRate
        );

        // Convert Float32 to Int16 PCM
        const int16PCM = float32ToInt16PCM(resampledData);
        const base64Pcm = pcmToBase64(int16PCM);

        this.callbacks.onAudioData(base64Pcm, rms, peak);
      };

      this.isRecording = true;
      return true;
    } catch (err: any) {
      console.error('Failed to start microphone recording:', err);
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
      this.stop();
      return false;
    }
  }

  public stop() {
    this.isRecording = false;
    this.isSpeaking = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.highPassFilter) {
      this.highPassFilter.disconnect();
      this.highPassFilter = null;
    }

    if (this.lowPassFilter) {
      this.lowPassFilter.disconnect();
      this.lowPassFilter = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}
