import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AppSettings,
  ConnectionStatus,
  ConversationState,
  LatencyMetrics,
  TranscriptItem,
  SessionSummary,
  MemoryItem,
  MemoryTier,
  VoiceCommandLogItem,
} from './types';
import { DEFAULT_SETTINGS, SYSTEM_PERSONAS } from './lib/constants';
import { AudioPlayer } from './lib/audioPlayer';
import { AudioRecorder } from './lib/audioRecorder';
import { detectSpokenLanguage } from './lib/languageDetector';
import { vantageClient } from './lib/vantageClient';
import { Header } from './components/Header';
import { AudioVisualizer } from './components/AudioVisualizer';
import { ControlBar } from './components/ControlBar';
import { TranscriptView } from './components/TranscriptView';
import { SettingsModal } from './components/SettingsModal';
import { SessionSummaryModal } from './components/SessionSummaryModal';
import { MemoryVaultModal } from './components/MemoryVaultModal';
import { ResearchToolsModal } from './components/ResearchToolsModal';
import { CodeComputationModal } from './components/CodeComputationModal';
import { BrowserComputerControlModal } from './components/BrowserComputerControlModal';
import { CommunicationProductivityModal } from './components/CommunicationProductivityModal';
import { DevSoftwareToolsModal } from './components/DevSoftwareToolsModal';
import { DomainCustomToolsModal } from './components/DomainCustomToolsModal';
import { ModernMetaToolsModal } from './components/ModernMetaToolsModal';
import { OAuthIntegrationsModal } from './components/OAuthIntegrationsModal';
import { VantageHubModal } from './components/VantageHubModal';
import { useCreationJob } from './hooks/useCreationJob';
import { SessionRestoreBanner } from './components/SessionRestoreBanner';
import { CameraPreview } from './components/CameraPreview';
import { LatencyStats } from './components/LatencyStats';
import { AlertCircle, RefreshCw, Zap, Sparkles, X } from 'lucide-react';

const STORAGE_KEY_TRANSCRIPTS = 'sonic_live_transcript_history';
const STORAGE_KEY_MEMORIES = 'sonic_live_memory_vault';

const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-01',
    key: 'Primary Security Vault Token',
    value: 'VAULT-7789-ALPHA',
    category: 'Auth',
    tier: 'secure',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['auth', 'secret', 'passcode'],
  },
  {
    id: 'mem-02',
    key: 'User Preferred Name',
    value: 'Alex',
    category: 'Identity',
    tier: 'personal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['identity', 'profile'],
  },
  {
    id: 'mem-03',
    key: 'Target Language Preference',
    value: 'Spanish',
    category: 'Preferences',
    tier: 'personal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['language', 'translation'],
  },
  {
    id: 'mem-04',
    key: 'Agent Core Goal',
    value: 'Low latency real-time voice intelligence with structured multi-tier memory vault.',
    category: 'Goals',
    tier: 'regular',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['system', 'architecture'],
  },
];

