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
  | 'open_human'
  | 'langchain_react';

export interface RosterMember {
  id: string; // 'native' | 'hermes' | 'open_claw'
  displayName: string;
  backend: 'native' | 'hermes' | 'open_claw';
  voice: VoiceName;
}

export interface AppSettings {
  personaId: string;
  customInstruction: string;
  voice: VoiceName;
  agentFramework: AgentFramework;
  hermesAgentKey: string; // X-Agent-Key for Vantage's real Hermes agent bridge; blank = use server default
  openClawAgentKey: string; // X-Agent-Key for Vantage's real OpenClaw agent bridge; blank = use server default
  multiAgentEnabled: boolean; // real orchestrated multi-agent turn-taking; see docs/MULTI_AGENT_ORCHESTRATION.md
  roster: RosterMember[]; // active only when multiAgentEnabled && length > 1
  vadSensitivity: number; // 0.01 to 0.15 RMS threshold
  silenceTimeoutMs: number; // milliseconds of silence before ending user turn
  enableBargeIn: boolean;
  enableTools: boolean;
  enableResearchTools: boolean;
  enableCodeInterpreter: boolean;
  enableComputerControl: boolean;
  enableCommunicationTools: boolean;
  enableDevTools: boolean;
  enableDomainCustomTools: boolean;
  enableModernMetaTools: boolean;
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
  visualizerStyle: 'orb' | 'bars' | 'wave' | 'pulse';
  enableCamera: boolean;
  enableScreenShare: boolean;
  enableVoiceOutput: boolean; // Toggle voice playback on/off (if off, text-only response mode)
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

export type MemoryTier = 'secure' | 'personal' | 'regular';

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  category: string;
  tier: MemoryTier;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  isMasked?: boolean;
}

export interface ServerToClientMessage {
  type: 'connected' | 'audio' | 'transcript' | 'interrupted' | 'status' | 'tool_call' | 'error' | 'pong' | 'apply_setting';
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

export interface VoiceCommandLogItem {
  id: string;
  commandType: 'memory_store' | 'persona_switch' | 'speed_change' | 'general_action';
  rawCommand: string;
  parsedAction: string;
  timestamp: string;
  status: 'executed' | 'pending' | 'failed';
  details?: Record<string, any>;
}

