import React from 'react';
import { Mic, MicOff, Square, Play, Hand, Trash2, Download, Sparkles, Send, Video, Monitor } from 'lucide-react';
import { ConnectionStatus, ConversationState } from '../types';

interface ControlBarProps {
  connectionStatus: ConnectionStatus;
  conversationState: ConversationState;
  isMuted: boolean;
  pushToTalkMode: boolean;
  onToggleSession: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onClearTranscripts: () => void;
  onExportTranscripts: () => void;
  onOpenSettings: () => void;
  personaName: string;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  connectionStatus,
  conversationState,
  isMuted,
  pushToTalkMode,
  onToggleSession,
  onToggleMute,
  onInterrupt,
  onClearTranscripts,
  onExportTranscripts,
  onOpenSettings,
  personaName,
}) => {
  const isConnected = connectionStatus === 'connected';
  const isSpeaking = conversationState === 'speaking';

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-lg backdrop-blur-md transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Persona badge trigger */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 text-xs sm:text-sm font-medium transition-colors"
          title="Change Voice Persona or Settings"
        >
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <span className="truncate max-w-[120px] sm:max-w-[180px]">{personaName}</span>
        </button>

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
    </div>
  );
};
