import React, { useState } from 'react';
import {
  Search,
  Globe,
  Newspaper,
  BookOpen,
  GraduationCap,
  Eye,
  X,
  Play,
  CheckCircle2,
  Copy,
  Check,
  Code,
  Sparkles,
  ExternalLink,
  Layers,
  Terminal,
} from 'lucide-react';

interface ResearchToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface ToolDefinition {
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

const RESEARCH_TOOLS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'Web Search API',
    functionName: 'web_search',
    category: 'Information & Research',
    description: 'Search the web using Google, Bing, or specialized search APIs for verified live facts, current events, and web links.',
    icon: Search,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
    badge: 'Live Google & Bing',
    defaultArgs: {
      query: 'Latest advancements in speech-to-speech AI 2026',
      engine: 'Google Search',
      searchDepth: 'deep',
    },
    paramDoc: [
      { name: 'query', type: 'string', desc: 'Search query string', required: true },
      { name: 'engine', type: 'string', desc: 'Search engine provider ("Google", "Bing", "DuckDuckGo")' },
      { name: 'searchDepth', type: 'string', desc: 'Search depth mode ("quick" or "deep")' },
    ],
  },
  {
    id: 'browse_web_page',
    name: 'Web Page Scraper & Browser',
    functionName: 'browse_web_page',
    category: 'Information & Research',
    description: 'Browse target web page URLs to fetch full page content, strip HTML markup, extract clean markdown body text, headings, and meta tags.',
    icon: Globe,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    badge: 'DOM Parser',
    defaultArgs: {
      url: 'https://en.wikipedia.org/wiki/Speech-to-speech',
      extractFormat: 'markdown',
      maxCharacters: 2500,
    },
    paramDoc: [
      { name: 'url', type: 'string', desc: 'Target URL to scrape and parse', required: true },
      { name: 'extractFormat', type: 'string', desc: 'Format mode ("text", "markdown", "structured")' },
      { name: 'maxCharacters', type: 'number', desc: 'Max character limit (default 2500)' },
    ],
  },
  {
    id: 'fetch_news_feed',
    name: 'News & Wire Data Feeds',
    functionName: 'fetch_news_feed',
    category: 'Information & Research',
    description: 'Fetch real-time wire news feeds, breaking headlines, published timestamps, and topic-filtered news updates from Reuters, Bloomberg, and FT.',
    icon: Newspaper,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'Real-Time Feeds',
    defaultArgs: {
      category: 'tech',
      keyword: 'artificial intelligence',
      country: 'GLOBAL',
    },
    paramDoc: [
      { name: 'category', type: 'string', desc: 'Category ("top_stories", "tech", "science", "business", "world")' },
      { name: 'keyword', type: 'string', desc: 'Optional keyword filter' },
      { name: 'country', type: 'string', desc: 'Region code ("US", "GLOBAL", "UK", "JP")' },
    ],
  },
  {
    id: 'wikipedia_lookup',
    name: 'Wikipedia Knowledge Lookup',
    functionName: 'wikipedia_lookup',
    category: 'Information & Research',
    description: 'Query structured encyclopedia articles, entity definitions, historical summaries, infobox facts, and related article links.',
    icon: BookOpen,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    badge: 'Encyclopedia & Knowledge',
    defaultArgs: {
      topic: 'Natural Language Processing',
      section: 'Overview',
    },
    paramDoc: [
      { name: 'topic', type: 'string', desc: 'Entity or concept term to look up', required: true },
      { name: 'section', type: 'string', desc: 'Optional section focus ("Overview", "History", etc.)' },
    ],
  },
  {
    id: 'search_arxiv_papers',
    name: 'Academic Paper & arXiv Search',
    functionName: 'search_arxiv_papers',
    category: 'Information & Research',
    description: 'Search scholarly literature and arXiv preprints for scientific papers, authors, abstracts, published dates, arXiv IDs, and direct PDF download links.',
    icon: GraduationCap,
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20',
    badge: 'Scholarly ArXiv API',
    defaultArgs: {
      query: 'Realtime Neural Speech Synthesis',
      category: 'cs.CL',
      sortBy: 'relevance',
    },
    paramDoc: [
      { name: 'query', type: 'string', desc: 'Research topic, algorithm name, or paper title', required: true },
      { name: 'category', type: 'string', desc: 'arXiv category ("cs.AI", "cs.CL", "cs.CV", "stat.ML")' },
      { name: 'sortBy', type: 'string', desc: 'Sort order ("relevance" or "submittedDate")' },
    ],
  },
  {
    id: 'analyze_visual_media',
    name: 'Visual Understanding & Vision Tools',
    functionName: 'analyze_visual_media',
    category: 'Information & Research',
    description: 'Multimodal vision tool for images, video frames, or live camera feeds. Performs scene breakdown, object bounding box detection, and OCR text extraction.',
    icon: Eye,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    badge: 'Multimodal Vision',
    defaultArgs: {
      mediaType: 'image',
      analysisTarget: 'general_description',
      prompt: 'Describe the scene, detect key objects and extract OCR text',
    },
    paramDoc: [
      { name: 'mediaType', type: 'string', desc: 'Source type ("image", "video_frame", "camera_stream")' },
      { name: 'analysisTarget', type: 'string', desc: 'Goal ("general_description", "ocr_text", "object_detection")' },
      { name: 'prompt', type: 'string', desc: 'Visual query prompt' },
    ],
  },
];

export const ResearchToolsModal: React.FC<ResearchToolsModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('web_search');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      RESEARCH_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentTool = RESEARCH_TOOLS.find((t) => t.id === selectedToolId) || RESEARCH_TOOLS[0];
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
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Information & Research Tools Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                  6 Tools Active
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Live research suite for agent web search, page scraping, news feeds, Wikipedia, arXiv & vision tools.
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
              Select Tool to Inspect & Test
            </p>

            {RESEARCH_TOOLS.map((t) => {
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
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-indigo-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Function Signature Code Box */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-indigo-400" /> Function Signature
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

              {/* Input Arguments Form */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Test Execution Arguments
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentTool.paramDoc.map((param) => (
                    <div key={param.name} className="space-y-1">
                      <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                        <span>{param.name}</span>
                        {param.required && <span className="text-rose-500 text-[10px]">Required</span>}
                      </label>
                      <input
                        type="text"
                        value={currentArgs[param.name] ?? ''}
                        onChange={(e) => handleArgChange(param.name, e.target.value)}
                        placeholder={param.desc}
                        className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleExecuteTool}
                disabled={isExecuting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing Tool '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Execute Tool & View Response</span>
                  </>
                )}
              </button>

              {/* Execution Output Box */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Execution Output (JSON)
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
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                These tools are automatically dispatched by Gemini Live API during real-time speech interaction.
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
