import React, { useState } from 'react';
import {
  Mail,
  MessageSquare,
  Calendar,
  FileText,
  Send,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  Terminal,
  Bell,
  Smartphone,
  Hash,
  Users,
  Database,
  Layers,
} from 'lucide-react';

interface CommunicationProductivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface CommToolDef {
  id: string;
  name: string;
  functionName: string;
  category: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge: string;
  defaultArgs: Record<string, any>;
  paramDoc: Array<{ name: string; type: string; desc: string; required?: boolean }>;
}

const COMM_TOOLS: CommToolDef[] = [
  {
    id: 'manage_email',
    name: 'Email Engine (Send & Read)',
    functionName: 'manage_email',
    category: 'Communication & Productivity',
    description: 'Send emails or search and read inbox threads via Gmail API or SMTP/IMAP protocols with structured thread context.',
    icon: Mail,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    badge: 'Gmail & SMTP',
    defaultArgs: {
      action: 'send',
      recipient: 'alex.dev@example.com',
      subject: 'SonicMind AI Voice Assistant Session Summary',
      body: 'Hi Alex,\n\nThe latest speech-to-speech AI agent session completed with 124ms latency across all tool dispatches.\n\nBest regards,\nSonicMind Agent',
      searchQuery: 'is:unread',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "send", "read_inbox", "search_messages", or "get_thread"', required: true },
      { name: 'recipient', type: 'string', desc: 'Recipient email address' },
      { name: 'subject', type: 'string', desc: 'Email subject line' },
      { name: 'body', type: 'string', desc: 'Email body text or HTML content' },
      { name: 'searchQuery', type: 'string', desc: 'Search filter string' },
    ],
  },
  {
    id: 'send_chat_message',
    name: 'Slack / Discord / Teams Messaging',
    functionName: 'send_chat_message',
    category: 'Communication & Productivity',
    description: 'Dispatch real-time chat messages, markdown alerts, and team updates directly into Slack, Discord, or Microsoft Teams channels.',
    icon: MessageSquare,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    badge: 'Slack / Discord / Teams',
    defaultArgs: {
      platform: 'slack',
      channelOrUser: '#dev-announcements',
      message: '🚀 *SonicMind Update*: Real-time Voice Agent deployed on Cloud Run container with multi-tool capabilities active.',
    },
    paramDoc: [
      { name: 'platform', type: 'string', desc: 'Platform: "slack", "discord", or "teams"', required: true },
      { name: 'channelOrUser', type: 'string', desc: 'Target channel (#general) or user handle', required: true },
      { name: 'message', type: 'string', desc: 'Message body text or markdown payload', required: true },
    ],
  },
  {
    id: 'manage_calendar_events',
    name: 'Calendar Sync (Google & Outlook)',
    functionName: 'manage_calendar_events',
    category: 'Communication & Productivity',
    description: 'Schedule, list, update, or remove calendar events, meetings, and automated reminders across Google Calendar and Outlook.',
    icon: Calendar,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    badge: 'Google & Outlook Cal',
    defaultArgs: {
      action: 'create_event',
      title: 'SonicMind AI Architecture Review & Demo',
      startTime: '2026-08-07T10:00:00Z',
      endTime: '2026-08-07T11:00:00Z',
      attendees: 'alex@example.com, lead@example.com',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "list_events", "create_event", "update_event", "delete_event"', required: true },
      { name: 'title', type: 'string', desc: 'Meeting or event title' },
      { name: 'startTime', type: 'string', desc: 'Start ISO timestamp' },
      { name: 'endTime', type: 'string', desc: 'End ISO timestamp' },
      { name: 'attendees', type: 'string', desc: 'Comma separated email list' },
    ],
  },
  {
    id: 'manage_docs_and_notion',
    name: 'Notion, Google Docs & Sheets',
    functionName: 'manage_docs_and_notion',
    category: 'Communication & Productivity',
    description: 'Read or append structured pages, documents, or spreadsheet dataset rows in Notion databases, Google Docs, or Google Sheets.',
    icon: FileText,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'Notion / Docs / Sheets',
    defaultArgs: {
      provider: 'notion',
      action: 'append_content',
      documentId: 'page_98241',
      content: '## Meeting Notes\n- Verified 120ms voice response latency\n- Added Communication & Productivity tool suite',
    },
    paramDoc: [
      { name: 'provider', type: 'string', desc: 'Provider: "notion", "google_docs", or "google_sheets"', required: true },
      { name: 'action', type: 'string', desc: 'Action: "read_page", "append_content", "query_database", "append_row"', required: true },
      { name: 'documentId', type: 'string', desc: 'Target page/document/spreadsheet ID' },
      { name: 'content', type: 'string', desc: 'Content to append or write' },
    ],
  },
  {
    id: 'send_sms_notification',
    name: 'SMS & Desktop Notifications',
    functionName: 'send_sms_notification',
    category: 'Communication & Productivity',
    description: 'Send instant SMS text messages via Twilio or trigger native desktop system notifications and alerts.',
    icon: Bell,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    badge: 'SMS / Twilio / Push',
    defaultArgs: {
      type: 'sms',
      phoneNumber: '+14155552671',
      message: 'SonicMind Alert: Session completed successfully. All metrics nominal.',
    },
    paramDoc: [
      { name: 'type', type: 'string', desc: 'Type: "sms" or "desktop_push"', required: true },
      { name: 'phoneNumber', type: 'string', desc: 'Target phone number for SMS' },
      { name: 'message', type: 'string', desc: 'Notification message body', required: true },
    ],
  },
];

