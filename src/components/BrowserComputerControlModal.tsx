import React, { useState } from 'react';
import {
  Globe,
  Monitor,
  ScanText,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  MousePointer,
  Keyboard,
  Compass,
  Layout,
  Eye,
  Sliders,
  Terminal,
  Layers,
  Crop,
  Layers2,
} from 'lucide-react';

interface BrowserComputerControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface ControlToolDef {
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

const CONTROL_TOOLS: ControlToolDef[] = [
  {
    id: 'automate_browser',
    name: 'Browser Automation (Stagehand & Browser Use)',
    functionName: 'automate_browser',
    category: 'Browser & Computer Control',
    description: 'Automate web browsing with intelligent agent navigation, CSS/XPath clicking, form typing, DOM scraping, and script execution.',
    icon: Globe,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    badge: 'Stagehand / Headless',
    defaultArgs: {
      action: 'navigate',
      url: 'https://news.ycombinator.com',
      selector: 'a.titlelink',
      text: 'AI Agent Workflows',
      script: 'document.title',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "navigate", "click", "type", "fill_form", "scroll", "evaluate_script"', required: true },
      { name: 'url', type: 'string', desc: 'Target website URL for navigate' },
      { name: 'selector', type: 'string', desc: 'CSS selector or XPath expression' },
      { name: 'text', type: 'string', desc: 'Text content to type into input fields' },
      { name: 'script', type: 'string', desc: 'Optional JS snippet to evaluate' },
    ],
  },
  {
    id: 'desktop_computer_control',
    name: 'Desktop OS & Computer Use',
    functionName: 'desktop_computer_control',
    category: 'Browser & Computer Control',
    description: 'Control desktop OS screen with virtual mouse movements (X, Y), left/right/double clicks, keyboard shortcuts, and full screen captures.',
    icon: Monitor,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    badge: 'Mouse & Keyboard',
    defaultArgs: {
      action: 'mouse_click',
      coordinateX: 960,
      coordinateY: 540,
      clickType: 'left_click',
      keys: 'Ctrl+Shift+I',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "screenshot", "mouse_move", "mouse_click", "keyboard_type", "hotkey"', required: true },
      { name: 'coordinateX', type: 'number', desc: 'Horizontal pixel coordinate X (0-1920)' },
      { name: 'coordinateY', type: 'number', desc: 'Vertical pixel coordinate Y (0-1080)' },
      { name: 'clickType', type: 'string', desc: 'Click type: "left_click", "right_click", "double_click"' },
      { name: 'keys', type: 'string', desc: 'Keyboard key sequence or shortcut' },
    ],
  },
  {
    id: 'read_screen_ocr',
    name: 'Screen Reader & Visual OCR',
    functionName: 'read_screen_ocr',
    category: 'Browser & Computer Control',
    description: 'Perform visual OCR and layout bounding-box recognition on screen captures to extract text, buttons, and UI element positions.',
    icon: ScanText,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'Vision OCR & BBoxes',
    defaultArgs: {
      region: 'full_screen',
      cropBox: '0, 0, 1920, 1080',
      keywordFilter: 'Status',
    },
    paramDoc: [
      { name: 'region', type: 'string', desc: 'Target region: "full_screen", "active_window", or "custom_crop"' },
      { name: 'cropBox', type: 'string', desc: 'Optional pixel bounding box "X, Y, Width, Height"' },
      { name: 'keywordFilter', type: 'string', desc: 'Filter keyword for targeted text matching' },
    ],
  },
];

export const BrowserComputerControlModal: React.FC<BrowserComputerControlModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('automate_browser');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      CONTROL_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTool = CONTROL_TOOLS.find((t) => t.id === selectedToolId) || CONTROL_TOOLS[0];
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
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Browser & Computer Control Suite
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  Autonomous Web & Desktop
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Stagehand web browser automation, OS virtual mouse/keyboard control, and visual screen OCR reading.
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
          {/* Left Column: Tool Selector */}
          <div className="md:col-span-4 p-4 space-y-2 overflow-y-auto custom-scrollbar bg-zinc-50/30 dark:bg-zinc-950/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-2 mb-1">
              Control Engines
            </p>

            {CONTROL_TOOLS.map((t) => {
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
                      ? 'border-indigo-500 bg-indigo-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
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
              {/* Tool Title */}
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
                  title="Copy tool declaration"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-indigo-500" /> : <Copy className="w-3.5 h-3.5 text-indigo-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Signature Box */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-indigo-400" /> Control Function Spec
                  </span>
                  <span>{currentTool.functionName}(args)</span>
                </div>
                <p className="text-indigo-400 font-bold">{`function ${currentTool.functionName}(args: {`}</p>
                {currentTool.paramDoc.map((p) => (
                  <p key={p.name} className="pl-4 text-zinc-300">
                    <span className="text-amber-400">{p.name}</span>
                    {p.required ? '' : '?'}: <span className="text-cyan-400">{p.type}</span>; <span className="text-zinc-500">// {p.desc}</span>
                  </p>
                ))}
                <p className="text-indigo-400 font-bold">{`})`}</p>
              </div>

              {/* Form Input Fields */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Test Execution Parameters
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentTool.paramDoc.map((param) => {
                    const isFullWidth = param.name === 'url' || param.name === 'script' || param.name === 'keys';
                    return (
                      <div key={param.name} className={`space-y-1 ${isFullWidth ? 'sm:col-span-2' : ''}`}>
                        <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                          <span>{param.name}</span>
                          {param.required && <span className="text-rose-500 text-[10px]">Required</span>}
                        </label>
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
                          className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Execute Button */}
              <button
                onClick={handleExecuteTool}
                disabled={isExecuting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Dispatch Control Command & Inspect Output</span>
                  </>
                )}
              </button>

              {/* Output Display */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500" />
                      Command Execution Feedback
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {executionResult.timestamp || 'Just now'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 text-indigo-400 font-mono text-[11px] border border-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
                    <pre>{JSON.stringify(executionResult.output || executionResult, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                Browser & computer control tools are invoked in real-time by the Gemini Live agent.
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
