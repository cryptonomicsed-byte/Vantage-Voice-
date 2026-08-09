import React from 'react';
import { ConnectionStatus, ConversationState } from '../types';
import {
  Mic,
  Radio,
  Settings,
  Moon,
  Sun,
  Volume2,
  ShieldAlert,
  Zap,
  Layers,
  Sparkles,
  ShieldCheck,
  Key,
  Globe,
  Bot,
} from 'lucide-react';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  conversationState: ConversationState;
  personaName: string;
  voiceName: string;
  agentFramework?: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenOAuthModal?: () => void;
  onOpenVantageHub?: () => void;
  onOpenAgents?: () => void;
  timeToFirstAudioMs: number | null;
  translationMode: boolean;
  targetLanguage: string;
}

export const Header: React.FC<HeaderProps> = ({
  connectionStatus,
  conversationState,
  personaName,
  voiceName,
  agentFramework,
  theme,
  onToggleTheme,
  onOpenSettings,
  onOpenOAuthModal,
  onOpenVantageHub,
  onOpenAgents,
  timeToFirstAudioMs,
  translationMode,
  targetLanguage,
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Connected
          </span>
        );
      case 'connecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            Connecting...
          </span>
        );
      case 'reconnecting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Reconnecting
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="w-3.5 h-3.5" />
            Connection Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <span className="w-2 h-2 rounded-full bg-zinc-400" />
            Offline
          </span>
        );
    }
  };

  return (
    <header className="w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 transition-colors">
      {/* Top Header Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand logo & Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 text-white shadow-md shadow-indigo-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                SonicMind <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">S2S</span>
              </h1>
              {(agentFramework === 'hermes' || personaName.toLowerCase().includes('hermes')) && (
                <span className="hidden lg:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-mono font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Hermes
                </span>
              )}
              {translationMode && (
                <span className="hidden xl:inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                  Translate → {targetLanguage}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
              Speech-to-Speech Realtime AI • {personaName} ({voiceName})
            </p>
          </div>
        </div>

        {/* Center Status Badge & Latency */}
        <div className="flex items-center gap-2 shrink-0">
          {getStatusBadge()}

          {timeToFirstAudioMs !== null && (
            <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
              <Zap className="w-3 h-3 text-amber-500" />
              {timeToFirstAudioMs} ms
            </span>
          )}
        </div>

        {/* Right Controls: real entry points only -- the old "Tool Suites"
            dropdown wrapped 7 decorative modals that only ever called
            /api/tools/execute for hardcoded demo data and did nothing
            real; removed. Vantage Hub and Agents are both real. */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenVantageHub && (
            <button
              onClick={onOpenVantageHub}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all shadow-sm"
              title="Vantage Agent Platform & MCP Hub -- real account, real ~669 MCP tools, real platform feed"
            >
              <Globe className="w-4 h-4 text-indigo-500" />
              <span className="hidden xs:inline">Vantage Hub</span>
            </button>
          )}

          {onOpenAgents && (
            <button
              onClick={onOpenAgents}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all shadow-sm"
              title="Choose the active agent, or configure a real multi-agent roster"
            >
              <Bot className="w-4 h-4 text-purple-500" />
              <span className="hidden xs:inline">Agents</span>
            </button>
          )}

          {/* OAuth Hub Button */}
          {onOpenOAuthModal && (
            <button
              onClick={onOpenOAuthModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all shadow-sm"
              title="Open OAuth & Integrations Hub"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">OAuth Hub</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Toggle Light/Dark Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-zinc-600" />}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-colors shadow-sm"
          >
            <Settings className="w-4 h-4 text-indigo-500" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

    </header>
  );
};