export const CommunicationProductivityModal: React.FC<CommunicationProductivityModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('manage_email');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      COMM_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTool = COMM_TOOLS.find((t) => t.id === selectedToolId) || COMM_TOOLS[0];
  const currentArgs = toolArgsState[selectedToolId] || currentTool.defaultArgs;

  const handleArgChange = (paramKey: string, val: any) => {
    setToolArgsState((prev) => ({
      ...prev,
      [selectedToolId]: {
        ...prev[selectedToolId],
        [paramKey]: val,
      },
    }));
  };

  const handleExecuteTool = async () => {
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const response = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentTool.functionName,
          args: currentArgs,
        }),
      });

      const data = await response.json();
      setExecutionResult(data);

      if (onRunTool) {
        onRunTool(currentTool.functionName, currentArgs);
      }
    } catch (err: any) {
      setExecutionResult({
        error: err?.message || 'Failed to execute tool',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopySchema = () => {
    const schemaJson = JSON.stringify(
      {
        name: currentTool.functionName,
        description: currentTool.description,
        parameters: currentTool.defaultArgs,
      },
      null,
      2
    );
    navigator.clipboard.writeText(schemaJson);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-850/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Communication & Productivity Suite
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  Gmail, Slack, Calendar & Notion
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Email send/read, Slack/Discord messaging, Google Calendar sync, Notion/Docs access, and SMS alerts.
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
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
          {/* Left Column: Tool List */}
          <div className="md:col-span-4 p-4 space-y-2 overflow-y-auto custom-scrollbar bg-zinc-50/30 dark:bg-zinc-950/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 mb-1">
              Communication Tools
            </p>

            {COMM_TOOLS.map((t) => {
              const isSelected = t.id === selectedToolId;
              const IconComp = t.icon;

              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedToolId(t.id);
                    setExecutionResult(null);
                  }}
                  className={`w-full text-left p-3 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs flex items-center gap-2">
                      <span className={`p-1 rounded-lg border ${t.color}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </span>
                      {t.name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
                      {t.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Column: Execution Playground */}
          <div className="md:col-span-8 p-6 overflow-y-auto custom-scrollbar space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Tool Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`p-1.5 rounded-xl border ${currentTool.color}`}>
                      <currentTool.icon className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {currentTool.name}
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {currentTool.description}
                  </p>
                </div>

                <button
                  onClick={handleCopySchema}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 font-medium transition-colors"
                  title="Copy tool function declaration"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-blue-500" /> : <Copy className="w-3.5 h-3.5 text-blue-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Function Spec */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-blue-400" /> Function Signature
                  </span>
                  <span>{currentTool.functionName}(args)</span>
                </div>
                <p className="text-blue-400 font-bold">{`function ${currentTool.functionName}(args: {`}</p>
                {currentTool.paramDoc.map((p) => (
                  <p key={p.name} className="pl-4 text-zinc-300">
                    <span className="text-amber-400">{p.name}</span>
                    {p.required ? '' : '?'}: <span className="text-cyan-400">{p.type}</span>; <span className="text-zinc-500">// {p.desc}</span>
                  </p>
                ))}
                <p className="text-blue-400 font-bold">{`})`}</p>
              </div>

              {/* Form Input Fields */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Test Execution Parameters
                </h4>

                <div className="space-y-3">
                  {currentTool.paramDoc.map((param) => {
                    const isMultiline = param.name === 'body' || param.name === 'message' || param.name === 'content';
                    return (
                      <div key={param.name} className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                          <span>{param.name}</span>
                          {param.required && <span className="text-rose-500 text-[10px]">Required</span>}
                        </label>
                        {isMultiline ? (
                          <textarea
                            rows={3}
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono custom-scrollbar"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleExecuteTool}
                disabled={isExecuting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Dispatch Communication Payload & View Result</span>
                  </>
                )}
              </button>

              {/* Result Feedback */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      Execution Output Logs
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {executionResult.timestamp || 'Just now'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 text-blue-400 font-mono text-[11px] border border-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
                    <pre>{JSON.stringify(executionResult.output || executionResult, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Communication and productivity tools are triggered live by the Gemini Live agent.
              </span>
              <button
                onClick={onClose}
                className="px-3 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
