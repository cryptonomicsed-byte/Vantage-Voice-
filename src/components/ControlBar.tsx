import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Square,
  Play,
  Hand,
  Trash2,
  Download,
  Sparkles,
  ShieldCheck,
  Lock,
  User,
  Database,
  Volume2,
  VolumeX,
  Send,
  MessageSquare,
} from 'lucide-react';
import { ConnectionStatus, ConversationState } from '../types';

interface ControlBarProps {
  connectionStatus: ConnectionStatus;
  conversationState: ConversationState;
  isMuted: boolean;
  pushToTalkMode: boolean;
  enableVoiceOutput?: boolean;
  onToggleVoiceOutput?: () => void;
  onSendTextMessage?: (text: string) => void;
  onToggleSession: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onClearTranscripts: () => void;
  onExportTranscripts: () => void;
  onOpenSettings: () => void;
  onOpenMemoryVault?: () => void;
  memoryCount?: number;
  memoryBreakdown?: {
    secure: number;
    personal: number;
    regular: number;
  };
  personaName: string;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  connectionStatus,
  conversationState,
  isMuted,
  pushToTalkMode,
  enableVoiceOutput = true,
  onToggleVoiceOutput,
  onSendTextMessage,
  onToggleSession,
  onToggleMute,
  onInterrupt,
  onClearTranscripts,
  onExportTranscripts,
  onOpenSettings,
  onOpenMemoryVault,
  memoryCount = 0,
  memoryBreakdown = { secure: 0, personal: 0, regular: 0 },
  personaName,
}) => {
  const [showVaultTooltip, setShowVaultTooltip] = useState(false);
  const [textInput, setTextInput] = useState('');

  const isConnected = connectionStatus === 'connected';
  const isSpeaking = conversationState === 'speaking';

  const handleSend = () => {
    const trimmed = textInput.trim();
    if (trimmed && onSendTextMessage) {
      onSendTextMessage(trimmed);
      setTextInput('');
    }
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-lg backdrop-blur-md transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Persona badge trigger & Memory Vault with visual indicator and breakdown tooltip */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 text-xs sm:text-sm font-medium transition-colors"
            title="Change Voice Persona or Settings"
          >
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span className="truncate max-w-[100px] sm:max-w-[160px]">{personaName}</span>
          </button>

          {onOpenMemoryVault && (
            <div
              className="relative"
              onMouseEnter={() => setShowVaultTooltip(true)}
              onMouseLeave={() => setShowVaultTooltip(false)}
            >
              <button
                onClick={onOpenMemoryVault}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800/80 text-indigo-600 dark:text-indigo-300 text-xs font-semibold transition-all active:scale-95 shadow-sm"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                <span className="hidden md:inline">Memory Vault</span>
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white shadow-sm">
                  {memoryCount}
                </span>
              </button>

              {/* Tooltip Breakdown */}
              {showVaultTooltip && (
                <div className="absolute left-0 bottom-full mb-2.5 w-52 p-3 bg-zinc-900 text-white rounded-2xl shadow-xl border border-zinc-700 z-50 text-xs space-y-2 pointer-events-none animate-fadeIn">
                  <div className="flex items-center justify-between font-bold border-b border-zinc-800 pb-1.5 text-zinc-200">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Vault Breakdown
                    </span>
                    <span className="text-[10px] text-indigo-400 font-mono">{memoryCount} Items</span>
                  </div>
                  <div className="space-y-1.5 pt-0.5 text-[11px]">
                    <div className="flex items-center justify-between text-red-400">
                      <span className="flex items-center gap-1.5">
                        <Lock className="w-3 h-3" /> Top Secure
                      </span>
                      <span className="font-mono font-bold">{memoryBreakdown.secure}</span>
                    </div>
                    <div className="flex items-center justify-between text-amber-400">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3 h-3" /> Personal Info
                      </span>
                      <span className="font-mono font-bold">{memoryBreakdown.personal}</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-300">
                      <span className="flex items-center gap-1.5">
                        <Database className="w-3 h-3" /> Regular Context
                      </span>
                      <span className="font-mono font-bold">{memoryBreakdown.regular}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: Main Primary Actions */}
        <div className="flex items-center gap-2 sm:gap-3 mx-auto sm:mx-0">
          {/* Start / Stop Main Button */}
          <button
            onClick={onToggleSession}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 rounded-full font-semibold text-sm transition-all duration-200 shadow-md ${
              isConnected
                ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 active:scale-95'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 active:scale-95'
            }`}
          >
            {isConnected ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>End Session</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Start Session</span>
              </>
            )}
          </button>

          {/* Mute Mic Button */}
          <button
            onClick={onToggleMute}
            disabled={!isConnected}
            className={`p-3 rounded-full transition-all duration-200 border ${
              !isConnected
                ? 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
                : isMuted
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5 text-amber-500" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Voice Response Output Toggle Button (Voice vs Text-Only Response) */}
          {onToggleVoiceOutput && (
            <button
              onClick={onToggleVoiceOutput}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-full text-xs font-semibold border transition-all active:scale-95 ${
                enableVoiceOutput
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              }`}
              title={
                enableVoiceOutput
                  ? 'Voice Output: ENABLED (Agent responds with spoken voice). Click to toggle text-only responses.'
                  : 'Voice Output: OFF / MUTED (Agent responds in text only). Click to enable spoken voice output.'
              }
            >
              {enableVoiceOutput ? (
                <>
                  <Volume2 className="w-4 h-4 text-emerald-500" />
                  <span className="hidden lg:inline">Voice: ON</span>
                  <span className="lg:hidden">Voice</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-amber-500" />
                  <span className="hidden lg:inline">Voice: OFF (Text Only)</span>
                  <span className="lg:hidden">Text Only</span>
                </>
              )}
            </button>
          )}

          {/* Interrupt / Barge-in manual trigger button */}
          <button
            onClick={onInterrupt}
            disabled={!isConnected || !isSpeaking}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border ${
              isConnected && isSpeaking
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20 cursor-pointer animate-pulse'
                : 'opacity-40 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
            }`}
            title="Interrupt AI speaking immediately"
          >
            <Hand className="w-4 h-4" />
            <span className="hidden sm:inline">Interrupt</span>
          </button>
        </div>

        {/* Right: History Actions */}
        <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
          <button
            onClick={onClearTranscripts}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Clear Conversation History"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={onExportTranscripts}
            className="p-2.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Export Conversation History"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Interactive Text Messaging Bar */}
      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <div className="relative flex-1">
          <MessageSquare className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder={
              enableVoiceOutput
                ? "Type a text message... (Agent will respond in voice and text)"
                : "Type a text message... (Agent will respond in text mode)"
            }
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textInput.trim()) {
                handleSend();
              }
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-zinc-400"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={!textInput.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-all active:scale-95 shrink-0 shadow-md shadow-indigo-500/20"
          title="Send text message to agent"
        >
          <Send className="w-4 h-4" />
          <span>Send</span>
        </button>
      </div>
    </div>
  );
};
