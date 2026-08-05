import React, { useEffect, useRef, useState } from 'react';
import { TranscriptItem } from '../types';
import { User, Sparkles, Wrench, Copy, Check, Clock, Volume2, Globe, FileText, Loader2 } from 'lucide-react';

interface TranscriptViewProps {
  transcripts: TranscriptItem[];
  onPlayAudio?: (base64Audio: string) => void;
  onGenerateSummary?: () => void;
  isStreaming?: boolean;
  isGeneratingSummary?: boolean;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  transcripts,
  onPlayAudio,
  onGenerateSummary,
  isStreaming = false,
  isGeneratingSummary = false,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full flex flex-col h-[380px] sm:h-[460px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Live Transcript</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
            {transcripts.length} turns
          </span>
        </div>

        <div className="flex items-center gap-2">
          {transcripts.length > 0 && onGenerateSummary && (
            <button
              onClick={onGenerateSummary}
              disabled={isGeneratingSummary}
              title="Generate AI summary of conversation history"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 border border-indigo-200 dark:border-indigo-800/80 text-xs font-semibold text-indigo-600 dark:text-indigo-300 transition-all active:scale-95 disabled:opacity-50"
            >
              {isGeneratingSummary ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Session Summary</span>
            </button>
          )}

          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              Streaming...
            </span>
          )}
        </div>
      </div>

      {/* Transcript Items Container */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 custom-scrollbar">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 dark:text-zinc-500">
            <Sparkles className="w-10 h-10 mb-2 opacity-30 text-indigo-500" />
            <p className="text-sm font-medium">No spoken messages yet</p>
            <p className="text-xs max-w-xs mt-1 text-zinc-400">
              Start the session and speak naturally into your mic. Your transcript will appear live in real time.
            </p>
          </div>
        ) : (
          transcripts.map((item) => {
            const isUser = item.sender === 'user';
            const isTool = item.sender === 'tool';

            if (isTool) {
              return (
                <div key={item.id} className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-mono">
                  <Wrench className="w-4 h-4 shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <span className="font-bold">Function Tool Executed:</span> {item.toolName}
                    {item.text && <p className="mt-0.5 opacity-90">{item.text}</p>}
                  </div>
                  <span className="text-[10px] opacity-60">{item.timestamp}</span>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className={`flex gap-3 group transition-all ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold shadow-md ${
                    isUser
                      ? 'bg-gradient-to-tr from-indigo-600 to-blue-500'
                      : 'bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div
                  className={`max-w-[82%] sm:max-w-[75%] rounded-2xl p-3.5 shadow-sm text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-zinc-100 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/60 rounded-tl-none'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 opacity-80 text-[11px]">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span>{isUser ? 'You' : 'Sonic AI'}</span>
                      {item.detectedLanguage && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/25 border border-indigo-400/30 text-indigo-100">
                          <Globe className="w-2.5 h-2.5" />
                          {item.detectedLanguage}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 opacity-70">
                      <Clock className="w-3 h-3" />
                      {item.timestamp}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap">{item.text || (item.isFinal ? '' : '...')}</p>

                  {/* Bubble Actions */}
                  <div className="flex items-center justify-end gap-2 mt-2 pt-1.5 border-t border-black/10 dark:border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.audioBase64 && onPlayAudio && (
                      <button
                        onClick={() => onPlayAudio(item.audioBase64!)}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title="Replay Audio"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(item.id, item.text)}
                      className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      title="Copy text"
                    >
                      {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
