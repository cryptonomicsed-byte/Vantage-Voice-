import React from 'react';
import { RotateCcw, Trash2, MessageSquare, Clock, Sparkles } from 'lucide-react';

interface SessionRestoreBannerProps {
  savedCount: number;
  lastSavedTime?: string;
  onRestore: () => void;
  onDismiss: () => void;
}

export const SessionRestoreBanner: React.FC<SessionRestoreBannerProps> = ({
  savedCount,
  lastSavedTime,
  onRestore,
  onDismiss,
}) => {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl animate-slideDown">
      <div className="p-4 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-indigo-500/30 dark:border-indigo-500/40 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Previous Voice Session Detected
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-indigo-400" />
                {savedCount} transcript turns saved
              </span>
              {lastSavedTime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  {lastSavedTime}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Start Fresh</span>
          </button>

          <button
            onClick={onRestore}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
