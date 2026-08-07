import React, { useState, useRef, useEffect } from 'react';
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
  Search,
  Cpu,
  Monitor,
  Mail,
  Code2,
  CloudSun,
  Workflow,
  ChevronDown,
  Sparkles,
  Grid,
  ShieldCheck,
  Key,
  Globe,
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
  onOpenResearchTools?: () => void;
  onOpenCodeComputation?: () => void;
  onOpenComputerControl?: () => void;
  onOpenCommunicationTools?: () => void;
  onOpenDevTools?: () => void;
  onOpenDomainCustomTools?: () => void;
  onOpenModernMetaTools?: () => void;
  onOpenVantageHub?: () => void;
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
  onOpenResearchTools,
  onOpenCodeComputation,
  onOpenComputerControl,
  onOpenCommunicationTools,
  onOpenDevTools,
  onOpenDomainCustomTools,
  onOpenModernMetaTools,
  onOpenVantageHub,
  timeToFirstAudioMs,
  translationMode,
  targetLanguage,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const toolSuitesList = [
    {
      id: 'vantage',
      name: 'Vantage Agent Platform',
      shortName: 'Vantage Hub',
      icon: Globe,
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20',
      action: onOpenVantageHub,
      desc: 'Account Registration, MCP ~700 Tools, Platform Feed, Vibe Bus & TRO Tasks',
    },
    {
      id: 'meta',
      name: 'MCP & Meta Tools',
      shortName: 'MCP & Meta',
      icon: Workflow,
      color: 'text-purple-500 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20',
      action: onOpenModernMetaTools,
      desc: 'Model Context Protocol, Tool Search, Multi-Agent Delegation',
    },
    {
      id: 'domain',
      name: 'Domain & Custom',
      shortName: 'Domain & Custom',
      icon: CloudSun,
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20',
      action: onOpenDomainCustomTools,
      desc: 'Weather, Stocks, Maps, CRM/Salesforce, Stripe, IoT, Custom Rules',
    },
    {
      id: 'dev',
      name: 'Dev & Software',
      shortName: 'Dev & Software',
      icon: Code2,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20',
      action: onOpenDevTools,
      desc: 'GitHub REST, DB Queries, Custom REST Endpoints, Deployments',
    },
    {
      id: 'comm',
      name: 'Comm & Productivity',
      shortName: 'Comm & Prod',
      icon: Mail,
      color: 'text-blue-500 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20',
      action: onOpenCommunicationTools,
      desc: 'Gmail, Calendar, Slack, Teams, Notion, Workspace APIs',
    },
    {
      id: 'computer',
      name: 'Browser & OS Control',
      shortName: 'Browser & OS',
      icon: Monitor,
      color: 'text-rose-500 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20',
      action: onOpenComputerControl,
      desc: 'Headless Browser Automation, Screenshots, OS Actions',
    },
    {
      id: 'computation',
      name: 'Code & Computation',
      shortName: 'Code & Calc',
      icon: Cpu,
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20',
      action: onOpenCodeComputation,
      desc: 'Python Exec, WebAssembly Engine, Math & Plotting',
    },
    {
      id: 'research',
      name: 'Research Tools',
      shortName: 'Research',
      icon: Search,
      color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20',
      action: onOpenResearchTools,
      desc: 'Live Web Search, Web Scraping, PDF & Vision Analysis',
    },
  ];

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

        {/* Right Controls: Tool Suites Dropdown + Theme + Settings */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Tool Suites Dropdown Launcher */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors shadow-sm"
              title="Open Tool Suites Menu"
            >
              <Grid className="w-4 h-4 text-indigo-500" />
              <span className="hidden xs:inline">Tool Suites</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-extrabold">
                8
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Popover */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-3 z-50 animate-fadeIn space-y-1">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 text-indigo-500" /> Active Tool Suites (8)
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">Select to Launch</span>
                </div>

                <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
                  {toolSuitesList.map((suite) => {
                    if (!suite.action) return null;
                    const IconComponent = suite.icon;
                    return (
                      <button
                        key={suite.id}
                        onClick={() => {
                          setIsDropdownOpen(false);
                          suite.action?.();
                        }}
                        className="w-full text-left flex items-start gap-3 p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all group"
                      >
                        <div className={`p-2 rounded-xl border ${suite.color} shrink-0 mt-0.5`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {suite.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                            {suite.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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

      {/* Sub-Header Horizontal Scrollable Tool Tab Bar */}
      <div className="w-full bg-zinc-50/90 dark:bg-zinc-900/60 border-t border-zinc-200/80 dark:border-zinc-800/80 px-4 py-1.5">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar py-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" /> Suites:
          </span>

          {toolSuitesList.map((suite) => {
            if (!suite.action) return null;
            const IconComponent = suite.icon;
            return (
              <button
                key={suite.id}
                onClick={suite.action}
                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${suite.color}`}
                title={suite.desc}
              >
                <IconComponent className="w-3.5 h-3.5" />
                <span>{suite.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};

