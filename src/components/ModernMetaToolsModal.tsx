import React, { useState } from 'react';
import {
  Layers,
  Search,
  Bot,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  Terminal,
  Cpu,
  Network,
  Share2,
  Workflow,
  Zap,
  Box,
  Key,
} from 'lucide-react';

interface ModernMetaToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface MetaToolDef {
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

const MODERN_META_TOOLS: MetaToolDef[] = [
  {
    id: 'mcp_server_client',
    name: 'Model Context Protocol (MCP) Client',
    functionName: 'mcp_server_client',
    category: 'MCP Standards',
    description: 'Connect to external Model Context Protocol (MCP) servers via SSE, Stdio, or WebSockets to discover tools, inspect resources, and execute standardized MCP endpoints.',
    icon: Network,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    badge: 'MCP Protocol v1.0',
    defaultArgs: {
      serverUrlOrCommand: 'sse://mcp.github.com/sse',
      action: 'list_tools',
      toolName: 'search_repositories',
      argumentsJson: '{"query": "gemini live audio"}',
    },
    paramDoc: [
      { name: 'serverUrlOrCommand', type: 'string', desc: 'Server SSE URL, Stdio command, or WebSocket endpoint', required: true },
      { name: 'action', type: 'string', desc: 'Action: "list_tools", "call_tool", "list_resources", "read_resource", "get_prompts"', required: true },
      { name: 'toolName', type: 'string', desc: 'Target MCP tool name (for call_tool action)' },
      { name: 'argumentsJson', type: 'string', desc: 'JSON string arguments passed to target MCP tool' },
    ],
  },
  {
    id: 'tool_search_retrieval',
    name: 'Dynamic Tool Search & Retrieval Engine',
    functionName: 'tool_search_retrieval',
    category: 'Meta-Retrieval',
    description: 'Vector & keyword search engine for agent tools. Dynamically retrieves top matching tool schemas based on user intent so the model is not overwhelmed by 50+ tools at once.',
    icon: Search,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    badge: '78% Prompt Savings',
    defaultArgs: {
      query: 'search github code repositories or database tables',
      category: 'all',
      topK: 5,
    },
    paramDoc: [
      { name: 'query', type: 'string', desc: 'Intent query phrase (e.g. "send email", "adjust thermostat")', required: true },
      { name: 'category', type: 'string', desc: 'Category filter: "all", "search", "coding", "communication", "domain", "mcp"' },
      { name: 'topK', type: 'number', desc: 'Top K tools to retrieve (default 5)' },
    ],
  },
  {
    id: 'multi_agent_tool_delegation',
    name: 'Multi-Agent Tool Delegation Engine',
    functionName: 'multi_agent_tool_delegation',
    category: 'Agent Orchestration',
    description: 'Allows a primary agent to spawn, delegate tasks to, or query specialized AI sub-agents (Research, Code Architect, Security Auditor, Data Analyst) as a tool call.',
    icon: Bot,
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    badge: 'Sub-Agent Delegation',
    defaultArgs: {
      targetAgentRole: 'research_specialist',
      taskPrompt: 'Synthesize recent benchmarking papers on low-latency WebRTC speech audio streaming.',
      contextMemory: '{"priority": "high", "maxTokens": 1024}',
      awaitResponse: true,
    },
    paramDoc: [
      { name: 'targetAgentRole', type: 'string', desc: 'Role: "research_specialist", "code_architect", "security_auditor", "data_analyst", "qa_tester"', required: true },
      { name: 'taskPrompt', type: 'string', desc: 'Detailed task prompt delegated to sub-agent', required: true },
      { name: 'contextMemory', type: 'string', desc: 'Optional JSON memory or context passed to sub-agent' },
      { name: 'awaitResponse', type: 'boolean', desc: 'Awaits synchronous result (true) or async execution (false)' },
    ],
  },
];

export const ModernMetaToolsModal: React.FC<ModernMetaToolsModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('mcp_server_client');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      MODERN_META_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Hook rules guarantee: declare all hooks BEFORE return null
  if (!isOpen) return null;

  const currentTool = MODERN_META_TOOLS.find((t) => t.id === selectedToolId) || MODERN_META_TOOLS[0];
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
            <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Modern Standards & Meta-Tools
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                  MCP Protocol • Tool Retrieval • Multi-Agent Delegation
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Plug in Model Context Protocol (MCP) servers, perform semantic tool retrieval to prevent prompt overload, or delegate sub-tasks to specialized AI agents.
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
              Meta Architecture Modules
            </p>

            {MODERN_META_TOOLS.map((t) => {
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
                      ? 'border-purple-500 bg-purple-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
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
                  title="Copy function declaration"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-purple-500" /> : <Copy className="w-3.5 h-3.5 text-purple-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Function Spec */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-purple-400" /> Meta Tool Signature
                  </span>
                  <span>{currentTool.functionName}(args)</span>
                </div>
                <p className="text-purple-400 font-bold">{`function ${currentTool.functionName}(args: {`}</p>
                {currentTool.paramDoc.map((p) => (
                  <p key={p.name} className="pl-4 text-zinc-300">
                    <span className="text-emerald-400">{p.name}</span>
                    {p.required ? '' : '?'}: <span className="text-cyan-400">{p.type}</span>; <span className="text-zinc-500">// {p.desc}</span>
                  </p>
                ))}
                <p className="text-purple-400 font-bold">{`})`}</p>
              </div>

              {/* Input Form */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Interactive Meta Parameters
                </h4>

                <div className="space-y-3">
                  {currentTool.paramDoc.map((param) => {
                    const isMultiline = param.name === 'taskPrompt' || param.name === 'contextMemory' || param.name === 'argumentsJson';
                    const isBoolean = param.type === 'boolean';

                    return (
                      <div key={param.name} className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                          <span>{param.name}</span>
                          {param.required && <span className="text-rose-500 text-[10px]">Required</span>}
                        </label>
                        {isBoolean ? (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="checkbox"
                              checked={!!currentArgs[param.name]}
                              onChange={(e) => handleArgChange(param.name, e.target.checked)}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                            />
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">{param.desc}</span>
                          </div>
                        ) : isMultiline ? (
                          <textarea
                            rows={3}
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono custom-scrollbar"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Meta Tool & Inspect Payload</span>
                  </>
                )}
              </button>

              {/* Result Logs */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-purple-500" />
                      Execution Output Payload
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {executionResult.timestamp || 'Just now'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 text-purple-300 font-mono text-[11px] border border-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
                    <pre>{JSON.stringify(executionResult.output || executionResult, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                Meta tools enable standardized MCP server discovery, vector tool retrieval, and agent delegation.
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
