import React, { useState } from 'react';
import {
  GitBranch,
  Github,
  Database,
  Globe,
  Rocket,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  Terminal,
  Code2,
  GitPullRequest,
  Search,
  Server,
  Layers,
  Cpu,
} from 'lucide-react';

interface DevSoftwareToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface DevToolDef {
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

const DEV_TOOLS: DevToolDef[] = [
  {
    id: 'github_dev_tools',
    name: 'GitHub Repo & Code Management',
    functionName: 'github_dev_tools',
    category: 'Development & Software',
    description: 'Search GitHub code/repositories, inspect source code, create issues & pull requests, and manage repository branches.',
    icon: Github,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    badge: 'GitHub REST API',
    defaultArgs: {
      action: 'search_repos',
      repo: 'google-gemini/sonicmind-assistant',
      filePathOrQuery: 'multimodal voice streaming',
      title: 'Enhance WebRTC Latency Buffering',
      body: '## Proposal\nUpgrade audio buffer chunking to sub-50ms window sizes for Gemini Live connection.',
      branch: 'main',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "search_repos", "read_code", "create_issue", "create_pr", "list_branches", "create_branch"', required: true },
      { name: 'repo', type: 'string', desc: 'Target repository path "owner/repo"' },
      { name: 'filePathOrQuery', type: 'string', desc: 'File path or search term' },
      { name: 'title', type: 'string', desc: 'Issue/PR title' },
      { name: 'body', type: 'string', desc: 'Markdown body text' },
      { name: 'branch', type: 'string', desc: 'Target branch name' },
    ],
  },
  {
    id: 'database_query',
    name: 'Database Query (SQL & Vector DBs)',
    functionName: 'database_query',
    category: 'Development & Software',
    description: 'Execute SQL queries (PostgreSQL, MySQL) or vector similarity embeddings search across Pinecone, ChromaDB, or PgVector.',
    icon: Database,
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    badge: 'PostgreSQL / Pinecone / Chroma',
    defaultArgs: {
      dbType: 'sql_postgres',
      action: 'execute_query',
      queryOrVector: 'SELECT session_id, latency_ms, status FROM voice_sessions ORDER BY timestamp DESC LIMIT 5;',
      topK: 5,
    },
    paramDoc: [
      { name: 'dbType', type: 'string', desc: 'DB: "sql_postgres", "sql_mysql", "vector_pinecone", or "vector_chroma"', required: true },
      { name: 'action', type: 'string', desc: 'Action: "execute_query", "similarity_search", or "list_tables"', required: true },
      { name: 'queryOrVector', type: 'string', desc: 'SQL query or semantic vector search text', required: true },
      { name: 'topK', type: 'number', desc: 'Top K nearest matches for vector search' },
    ],
  },
  {
    id: 'make_http_api_call',
    name: 'Generic HTTP API Executor',
    functionName: 'make_http_api_call',
    category: 'Development & Software',
    description: 'Perform HTTP API calls (GET, POST, PUT, DELETE) with custom request headers and JSON payloads to external services.',
    icon: Globe,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'REST / GraphQL / JSON',
    defaultArgs: {
      method: 'GET',
      url: 'https://api.github.com/zen',
      headers: '{"Accept": "application/vnd.github.v3+json"}',
      body: '',
    },
    paramDoc: [
      { name: 'method', type: 'string', desc: 'HTTP Method: "GET", "POST", "PUT", "DELETE"', required: true },
      { name: 'url', type: 'string', desc: 'Endpoint URL', required: true },
      { name: 'headers', type: 'string', desc: 'JSON object string of HTTP headers' },
      { name: 'body', type: 'string', desc: 'Request body JSON payload string' },
    ],
  },
  {
    id: 'manage_deployment',
    name: 'Deployment & CI/CD Pipeline',
    functionName: 'manage_deployment',
    category: 'Development & Software',
    description: 'Trigger deployment container builds, push production code updates, restart cloud services, and inspect deployment logs.',
    icon: Rocket,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    badge: 'Cloud Run & Docker',
    defaultArgs: {
      action: 'trigger_build',
      serviceName: 'sonicmind-voice-applet',
      environment: 'production',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "trigger_build", "deploy_environment", "restart_service", "get_deploy_logs"', required: true },
      { name: 'serviceName', type: 'string', desc: 'Target cloud service or container name' },
      { name: 'environment', type: 'string', desc: 'Environment: "production", "staging", "development"' },
    ],
  },
];

export const DevSoftwareToolsModal: React.FC<DevSoftwareToolsModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('github_dev_tools');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      DEV_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTool = DEV_TOOLS.find((t) => t.id === selectedToolId) || DEV_TOOLS[0];
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
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Development & Software Toolset
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  GitHub, Databases, API & Deploy
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                GitHub PRs/issues, SQL/Vector database queries, generic HTTP REST API calling, and Cloud deployment tools.
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
              Dev & Software Modules
            </p>

            {DEV_TOOLS.map((t) => {
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
                      ? 'border-emerald-500 bg-emerald-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
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

          {/* Right Column: Playground */}
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
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-emerald-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Function Spec */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-emerald-400" /> Dev Tool Function Signature
                  </span>
                  <span>{currentTool.functionName}(args)</span>
                </div>
                <p className="text-emerald-400 font-bold">{`function ${currentTool.functionName}(args: {`}</p>
                {currentTool.paramDoc.map((p) => (
                  <p key={p.name} className="pl-4 text-zinc-300">
                    <span className="text-amber-400">{p.name}</span>
                    {p.required ? '' : '?'}: <span className="text-cyan-400">{p.type}</span>; <span className="text-zinc-500">// {p.desc}</span>
                  </p>
                ))}
                <p className="text-emerald-400 font-bold">{`})`}</p>
              </div>

              {/* Input Form */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Test Execution Parameters
                </h4>

                <div className="space-y-3">
                  {currentTool.paramDoc.map((param) => {
                    const isMultiline = param.name === 'body' || param.name === 'queryOrVector' || param.name === 'headers';
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
                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono custom-scrollbar"
                          />
                        ) : (
                          <input
                            type={param.type === 'number' ? 'number' : 'text'}
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) =>
                              handleArgChange(
                                param.name,
                                param.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                              )
                            }
                            placeholder={param.desc}
                            className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Dev Tool & View Response Payload</span>
                  </>
                )}
              </button>

              {/* Result Logs */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Execution Output Payload
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {executionResult.timestamp || 'Just now'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 text-emerald-400 font-mono text-[11px] border border-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
                    <pre>{JSON.stringify(executionResult.output || executionResult, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Development & software tools are invoked dynamically by the Gemini Live voice agent.
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
