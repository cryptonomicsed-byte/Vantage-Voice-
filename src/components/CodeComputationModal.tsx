import React, { useState } from 'react';
import {
  Code,
  Terminal,
  Calculator,
  Database,
  FolderTree,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  FileText,
  Cpu,
  Layers,
  FileCode,
} from 'lucide-react';

interface CodeComputationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface ComputationToolDef {
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

const COMPUTATION_TOOLS: ComputationToolDef[] = [
  {
    id: 'run_code_interpreter',
    name: 'Code Interpreter & Sandbox',
    functionName: 'run_code_interpreter',
    category: 'Code & Computation',
    description: 'Execute Python, JavaScript, or TypeScript code blocks in a secure isolated sandbox with stdout/stderr execution metrics.',
    icon: Code,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    badge: 'Python / JS Sandbox',
    defaultArgs: {
      language: 'python',
      code: 'import math\n\ndef calculate_fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint("Fibonacci(12) =", calculate_fibonacci(12))',
      args: 'n=12',
    },
    paramDoc: [
      { name: 'code', type: 'string', desc: 'Code snippet block to execute', required: true },
      { name: 'language', type: 'string', desc: 'Programming language ("python", "javascript", "typescript")' },
      { name: 'args', type: 'string', desc: 'Optional arguments or inputs' },
    ],
  },
  {
    id: 'execute_terminal_command',
    name: 'Shell & Terminal Execution',
    functionName: 'execute_terminal_command',
    category: 'Code & Computation',
    description: 'Run shell commands (bash/sh) to check runtime environment, system status, disk usage, or inspect Node/Python packages.',
    icon: Terminal,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'Bash / Terminal',
    defaultArgs: {
      command: 'python3 --version && node -v && df -h',
      cwd: '.',
      timeoutMs: 5000,
    },
    paramDoc: [
      { name: 'command', type: 'string', desc: 'Shell command string to execute', required: true },
      { name: 'cwd', type: 'string', desc: 'Working directory path (default ".")' },
      { name: 'timeoutMs', type: 'number', desc: 'Execution timeout in ms' },
    ],
  },
  {
    id: 'calculate',
    name: 'Math & Scientific Calculator',
    functionName: 'calculate',
    category: 'Code & Computation',
    description: 'Perform advanced mathematical formulas, scientific functions (sin, cos, log2, sqrt), and statistical measures (mean, median, stdDev).',
    icon: Calculator,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    badge: 'Scientific & Stats',
    defaultArgs: {
      expression: 'sin(0.785398) * sqrt(144) + log2(1024)',
      mode: 'scientific',
      values: '12, 18, 25, 34, 42, 58, 88',
    },
    paramDoc: [
      { name: 'expression', type: 'string', desc: 'Mathematical expression string', required: true },
      { name: 'mode', type: 'string', desc: 'Mode ("basic", "scientific", "statistics", "financial")' },
      { name: 'values', type: 'string', desc: 'Comma separated numbers for statistical summary' },
    ],
  },
  {
    id: 'run_data_analysis',
    name: 'Pandas & SQL Data Analysis',
    functionName: 'run_data_analysis',
    category: 'Code & Computation',
    description: 'Run pandas DataFrames or SQL queries over structured tabular datasets, JSON arrays, or CSV files with group aggregations.',
    icon: Database,
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    badge: 'SQL & Pandas',
    defaultArgs: {
      operation: 'sql_query',
      query: 'SELECT category, COUNT(*) as sessions, AVG(accuracy_score) as avg_acc FROM dataset GROUP BY category ORDER BY sessions DESC',
      datasetJson: '[{"category": "Voice", "accuracy_score": 0.99}, {"category": "Code", "accuracy_score": 0.98}]',
    },
    paramDoc: [
      { name: 'operation', type: 'string', desc: 'Analysis type ("sql_query", "pandas_describe", "aggregate_group_by")', required: true },
      { name: 'query', type: 'string', desc: 'SQL statement or pandas query expression', required: true },
      { name: 'datasetJson', type: 'string', desc: 'Optional dataset string in JSON or CSV format' },
    ],
  },
  {
    id: 'local_file_system',
    name: 'Local Workspace File System',
    functionName: 'local_file_system',
    category: 'Code & Computation',
    description: 'Access local workspace file system to read files, write code files, list directory trees, edit file snippets, or check file metadata.',
    icon: FolderTree,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    badge: 'Read / Write / List',
    defaultArgs: {
      operation: 'list',
      filePath: 'src/components',
      content: '',
    },
    paramDoc: [
      { name: 'operation', type: 'string', desc: 'Operation ("read", "write", "list", "edit", "delete")', required: true },
      { name: 'filePath', type: 'string', desc: 'Target file or directory path', required: true },
      { name: 'content', type: 'string', desc: 'Content for write or replacement content for edit' },
    ],
  },
];

export const CodeComputationModal: React.FC<CodeComputationModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('run_code_interpreter');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      COMPUTATION_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTool = COMPUTATION_TOOLS.find((t) => t.id === selectedToolId) || COMPUTATION_TOOLS[0];
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
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Code & Computation Engine
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  5 Engines Active
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sandboxed Python/JS code interpreter, shell terminal execution, math calculator, pandas/SQL, & workspace filesystem.
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
          {/* Left Column: Tool Selector List */}
          <div className="md:col-span-4 p-4 space-y-2 overflow-y-auto custom-scrollbar bg-zinc-50/30 dark:bg-zinc-950/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 mb-1">
              Select Computation Tool
            </p>

            {COMPUTATION_TOOLS.map((t) => {
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

          {/* Right Column: Execution Playground & Parameters */}
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

              {/* Function Signature Code Box */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-emerald-400" /> Function Signature
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

              {/* Input Arguments Form */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Test Computation Parameters
                </h4>

                <div className="space-y-3">
                  {currentTool.paramDoc.map((param) => {
                    const isMultiline = param.name === 'code' || param.name === 'query' || param.name === 'datasetJson';
                    return (
                      <div key={param.name} className="space-y-1">
                        <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                          <span>{param.name}</span>
                          {param.required && <span className="text-rose-500 text-[10px]">Required</span>}
                        </label>
                        {isMultiline ? (
                          <textarea
                            rows={4}
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono custom-scrollbar"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
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
                    <span>Run Computation & View Output</span>
                  </>
                )}
              </button>

              {/* Execution Output Box */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Execution Output Logs
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

            {/* Modal Footer Note */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Code & computation tools are dispatched live by Gemini Live API during real-time voice sessions.
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
