export type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type ConversationState = 
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted';

export type VoiceName = 
  | 'Zephyr'
  | 'Puck'
  | 'Charon'
  | 'Kore'
  | 'Fenrir'
  | 'Aoede'
  | 'Calliope'
  | 'Nova'
  | 'Ursa';

export interface Persona {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  defaultVoice: VoiceName;
  iconName: string;
  accentColor: string;
}

export interface TranscriptItem {
  id: string;
  sender: 'user' | 'model' | 'system' | 'tool';
  text: string;
  timestamp: string;
  isFinal?: boolean;
  toolName?: string;
  toolArgs?: Record<string, any>;
  audioBase64?: string;
  durationSeconds?: number;
  detectedLanguage?: string;
}

export type AgentFramework = 
  | 'native'
  | 'hermes'
  | 'open_claw'
  | 'langchain_react';

export interface AppSettings {
  personaId: string;
  customInstruction: string;
  voice: VoiceName;
  agentFramework: AgentFramework;
  vadSensitivity: number; // 0.01 to 0.15 RMS threshold
  silenceTimeoutMs: number; // milliseconds of silence before ending user turn
  enableBargeIn: boolean;
  enableTools: boolean;
  enableCodeInterpreter: boolean;
  enableClawCrawler: boolean;
  enableKnowledgeBase: boolean;
  autoSummarizeOnStop: boolean;
  translationMode: boolean;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  targetLanguageCode: string;
  pushToTalkMode: boolean;
  enableNoiseSuppression: boolean;
  enableVoiceIsolationGate: boolean;
  playbackSpeed: number; // AI speech playback rate multiplier (0.75 - 2.0)
  enableCamera: boolean;
  enableScreenShare: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface SessionSummary {
  executiveSummary: string;
  keyTakeaways: string[];
  actionItems: string[];
  sentiment: string;
  keyTopics: string[];
  agentFrameworkUsed?: string;
  totalTurns?: number;
  durationMinutes?: number;
  createdAt?: string;
}

export interface ServerToClientMessage {
  type: 'connected' | 'audio' | 'transcript' | 'interrupted' | 'status' | 'tool_call' | 'error' | 'pong';
  audio?: string; // Base64 PCM 24kHz audio chunk
  text?: string;
  sender?: 'user' | 'model';
  isFinal?: boolean;
  statusText?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  error?: string;
  timestamp?: string;
}

export interface ClientToServerMessage {
  type: 'config' | 'audio' | 'text' | 'interrupt' | 'video' | 'ping';
  config?: {
    model?: string;
    systemInstruction?: string;
    voice?: VoiceName;
    playbackSpeed?: number;
    translationConfig?: {
      targetLanguageCode: string;
      echoTargetLanguage?: boolean;
    };
    enableTools?: boolean;
  };
  audio?: string; // Base64 PCM 16kHz audio chunk
  text?: string; // Text input fallback
  video?: {
    data: string; // Base64 image chunk
    mimeType: string;
  };
}

export interface LatencyMetrics {
  timeToFirstAudioMs: number | null;
  roundTripLatencyMs: number | null;
  packetsSent: number;
  packetsReceived: number;
  lastAudioReceivedTime: number | null;
  latencyHistory: number[]; // Last 10 latency measurements in ms
}
