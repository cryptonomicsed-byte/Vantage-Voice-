import React, { useEffect, useRef, useState } from 'react';
import { TranscriptItem, VoiceCommandLogItem } from '../types';
import {
  User,
  Sparkles,
  Wrench,
  Copy,
  Check,
  Clock,
  Volume2,
  Globe,
  FileText,
  Loader2,
  Search,
  X,
  Terminal,
  ShieldCheck,
  Zap,
  CheckCircle2,
  MessageSquare,
  Download,
  ChevronDown,
  Code,
  FileCode,
} from 'lucide-react';

interface TranscriptViewProps {
  transcripts: TranscriptItem[];
  voiceCommandLogs?: VoiceCommandLogItem[];
  onClearVoiceLogs?: () => void;
  onPlayAudio?: (base64Audio: string) => void;
  onGenerateSummary?: () => void;
  isStreaming?: boolean;
  isGeneratingSummary?: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  transcripts,
  voiceCommandLogs = [],
  onClearVoiceLogs,
  onPlayAudio,
  onGenerateSummary,
  isStreaming = false,
  isGeneratingSummary = false,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'transcript' | 'commands'>('transcript');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchQuery && activeTab === 'transcript') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, searchQuery, activeTab]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExport = (format: 'txt' | 'md' | 'json') => {
    if (transcripts.length === 0) return;

    let content = '';
    let filename = `transcript-${new Date().toISOString().slice(0, 10)}`;
    let mimeType = 'text/plain';

    if (format === 'txt') {
      content = transcripts
        .map((item) => `[${item.timestamp}] ${item.sender.toUpperCase()}: ${item.text}`)
        .join('\n\n');
      filename += '.txt';
      mimeType = 'text/plain';
    } else if (format === 'md') {
      content =
        `# Voice Session Transcript\n*Exported on ${new Date().toLocaleString()}*\n\n` +
        transcripts
          .map(
            (item) =>
              `### ${item.sender === 'user' ? 'User' : item.sender === 'tool' ? 'Tool' : 'Agent'} (${item.timestamp})\n${item.text}\n`
          )
          .join('\n');
      filename += '.md';
      mimeType = 'text/markdown';
    } else if (format === 'json') {
      content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          totalTurns: transcripts.length,
          transcripts: transcripts.map(({ id, sender, text, timestamp, toolName, detectedLanguage }) => ({
            id,
            sender,
            text,
            timestamp,
            toolName,
            detectedLanguage,
          })),
        },
        null,
        2
      );
      filename += '.json';
      mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredTranscripts = transcripts.filter((item) => {
    if (!q) return true;
    const textMatch = item.text.toLowerCase().includes(q);
    const senderMatch = item.sender.toLowerCase().includes(q);
    const toolMatch = item.toolName ? item.toolName.toLowerCase().includes(q) : false;
    const langMatch = item.detectedLanguage ? item.detectedLanguage.toLowerCase().includes(q) : false;
    return textMatch || senderMatch || toolMatch || langMatch;
  });

  const filteredCommands = voiceCommandLogs.filter((cmd) => {
    if (!q) return true;
    return (
      cmd.rawCommand.toLowerCase().includes(q) ||
      cmd.parsedAction.toLowerCase().includes(q) ||
      cmd.commandType.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full flex flex-col h-[380px] sm:h-[460px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-lg overflow-hidden">
      {/* Header Row with View Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          {/* View Switcher Tabs */}
          <div className="flex items-center p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700/80">
            <button
              onClick={() => setActiveTab('transcript')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'transcript'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
              <span>Transcript</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono">
                {transcripts.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('commands')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'commands'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-purple-500" />
              <span>Command Log</span>
              {voiceCommandLogs.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-mono font-bold">
                  {voiceCommandLogs.length}
                </span>
              )}
            </button>
          </div>

          {q && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono font-semibold border border-indigo-500/20 hidden sm:inline">
              {activeTab === 'transcript' ? filteredTranscripts.length : filteredCommands.length} matches
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search Input Bar */}
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder={activeTab === 'transcript' ? 'Search transcript...' : 'Search commands...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1 rounded-xl text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {activeTab === 'transcript' && transcripts.length > 0 && onGenerateSummary && (
            <button
              onClick={onGenerateSummary}
              disabled={isGeneratingSummary}
              title="Generate AI summary of conversation history"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800/80 text-xs font-semibold text-indigo-600 dark:text-indigo-300 transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              {isGeneratingSummary ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span className="hidden md:inline">Summary</span>
            </button>
          )}

          {/* Export Sub-Menu Dropdown */}
          {activeTab === 'transcript' && transcripts.length > 0 && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700/80 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-all active:scale-95 shrink-0"
                title="Export transcript in various formats"
              >
                <Download className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden md:inline">Export</span>
                <ChevronDown
                  className={`w-3 h-3 text-zinc-400 transition-transform ${
                    showExportMenu ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl z-30 p-1.5 text-xs space-y-1">
                  <p className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                    Export Format
                  </p>
                  <button
                    onClick={() => handleExport('txt')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left font-medium transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <div>
                      <div className="font-semibold">Plain Text (.txt)</div>
                      <div className="text-[10px] text-zinc-400">Standard log format</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleExport('md')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left font-medium transition-colors"
                  >
                    <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                    <div>
                      <div className="font-semibold">Markdown (.md)</div>
                      <div className="text-[10px] text-zinc-400">Formatted with headers</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left font-medium transition-colors"
                  >
                    <Code className="w-3.5 h-3.5 text-purple-500" />
                    <div>
                      <div className="font-semibold">JSON (.json)</div>
                      <div className="text-[10px] text-zinc-400">Structured data archival</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'commands' && voiceCommandLogs.length > 0 && onClearVoiceLogs && (
            <button
              onClick={onClearVoiceLogs}
              className="text-xs text-zinc-400 hover:text-red-500 font-medium transition-colors px-2 py-1"
            >
              Clear Log
            </button>
          )}

          {isStreaming && activeTab === 'transcript' && (
            <span className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium hidden sm:flex shrink-0">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              Streaming...
            </span>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 custom-scrollbar">
        {activeTab === 'commands' ? (
          /* --- VOICE COMMAND LOG VIEW --- */
          voiceCommandLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500 space-y-3">
              <div className="p-3 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                <Terminal className="w-8 h-8" />
              </div>
              <div className="max-w-sm space-y-1">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No Voice Commands Logged Yet
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Speak a command directly to the agent during session:
                </p>
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-800/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-700/70 text-left text-xs font-mono space-y-1.5 max-w-xs text-zinc-700 dark:text-zinc-300">
                <p className="text-[10px] uppercase font-sans font-bold text-indigo-500">Supported Trigger Examples:</p>
                <p className="text-purple-600 dark:text-purple-400">"Sonic, remember that my Wifi password is..."</p>
                <p className="text-purple-600 dark:text-purple-400">"Sonic, remember that project name is..."</p>
                <p className="text-indigo-600 dark:text-indigo-400">"Sonic, set playback speed to 1.5x"</p>
              </div>
            </div>
          ) : filteredCommands.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
              <Search className="w-8 h-8 mb-2 opacity-30 text-purple-500" />
              <p className="text-sm font-medium text-zinc-300">No matching voice commands</p>
            </div>
          ) : (
            filteredCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2 hover:border-purple-500/40 transition-all shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {cmd.commandType === 'memory_store' ? (
                      <span className="p-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    ) : cmd.commandType === 'speed_change' ? (
                      <span className="p-1 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <Zap className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                        <Terminal className="w-3.5 h-3.5" />
                      </span>
                    )}

                    <span className="font-bold text-zinc-800 dark:text-zinc-200 capitalize">
                      {cmd.commandType.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-mono">{cmd.timestamp}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Executed
                    </span>
                  </div>
                </div>

                <div className="pl-6 space-y-1">
                  <div className="text-zinc-600 dark:text-zinc-400 italic">
                    "{cmd.rawCommand}"
                  </div>
                  <div className="font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 p-2 rounded-xl border border-indigo-200 dark:border-indigo-800/60">
                    {cmd.parsedAction}
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          /* --- STANDARD TRANSCRIPT VIEW --- */
          transcripts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
              <Sparkles className="w-10 h-10 mb-2 opacity-30 text-indigo-500" />
              <p className="text-sm font-medium">No spoken messages yet</p>
              <p className="text-xs max-w-xs mt-1 text-zinc-400">
                Start the session and speak naturally into your mic. Your transcript will appear live in real time.
              </p>
            </div>
          ) : filteredTranscripts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
              <Search className="w-10 h-10 mb-2 opacity-30 text-indigo-500" />
              <p className="text-sm font-medium text-zinc-300">No matching turns found</p>
              <p className="text-xs max-w-xs mt-1 text-zinc-400">
                No spoken messages matched "{searchQuery}". Try searching for another keyword.
              </p>
            </div>
          ) : (
            filteredTranscripts.map((item) => {
              const isUser = item.sender === 'user';
              const isTool = item.sender === 'tool';

              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-1 text-xs group ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender Metadata Row */}
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    {isUser ? (
                      <>
                        <Clock className="w-3 h-3" />
                        <span>{item.timestamp}</span>
                        {item.detectedLanguage && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 font-mono text-[10px]">
                            <Globe className="w-2.5 h-2.5 inline mr-0.5" />
                            {item.detectedLanguage}
                          </span>
                        )}
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">You</span>
                        <User className="w-3.5 h-3.5 text-indigo-500" />
                      </>
                    ) : isTool ? (
                      <>
                        <Wrench className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-semibold text-amber-500">Tool Execution</span>
                        <Clock className="w-3 h-3" />
                        <span>{item.timestamp}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-semibold text-indigo-500">Agent</span>
                        <Clock className="w-3 h-3" />
                        <span>{item.timestamp}</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`relative max-w-[85%] rounded-2xl p-3.5 text-xs transition-all ${
                      isUser
                        ? 'bg-indigo-600 text-white rounded-tr-none shadow-md'
                        : isTool
                        ? 'bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-200 font-mono text-[11px] rounded-tl-none'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/60 rounded-tl-none shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>

                    {/* Copy Button on Hover */}
                    <button
                      onClick={() => handleCopy(item.id, item.text)}
                      className="absolute right-2 top-2 p-1 rounded-lg bg-black/20 hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Copy text"
                    >
                      {copiedId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