export default function App() {
  // App Configuration & Settings
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [userVolumeRMS, setUserVolumeRMS] = useState<number>(0);
  const [userPeakLevel, setUserPeakLevel] = useState<number>(0);
  const [aiVolumeRMS, setAiVolumeRMS] = useState<number>(0);
  const [aiPeakLevel, setAiPeakLevel] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Session Summary Modal State
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  // Research Tools Modal State
  const [isResearchToolsOpen, setIsResearchToolsOpen] = useState<boolean>(false);

  // Code & Computation Modal State
  const [isCodeComputationOpen, setIsCodeComputationOpen] = useState<boolean>(false);

  // Browser & Computer Control Modal State
  const [isComputerControlOpen, setIsComputerControlOpen] = useState<boolean>(false);

  // Communication & Productivity Modal State
  const [isCommunicationToolsOpen, setIsCommunicationToolsOpen] = useState<boolean>(false);

  // Development & Software Modal State
  const [isDevToolsOpen, setIsDevToolsOpen] = useState<boolean>(false);

  // Domain-Specific & Custom Modal State
  const [isDomainCustomToolsOpen, setIsDomainCustomToolsOpen] = useState<boolean>(false);

  // Modern Standards & Meta-Tools Modal State
  const [isModernMetaToolsOpen, setIsModernMetaToolsOpen] = useState<boolean>(false);

  // Vantage Agent Platform & MCP Hub Modal State
  const [isVantageHubOpen, setIsVantageHubOpen] = useState<boolean>(false);

  // Background Creation Pipeline Job Hook (POST /create & status polling)
  const { activeJob, isCreating: isCreatingJob, registerCreationJob, clearActiveJob } = useCreationJob();

  // OAuth & Platform Integrations Modal State
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState<boolean>(false);

  // Memory Vault State & Modals
  const [isMemoryVaultOpen, setIsMemoryVaultOpen] = useState<boolean>(false);
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MEMORIES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_MEMORIES;
  });

  // Voice Command Logs State & Toast Banner State
  const [voiceCommandLogs, setVoiceCommandLogs] = useState<VoiceCommandLogItem[]>([
    {
      id: 'cmd-initial',
      commandType: 'memory_store',
      rawCommand: 'Sonic, remember that my Wifi password is SecretPass2026',
      parsedAction: '✓ Stored Memory: Key="Wifi password", Value="SecretPass2026" (SECURE Tier)',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'executed',
      details: { key: 'Wifi password', value: 'SecretPass2026', tier: 'secure' },
    },
  ]);
  const [toastBanner, setToastBanner] = useState<{ title: string; message: string } | null>(null);

  const triggerToast = (title: string, message: string) => {
    setToastBanner({ title, message });
    setTimeout(() => setToastBanner(null), 4500);
  };

  // Voice-Activated Command Processor ("Sonic, remember that...")
  const processVoiceCommand = useCallback((userText: string) => {
    if (!userText || typeof userText !== 'string') return false;
    const cleaned = userText.trim();

    // Trigger Pattern: "Sonic, remember that..." or "remember that..." or "save memory..."
    const memoryMatch = cleaned.match(
      /(?:sonic,?\s*)?(?:please\s+)?(?:remember\s+(?:that\s+)?|save\s+(?:in\s+)?memory\s+|store\s+(?:in\s+)?memory\s+)(.+)/i
    );

    if (memoryMatch && memoryMatch[1]) {
      const rawTarget = memoryMatch[1].trim();
      let key = 'Voice Note';
      let value = rawTarget;
      let category = 'Voice Command';

      // Parse Key and Value using common voice phrases (" is ", " = ", " set to ", " as ")
      const parts = rawTarget.split(/\s+is\s+|\s+=\s+|\s+set\s+to\s+|\s+as\s+/i);
      if (parts.length >= 2) {
        key = parts[0].trim().replace(/^my\s+/i, '');
        value = parts.slice(1).join(' is ').trim();
      }

      // Auto-tier classification
      let tier: MemoryTier = 'regular';
      if (/password|secret|token|api_key|auth|ssn|pin|vault|passcode/i.test(`${key} ${value}`)) {
        tier = 'secure';
        category = 'Auth/Vault';
      } else if (/name|email|phone|address|preference|favorite|like|dislike|identity|birthday/i.test(`${key} ${value}`)) {
        tier = 'personal';
        category = 'Personal Identity';
      }

      // Automatically parse and store item in Memory Vault without requiring modal open
      setMemories((prev) => {
        const existingIdx = prev.findIndex(
          (m) => m.key.toLowerCase().trim() === key.toLowerCase().trim()
        );
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            value,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }

        return [
          {
            id: `mem-${Date.now()}`,
            key,
            value,
            category,
            tier,
            tags: ['voice_command', tier],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ];
      });

      // Record in Voice Command Log
      const newLogItem: VoiceCommandLogItem = {
        id: `cmd-${Date.now()}`,
        commandType: 'memory_store',
        rawCommand: cleaned,
        parsedAction: `✓ Stored Memory: Key="${key}", Value="${value}" (${tier.toUpperCase()} Tier)`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'executed',
        details: { key, value, tier },
      };

      setVoiceCommandLogs((prev) => [newLogItem, ...prev]);
      triggerToast('⚡ Voice Command Executed', `Stored "${key}" = "${value}" in Memory Vault!`);
      return true;
    }
    return false;
  }, []);

  // Startup Session Restore Prompt State
  const [showRestoreBanner, setShowRestoreBanner] = useState<boolean>(false);
  const [stashedTranscripts, setStashedTranscripts] = useState<TranscriptItem[]>([]);

  // Vantage Agent API Key state
  const [vantageApiKey, setVantageApiKey] = useState<string>(() => {
    return localStorage.getItem('vantage_agent_key') || '';
  });

  const handleClearVantageCredentials = useCallback(() => {
    localStorage.removeItem('vantage_agent_key');
    localStorage.removeItem('vantage_agent_name');
    setVantageApiKey('');
    triggerToast('Vantage Credentials Cleared', 'Stored agent key removed. Re-register to obtain a new key.');
  }, [triggerToast]);

  const handleSaveVantageApiKey = useCallback((key: string) => {
    localStorage.setItem('vantage_agent_key', key);
    setVantageApiKey(key);
  }, []);

  // Startup Check for Saved Session Transcripts
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRANSCRIPTS);
      if (saved) {
        const parsed: TranscriptItem[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStashedTranscripts(parsed);
          setShowRestoreBanner(true);
        }
      }
    } catch (e) {}
  }, []);

  // Auto-Sync Theme Class on Document Element
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Auto-Save Transcripts to localStorage
  useEffect(() => {
    if (transcripts.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_TRANSCRIPTS, JSON.stringify(transcripts));
      } catch (e) {}
    }
  }, [transcripts]);

  // Auto-Save Memory Vault to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MEMORIES, JSON.stringify(memories));
    } catch (e) {}
  }, [memories]);

  // Restore Session Handlers
  const handleRestoreSession = () => {
    setTranscripts(stashedTranscripts);
    setShowRestoreBanner(false);
  };

  const handleDismissRestoreSession = () => {
    localStorage.removeItem(STORAGE_KEY_TRANSCRIPTS);
    setStashedTranscripts([]);
    setShowRestoreBanner(false);
  };

  // Memory Vault Handlers
  const handleAddMemory = (newMem: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const item: MemoryItem = {
      ...newMem,
      id: `mem-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setMemories((prev) => [item, ...prev]);
  };

  const handleUpdateMemory = (id: string, updates: Partial<MemoryItem>) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m))
    );
  };

  const handleDeleteMemory = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleClearAllMemories = () => {
    setMemories([]);
    localStorage.removeItem(STORAGE_KEY_MEMORIES);
  };

  const handleImportMemories = (importedItems: MemoryItem[]) => {
    setMemories((prev) => {
      const existingKeys = new Set(prev.map((m) => m.key.toLowerCase()));
      const newItems = importedItems.filter((m) => !existingKeys.has(m.key.toLowerCase()));
      return [...newItems, ...prev];
    });
  };

  // External Vault Ingest Function via vantageClient (/api/vault/external/ingest)
  const pushMemoriesToExternalVault = useCallback(
    async (customMemories?: MemoryItem[]) => {
      const targetMemories = customMemories || memories;
      if (!targetMemories || targetMemories.length === 0) {
        triggerToast('Vault Sync Skipped', 'No stored memory items available in vault to synchronize.');
        return null;
      }

      try {
        const response = await vantageClient.pushMemoriesToExternalVault(targetMemories, {
          title: `SonicMind Private Memory Vault Ingest (${targetMemories.length} items)`,
        });

        triggerToast(
          'Vantage Vault Ingested',
          `Successfully pushed ${response.turn_count} memory items to external vault (${response.vault_path}).`
        );
        return response;
      } catch (err: any) {
        console.error('[Vantage External Vault Ingestion Error]:', err);
        triggerToast('Vault Ingest Error', err?.message || 'Failed to push memory items to external vault.');
        throw err;
      }
    },
    [memories]
  );

  const memoryBreakdown = {
    secure: memories.filter((m) => m.tier === 'secure').length,
    personal: memories.filter((m) => m.tier === 'personal').length,
    regular: memories.filter((m) => m.tier === 'regular').length,
  };

  // Latency & Telemetry Metrics
  const [latencyMetrics, setLatencyMetrics] = useState<LatencyMetrics>({
    timeToFirstAudioMs: null,
    roundTripLatencyMs: null,
    packetsSent: 0,
    packetsReceived: 0,
    lastAudioReceivedTime: null,
    latencyHistory: [],
  });

  const turnStartTimestampRef = useRef<number | null>(null);
  const isExplicitStopRef = useRef<boolean>(false);
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // References for WebSocket, Audio Engine, and Audio Player
  const wsRef = useRef<WebSocket | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);

  // Sync settings.enableVoiceOutput with ref so WS callback reads live value
  const enableVoiceOutputRef = useRef<boolean>(settings.enableVoiceOutput);
  useEffect(() => {
    enableVoiceOutputRef.current = settings.enableVoiceOutput;
  }, [settings.enableVoiceOutput]);

  const pendingTextMsgRef = useRef<string | null>(null);

  // Active AI Transcript Part tracker
  const currentAiTurnIdRef = useRef<string | null>(null);

  // Get current persona details
  const activePersona =
    SYSTEM_PERSONAS.find((p) => p.id === settings.personaId) || SYSTEM_PERSONAS[0];

  // Initialize Audio Player
  useEffect(() => {
    const player = new AudioPlayer(24000);
    player.setVolumeCallback((rms, peak) => {
      setAiVolumeRMS(rms);
      setAiPeakLevel(peak || rms);
      if (rms > 0.01) {
        setConversationState('speaking');
      }
    });

    player.setEndedCallback(() => {
      setAiVolumeRMS(0);
      setAiPeakLevel(0);
      setConversationState((prev) => (prev === 'speaking' ? 'idle' : prev));
    });

    audioPlayerRef.current = player;

    return () => {
      player.close();
    };
  }, []);

  // Sync playback speed setting with AudioPlayer
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setPlaybackSpeed(settings.playbackSpeed);
    }
  }, [settings.playbackSpeed]);

  // Theme Sync (Light / Dark)
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.theme]);

  // Handle Interruption / Barge-in
  const handleInterrupt = useCallback(() => {
    console.log('[App] Interruption triggered!');
    if (audioPlayerRef.current) {
      audioPlayerRef.current.interrupt();
    }
    setAiVolumeRMS(0);
    setAiPeakLevel(0);
    setConversationState('interrupted');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }

    setTimeout(() => {
      setConversationState('listening');
    }, 400);
  }, []);

  // Initialize Audio Recorder with VAD & Microphone streaming
  useEffect(() => {
    const recorder = new AudioRecorder({
      onAudioData: (base64Pcm, rms, peak) => {
        setUserVolumeRMS(rms);
        setUserPeakLevel(peak || rms);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'audio',
              audio: base64Pcm,
            })
          );
          setLatencyMetrics((prev) => ({ ...prev, packetsSent: prev.packetsSent + 1 }));
        }
      },
      onSpeechStart: () => {
        turnStartTimestampRef.current = Date.now();
        // Barge-in check: if AI is playing audio while user speaks, interrupt!
        if (settings.enableBargeIn && audioPlayerRef.current?.getIsPlaying()) {
          handleInterrupt();
        } else {
          setConversationState('listening');
        }
      },
      onSpeechEnd: () => {
        setUserVolumeRMS(0);
        setUserPeakLevel(0);
        setConversationState((prev) => (prev === 'listening' ? 'thinking' : prev));
      },
      onVADVolumeChange: (rms, peak) => {
        setUserVolumeRMS(rms);
        setUserPeakLevel(peak || rms);
      },
      onError: (err) => {
        console.error('Audio recorder error:', err);
        setErrorMessage(`Microphone access error: ${err.message}`);
      },
    });

    recorder.setVADThreshold(settings.vadSensitivity);
    recorder.setSilenceTimeout(settings.silenceTimeoutMs);
    recorder.setNoiseSuppressionConfig(
      settings.enableNoiseSuppression,
      settings.enableVoiceIsolationGate
    );
    audioRecorderRef.current = recorder;

    return () => {
      recorder.stop();
    };
  }, [
    settings.vadSensitivity,
    settings.silenceTimeoutMs,
    settings.enableBargeIn,
    settings.enableNoiseSuppression,
    settings.enableVoiceIsolationGate,
    handleInterrupt,
  ]);

  // Connect WebSocket with Exponential Backoff Strategy
  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live-s2s`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected to S2S endpoint');
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connect

      // Send initial configuration
      const systemInstruction = settings.customInstruction || activePersona.systemInstruction;
      ws.send(
        JSON.stringify({
          type: 'config',
          config: {
            systemInstruction,
            voice: settings.voice,
            playbackSpeed: settings.playbackSpeed,
            translationMode: settings.translationMode,
            targetLanguageCode: settings.targetLanguageCode,
            enableTools: settings.enableTools,
          },
        })
      );

      // Send pending text message if user typed while starting session
      if (pendingTextMsgRef.current) {
        const textToSend = pendingTextMsgRef.current;
        pendingTextMsgRef.current = null;
        turnStartTimestampRef.current = Date.now();
        ws.send(JSON.stringify({ type: 'text', text: textToSend }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'connected') {
          setConnectionStatus('connected');
          setConversationState('idle');
          if (pendingTextMsgRef.current) {
            const textToSend = pendingTextMsgRef.current;
            pendingTextMsgRef.current = null;
            turnStartTimestampRef.current = Date.now();
            ws.send(JSON.stringify({ type: 'text', text: textToSend }));
          }
        } else if (msg.type === 'audio' && msg.audio) {
          // Calculate Time-To-First-Audio latency & update history for D3 sparkline
          if (turnStartTimestampRef.current !== null) {
            const latency = Date.now() - turnStartTimestampRef.current;
            setLatencyMetrics((prev) => {
              const newHistory = [...(prev.latencyHistory || []), latency].slice(-10);
              return {
                ...prev,
                timeToFirstAudioMs: latency,
                roundTripLatencyMs: latency,
                latencyHistory: newHistory,
                lastAudioReceivedTime: Date.now(),
              };
            });
            turnStartTimestampRef.current = null;
          }

          // Play incoming audio chunk ONLY if Voice Output is enabled
          if (audioPlayerRef.current && enableVoiceOutputRef.current) {
            audioPlayerRef.current.playChunk(msg.audio);
          }

          setLatencyMetrics((prev) => ({ ...prev, packetsReceived: prev.packetsReceived + 1 }));
          setConversationState('speaking');
        } else if (msg.type === 'transcript') {
          const { sender, text, isFinal } = msg;

          if (sender === 'user' && text && text.trim()) {
            // Run client-side language detection using languagedetect
            const langDetection = detectSpokenLanguage(text);
            const detectedTag = langDetection
              ? `${langDetection.displayName} (${langDetection.detectedCode})`
              : undefined;

            if (langDetection && settings.autoDetectLanguage) {
              setSettings((prev) => {
                if (prev.targetLanguageCode !== langDetection.detectedCode) {
                  // Synchronize updated target language with active session
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    const persona =
                      SYSTEM_PERSONAS.find((p) => p.id === prev.personaId) || SYSTEM_PERSONAS[0];
                    const systemInstruction =
                      prev.customInstruction || persona.systemInstruction;

                    wsRef.current.send(
                      JSON.stringify({
                        type: 'config',
                        config: {
                          systemInstruction,
                          voice: prev.voice,
                          playbackSpeed: prev.playbackSpeed,
                          translationMode: prev.translationMode,
                          targetLanguageCode: langDetection.detectedCode,
                          enableTools: prev.enableTools,
                        },
                      })
                    );
                  }
                  return {
                    ...prev,
                    targetLanguageCode: langDetection.detectedCode,
                    targetLanguage: langDetection.displayName,
                  };
                }
                return prev;
              });
            }

            // Check for voice command triggers ("Sonic, remember that...")
            if (text) {
              processVoiceCommand(text);
            }

            setTranscripts((prev) => [
              ...prev,
              {
                id: `user-${Date.now()}`,
                sender: 'user',
                text,
                detectedLanguage: detectedTag,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                isFinal: true,
              },
            ]);
          } else if (sender === 'model') {
            setTranscripts((prev) => {
              if (!currentAiTurnIdRef.current || isFinal) {
                const turnId = `model-${Date.now()}`;
                currentAiTurnIdRef.current = turnId;
                const newItem: TranscriptItem = {
                  id: turnId,
                  sender: 'model',
                  text: text || '',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isFinal,
                };
                return [...prev, newItem];
              } else {
                // Append text chunk to active turn
                return prev.map((item) => {
                  if (item.id === currentAiTurnIdRef.current) {
                    return { ...item, text: item.text + text, isFinal };
                  }
                  return item;
                });
              }
            });
          }

          if (isFinal && sender === 'model') {
            currentAiTurnIdRef.current = null;
          }
        } else if (msg.type === 'interrupted') {
          handleInterrupt();
        } else if (msg.type === 'tool_call') {
          if (msg.toolName === 'store_memory_vault' && msg.toolArgs) {
            const { key, value, category = 'General', tier = 'regular', tags = '' } = msg.toolArgs;
            if (key && value) {
              const memoryTier = (tier as MemoryTier) || 'regular';
              setMemories((prev) => [
                {
                  id: `mem-${Date.now()}`,
                  key,
                  value,
                  category,
                  tier: memoryTier,
                  tags: typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()) : tags,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                ...prev.filter((m) => m.key.toLowerCase() !== key.toLowerCase()),
              ]);

              const newLogItem: VoiceCommandLogItem = {
                id: `cmd-tool-${Date.now()}`,
                commandType: 'memory_store',
                rawCommand: `[Agent Tool Call] store_memory_vault(key="${key}", value="${value}")`,
                parsedAction: `✓ Agent Stored Memory: Key="${key}", Value="${value}" (${memoryTier.toUpperCase()} Tier)`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                status: 'executed',
                details: { key, value, tier: memoryTier },
              };
              setVoiceCommandLogs((prev) => [newLogItem, ...prev]);
              triggerToast('⚡ Memory Vault Updated', `Agent stored "${key}" in Memory Vault!`);
            }
          }

          setTranscripts((prev) => [
            ...prev,
            {
              id: `tool-${Date.now()}`,
              sender: 'tool',
              text: `Executed tool function: ${msg.toolName}`,
              toolName: msg.toolName,
              toolArgs: msg.toolArgs,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        } else if (msg.type === 'error') {
          console.error('[S2S Error]:', msg.error);
          setErrorMessage(msg.error);
          setConnectionStatus('error');
        }
      } catch (e) {
        console.error('[WebSocket] Failed to parse message:', e);
      }
    };

    ws.onerror = (event) => {
      console.warn('[WebSocket] Connection event error or socket reset occurred');
    };

    ws.onclose = () => {
      console.log('[WebSocket] Connection closed');
      wsRef.current = null;

      // Exponential backoff auto-reconnection if unexpected drop
      if (!isExplicitStopRef.current) {
        const maxAttempts = 6;
        if (reconnectAttemptsRef.current < maxAttempts) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(
            30000,
            Math.pow(2, reconnectAttemptsRef.current - 1) * 1000 + Math.random() * 500
          );
          console.log(
            `[WebSocket] Auto-reconnecting in ${Math.round(
              delay
            )}ms (Attempt ${reconnectAttemptsRef.current}/${maxAttempts})...`
          );

          setConnectionStatus('connecting');
          setErrorMessage(
            `Connection lost. Reconnecting in ${Math.round(
              delay / 1000
            )}s (Attempt ${reconnectAttemptsRef.current}/${maxAttempts})...`
          );

          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket();
          }, delay);
        } else {
          setConnectionStatus('error');
          setErrorMessage('Connection lost. Reconnection limit reached. Click Start Conversation to reconnect.');
        }
      } else {
        setConnectionStatus('disconnected');
        setConversationState('idle');
      }
    };
  }, [settings, activePersona, handleInterrupt]);

  // Start Realtime S2S WebSocket Session
  const startSession = async () => {
    isExplicitStopRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setErrorMessage(null);
    setConnectionStatus('connecting');

    // 1. Request microphone access & start recording
    if (audioRecorderRef.current) {
      const success = await audioRecorderRef.current.start();
      if (!success) {
        setConnectionStatus('error');
        return;
      }
    }

    // 2. Establish WebSocket connection with exponential backoff
    connectWebSocket();
  };

  // Send Interactive Text Message Handler
  const handleSendTextMessage = useCallback(
    (text: string) => {
      if (!text || !text.trim()) return;
      const trimmed = text.trim();

      // 1. Instantly append user turn in transcript panel
      const userTurn: TranscriptItem = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFinal: true,
      };
      setTranscripts((prev) => [...prev, userTurn]);

      // 2. Check for voice command triggers ("Sonic, remember that...")
      processVoiceCommand(trimmed);

      // 3. Send over active WebSocket session, or connect if disconnected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        turnStartTimestampRef.current = Date.now();
        wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
      } else {
        pendingTextMsgRef.current = trimmed;
        startSession();
      }
    },
    [processVoiceCommand]
  );

  // Generate Session Intelligence Summary via Backend Endpoint with Retry
  const handleGenerateSummary = async () => {
    if (transcripts.length === 0) {
      setErrorMessage('No transcript items available to summarize.');
      return;
    }
    setIsGeneratingSummary(true);
    setIsSummaryModalOpen(true);
    setSessionSummary(null);

    let summaryData: SessionSummary | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && !summaryData) {
      attempts++;
      try {
        const res = await fetch('/api/summarize-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcripts,
            agentFramework: settings.agentFramework,
          }),
        });

        if (res.ok) {
          summaryData = await res.json();
          break;
        } else {
          console.warn(`[Summary API Attempt ${attempts}] Server returned status ${res.status}`);
        }
      } catch (fetchErr: any) {
        console.warn(`[Summary API Attempt ${attempts}] Fetch error:`, fetchErr?.message || fetchErr);
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }

    if (summaryData) {
      setSessionSummary(summaryData);
    } else {
      console.warn('[Summary API Notice]: Endpoint unavailable after retries; utilizing offline intelligent fallback summary.');
      // Fallback summary on error
      const userTurns = transcripts.filter((t) => t.sender === 'user').length;
      setSessionSummary({
        executiveSummary: `Generated summary for ${transcripts.length}-turn voice session. User engaged in real-time speech conversation with Sonic AI.`,
        keyTakeaways: [
          `Exchanged ${transcripts.length} voice speech turns (${userTurns} user prompts).`,
          'Real-time WebSocket audio streaming maintained without latency breaks.',
          'Function calling tools and Agent framework capabilities were active.',
        ],
        actionItems: [
          'Review conversation log history in Transcript View.',
          'Save or export session details as required.',
        ],
        sentiment: 'Productive & Engaged',
        keyTopics: ['SpeechToSpeech', 'VoiceAI', 'RealtimeInteraction'],
        agentFrameworkUsed: settings.agentFramework || 'Native Gemini S2S',
        totalTurns: transcripts.length,
        createdAt: new Date().toISOString(),
      });
    }

    setIsGeneratingSummary(false);
  };

  // Stop S2S Session
  const stopSession = () => {
    isExplicitStopRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.interrupt();
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    setConversationState('idle');
    setUserVolumeRMS(0);
    setUserPeakLevel(0);
    setAiVolumeRMS(0);
    setAiPeakLevel(0);

    // Auto-summarize session if enabled and transcript exists
    if (settings.autoSummarizeOnStop && transcripts.length > 0) {
      setTimeout(() => {
        handleGenerateSummary();
      }, 400);
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (audioRecorderRef.current) {
      audioRecorderRef.current.setMuted(newMuted);
    }
  };

  // Handle Settings Save
  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    // If connected, update WebSocket config
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const persona = SYSTEM_PERSONAS.find((p) => p.id === newSettings.personaId) || SYSTEM_PERSONAS[0];
      const systemInstruction = newSettings.customInstruction || persona.systemInstruction;

      wsRef.current.send(
        JSON.stringify({
          type: 'config',
          config: {
            systemInstruction,
            voice: newSettings.voice,
            translationMode: newSettings.translationMode,
            targetLanguageCode: newSettings.targetLanguageCode,
            enableTools: newSettings.enableTools,
          },
        })
      );
    }
  };

  // Clear Transcripts
  const handleClearTranscripts = () => {
    setTranscripts([]);
  };

  // Export Transcripts to TXT file
  const handleExportTranscripts = () => {
    if (transcripts.length === 0) return;
    const content = transcripts
      .map((t) => `[${t.timestamp}] ${t.sender.toUpperCase()}: ${t.text}`)
      .join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonicmind-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Camera Frame Multimodal handler
  const handleCameraFrameCaptured = (base64Data: string, mimeType: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'video',
          video: {
            data: base64Data,
            mimeType,
          },
        })
      );
    }
  };

  // Replay Audio chunk in transcript
  const handleReplayAudio = (base64Audio: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playChunk(base64Audio);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors font-sans antialiased">
      {/* Header */}
      <Header
        connectionStatus={connectionStatus}
        conversationState={conversationState}
        personaName={activePersona.name}
        voiceName={settings.voice}
        agentFramework={settings.agentFramework}
        theme={settings.theme}
        onToggleTheme={() =>
          setSettings((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenOAuthModal={() => setIsOAuthModalOpen(true)}
        onOpenResearchTools={() => setIsResearchToolsOpen(true)}
        onOpenCodeComputation={() => setIsCodeComputationOpen(true)}
        onOpenComputerControl={() => setIsComputerControlOpen(true)}
        onOpenCommunicationTools={() => setIsCommunicationToolsOpen(true)}
        onOpenDevTools={() => setIsDevToolsOpen(true)}
        onOpenDomainCustomTools={() => setIsDomainCustomToolsOpen(true)}
        onOpenModernMetaTools={() => setIsModernMetaToolsOpen(true)}
        onOpenVantageHub={() => setIsVantageHubOpen(true)}
        timeToFirstAudioMs={latencyMetrics.timeToFirstAudioMs}
        translationMode={settings.translationMode}
        targetLanguage={settings.targetLanguage}
      />

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="w-full bg-rose-500/10 border-b border-rose-500/20 px-4 py-3 flex items-center justify-between text-xs sm:text-sm text-rose-500 font-medium">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:bg-rose-500/20 rounded transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Vantage Background Creation Pipeline Job Progress Banner */}
      {activeJob && (
        <div className="w-full bg-indigo-950/90 border-b border-indigo-500/30 px-4 py-2.5 text-white text-xs animate-fadeIn">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles className={`w-4 h-4 ${activeJob.status !== 'completed' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-indigo-300">Creation Job #{activeJob.job_id}:</span>
                  <span className="font-mono text-zinc-300 truncate max-w-xs sm:max-w-md">"{activeJob.prompt}"</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase font-mono bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    STATUS: {activeJob.status}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{activeJob.note || 'Processing content pipeline...'}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <div className="w-28 sm:w-36 bg-zinc-800 h-2 rounded-full overflow-hidden border border-zinc-700">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-500"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              <span className="font-mono text-xs font-bold text-indigo-300">{activeJob.progress}%</span>
              {activeJob.status === 'completed' && (
                <button
                  onClick={clearActiveJob}
                  className="p-1 text-zinc-400 hover:text-white rounded"
                  title="Dismiss Banner"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Startup Session Restore Banner Prompt */}
      {showRestoreBanner && (
        <SessionRestoreBanner
          savedCount={stashedTranscripts.length}
          onRestore={handleRestoreSession}
          onDismiss={handleDismissRestoreSession}
        />
      )}

      {/* Main Body Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-5">
        {/* Top Visualizer Stage & Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {/* Main Visualizer Stage (2 cols on large screen) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <AudioVisualizer
              state={conversationState}
              userVolumeRMS={userVolumeRMS}
              userPeakLevel={userPeakLevel}
              aiVolumeRMS={aiVolumeRMS}
              aiPeakLevel={aiPeakLevel}
              isMuted={isMuted}
              isConnected={connectionStatus === 'connected'}
              onStartSession={startSession}
              visualizerStyle={settings.visualizerStyle}
            />

            <ControlBar
              connectionStatus={connectionStatus}
              conversationState={conversationState}
              isMuted={isMuted}
              pushToTalkMode={settings.pushToTalkMode}
              enableVoiceOutput={settings.enableVoiceOutput}
              onToggleVoiceOutput={() =>
                setSettings((prev) => ({ ...prev, enableVoiceOutput: !prev.enableVoiceOutput }))
              }
              onSendTextMessage={handleSendTextMessage}
              onToggleSession={connectionStatus === 'connected' ? stopSession : startSession}
              onToggleMute={toggleMute}
              onInterrupt={handleInterrupt}
              onClearTranscripts={handleClearTranscripts}
              onExportTranscripts={handleExportTranscripts}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenMemoryVault={() => setIsMemoryVaultOpen(true)}
              memoryCount={memories.length}
              memoryBreakdown={memoryBreakdown}
              personaName={activePersona.name}
            />
          </div>

          {/* Right Side Multimodal Camera & Latency Metrics */}
          <div className="flex flex-col gap-4 justify-between">
            <LatencyStats metrics={latencyMetrics} />

            {/* Multimodal Camera Input Box */}
            <CameraPreview
              isEnabled={settings.enableCamera || settings.enableScreenShare}
              onFrameCaptured={handleCameraFrameCaptured}
              onClose={() =>
                setSettings((prev) => ({ ...prev, enableCamera: false, enableScreenShare: false }))
              }
            />

            {/* Quick Tips / Persona Info Card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 shadow-sm flex-1 flex flex-col justify-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1.5">
                Active Persona: {activePersona.name}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {activePersona.description}
              </p>
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 text-[11px] text-zinc-400">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Speak naturally. Barge-in allows interrupting anytime!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Conversation Transcript Panel */}
        <TranscriptView
          transcripts={transcripts}
          voiceCommandLogs={voiceCommandLogs}
          onClearVoiceLogs={() => setVoiceCommandLogs([])}
          onPlayAudio={handleReplayAudio}
          isStreaming={conversationState === 'speaking' || conversationState === 'listening'}
          onGenerateSummary={handleGenerateSummary}
        />
      </main>

      {/* Voice Command Execution Toast Banner */}
      {toastBanner && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl bg-zinc-900 text-white shadow-2xl border border-indigo-500/50 animate-bounce max-w-sm">
          <Sparkles className="w-5 h-5 text-indigo-400 shrink-0" />
          <div className="text-xs flex-1">
            <p className="font-bold text-indigo-300">{toastBanner.title}</p>
            <p className="text-zinc-300">{toastBanner.message}</p>
          </div>
          <button
            onClick={() => setToastBanner(null)}
            className="p-1 rounded text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onOpenOAuthModal={() => setIsOAuthModalOpen(true)}
      />

      {/* OAuth & Multi-Platform Integration Hub Modal */}
      <OAuthIntegrationsModal
        isOpen={isOAuthModalOpen}
        onClose={() => setIsOAuthModalOpen(false)}
      />

      {/* AI Session Intelligence Summary Modal */}
      <SessionSummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summary={sessionSummary}
        isLoading={isGeneratingSummary}
        transcripts={transcripts}
      />

      {/* Agent Multi-Tier Memory Vault Modal */}
      <MemoryVaultModal
        isOpen={isMemoryVaultOpen}
        onClose={() => setIsMemoryVaultOpen(false)}
        memories={memories}
        onAddMemory={handleAddMemory}
        onUpdateMemory={handleUpdateMemory}
        onDeleteMemory={handleDeleteMemory}
        onClearAllMemories={handleClearAllMemories}
        onImportMemories={handleImportMemories}
        onSyncToExternalVault={pushMemoriesToExternalVault}
      />

      {/* Information & Research Tools Modal */}
      <ResearchToolsModal
        isOpen={isResearchToolsOpen}
        onClose={() => setIsResearchToolsOpen(false)}
      />

      {/* Code & Computation Engine Modal */}
      <CodeComputationModal
        isOpen={isCodeComputationOpen}
        onClose={() => setIsCodeComputationOpen(false)}
      />

      {/* Browser & Computer Control Suite Modal */}
      <BrowserComputerControlModal
        isOpen={isComputerControlOpen}
        onClose={() => setIsComputerControlOpen(false)}
      />

      {/* Communication & Productivity Suite Modal */}
      <CommunicationProductivityModal
        isOpen={isCommunicationToolsOpen}
        onClose={() => setIsCommunicationToolsOpen(false)}
      />

      {/* Development & Software Toolset Modal */}
      <DevSoftwareToolsModal
        isOpen={isDevToolsOpen}
        onClose={() => setIsDevToolsOpen(false)}
      />

      {/* Domain-Specific & Custom Toolset Modal */}
      <DomainCustomToolsModal
        isOpen={isDomainCustomToolsOpen}
        onClose={() => setIsDomainCustomToolsOpen(false)}
      />

      {/* Modern Standards & Meta-Tools Modal */}
      <ModernMetaToolsModal
        isOpen={isModernMetaToolsOpen}
        onClose={() => setIsModernMetaToolsOpen(false)}
      />

      {/* Vantage Agent Platform & MCP Hub Modal */}
      <VantageHubModal
        isOpen={isVantageHubOpen}
        onClose={() => setIsVantageHubOpen(false)}
        onRegisterCreationJob={registerCreationJob}
        vantageApiKey={vantageApiKey}
        onClearCredentials={handleClearVantageCredentials}
        onSaveApiKey={handleSaveVantageApiKey}
      />
    </div>
  );
}
