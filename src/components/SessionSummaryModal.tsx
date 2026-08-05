import React, { useState } from 'react';
import { SessionSummary } from '../types';
import {
  Sparkles,
  CheckCircle2,
  ListChecks,
  Tag,
  Smile,
  FileText,
  Copy,
  Check,
  Download,
  X,
  Bot,
  Brain,
  Clock,
  MessageSquare,
  Activity,
  Layers,
} from 'lucide-react';

interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SessionSummary | null;
  isLoading: boolean;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  isLoading,
}) => {
  const [copied, setCopied] = useState(false);
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const toggleAction = (index: number) => {
    setCompletedActions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleCopyMarkdown = () => {
    if (!summary) return;
    const text = `# AI Voice Session Summary
**Generated at:** ${summary.createdAt || new Date().toLocaleString()}
**Agent Framework:** ${summary.agentFrameworkUsed || 'Native Gemini S2S'}
**Total Turns:** ${summary.totalTurns || 0}
**Tone / Sentiment:** ${summary.sentiment}

## Executive Summary
${summary.executiveSummary}

## Key Takeaways
${summary.keyTakeaways.map((t) => `- ${t}`).join('\n')}

## Action Items
${summary.actionItems.map((a) => `- [ ] ${a}`).join('\n')}

## Key Topics
${summary.keyTopics.map((tp) => `#${tp}`).join(' ')}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!summary) return;
    const text = `# AI Voice Session Summary
Generated at: ${summary.createdAt || new Date().toLocaleString()}
Agent Framework: ${summary.agentFrameworkUsed || 'Native Gemini S2S'}

Executive Summary:
${summary.executiveSummary}

Key Takeaways:
${summary.keyTakeaways.map((t) => `• ${t}`).join('\n')}

Action Items:
${summary.actionItems.map((a) => `• [ ] ${a}`).join('\n')}

Topics Discussed:
${summary.keyTopics.join(', ')}
`;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-summary-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Session Intelligence Summary
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Generated via Gemini 3.6 Flash Server Engine
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <Brain className="w-6 h-6 text-indigo-500 absolute top-3 left-3 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Synthesizing Conversation Intelligence...
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
                  Analyzing speech turn transcripts, extracting key takeaways, and mapping action items.
                </p>
              </div>
            </div>
          ) : !summary ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-zinc-400">
              <FileText className="w-12 h-12 mb-3 opacity-40 text-indigo-400" />
              <p className="text-sm font-medium text-zinc-300">No session transcript data available</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Start a voice conversation, exchange a few turns, and stop the session to generate an AI summary.
              </p>
            </div>
          ) : (
            <>
              {/* Stat Badges Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400">
                      Framework
                    </span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 capitalize">
                      {summary.agentFrameworkUsed || 'Native S2S'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-emerald-500" />
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400">
                      Total Turns
                    </span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {summary.totalTurns || 0} messages
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-amber-500" />
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400">
                      Sentiment
                    </span>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {summary.sentiment || 'Focused'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-cyan-500" />
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-zinc-500 dark:text-zinc-400">
                      Generated At
                    </span>
                    <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300">
                      {summary.createdAt ? new Date(summary.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Executive Overview */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Executive Overview
                </h4>
                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
                  {summary.executiveSummary}
                </div>
              </div>

              {/* Key Takeaways */}
              {summary.keyTakeaways && summary.keyTakeaways.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Key Insights & Takeaways
                  </h4>
                  <ul className="space-y-2">
                    {summary.keyTakeaways.map((takeaway, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {summary.actionItems && summary.actionItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4" /> Recommended Action Items
                  </h4>
                  <div className="space-y-2">
                    {summary.actionItems.map((action, idx) => {
                      const isDone = completedActions[idx];
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleAction(idx)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isDone
                              ? 'bg-zinc-100 dark:bg-zinc-800/30 border-zinc-300 dark:border-zinc-800 text-zinc-400 line-through'
                              : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60 text-zinc-800 dark:text-zinc-200 hover:border-amber-500/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!isDone}
                            onChange={() => {}}
                            className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                          />
                          <span className="text-xs sm:text-sm">{action}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Topics Discussed */}
              {summary.keyTopics && summary.keyTopics.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Tag className="w-4 h-4" /> Key Topics Covered
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {summary.keyTopics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-full text-xs font-medium font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                      >
                        #{topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        {summary && !isLoading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              Download Report (.md)
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy Summary'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
