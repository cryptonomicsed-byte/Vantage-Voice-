import React, { useState } from 'react';
import {
  CloudSun,
  TrendingUp,
  MapPin,
  Languages,
  Users,
  CreditCard,
  Home,
  Sliders,
  Play,
  CheckCircle2,
  Copy,
  Check,
  X,
  Sparkles,
  Terminal,
  Briefcase,
  ShoppingBag,
  Zap,
  Globe,
  Cpu,
} from 'lucide-react';

interface DomainCustomToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunTool?: (toolName: string, toolArgs: Record<string, any>) => void;
}

interface DomainToolDef {
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

const DOMAIN_CUSTOM_TOOLS: DomainToolDef[] = [
  {
    id: 'domain_data_services',
    name: 'Weather, Stocks, Maps & Translation',
    functionName: 'domain_data_services',
    category: 'Domain & Data',
    description: 'Fetch weather forecasts, real-time stock ticker quotes, geocoding maps & driving directions, or translate text across languages.',
    icon: CloudSun,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    badge: 'Weather / Stocks / Maps / Translate',
    defaultArgs: {
      service: 'weather',
      query: 'San Francisco, CA',
      sourceOrTargetLang: 'en->es',
    },
    paramDoc: [
      { name: 'service', type: 'string', desc: 'Service: "weather", "stocks", "maps_route", "translation"', required: true },
      { name: 'query', type: 'string', desc: 'Location, Stock Ticker (e.g. "GOOGL"), Route, or Text', required: true },
      { name: 'sourceOrTargetLang', type: 'string', desc: 'Language pair (e.g. "en->es", "ja->en")' },
    ],
  },
  {
    id: 'crm_salesforce_internal',
    name: 'CRM, Salesforce & Internal APIs',
    functionName: 'crm_salesforce_internal',
    category: 'Enterprise & CRM',
    description: 'Query contacts/leads, update Salesforce deals and account pipelines, or execute internal company REST endpoints.',
    icon: Users,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    badge: 'Salesforce / Hubspot / ERP',
    defaultArgs: {
      action: 'search_leads',
      searchOrEntityId: 'Acme Corp',
      payload: '{"targetStage": "Closed Won", "owner": "swibe@example.com"}',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "search_leads", "get_contact", "update_deal_stage", "call_internal_api"', required: true },
      { name: 'searchOrEntityId', type: 'string', desc: 'Search term, contact ID, or internal API path', required: true },
      { name: 'payload', type: 'string', desc: 'JSON object string for updates or custom parameters' },
    ],
  },
  {
    id: 'payment_ecommerce_actions',
    name: 'Payment & E-Commerce Actions',
    functionName: 'payment_ecommerce_actions',
    category: 'Commerce & Billing',
    description: 'Process payment charges, verify e-commerce order fulfillment status, issue refunds, or query product inventory.',
    icon: CreditCard,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    badge: 'Stripe / Shopify / Billing',
    defaultArgs: {
      action: 'check_order_status',
      amountOrOrderId: 'ORD-9821',
      customerIdOrSku: 'SKU-VOICE-MIC',
    },
    paramDoc: [
      { name: 'action', type: 'string', desc: 'Action: "process_payment", "check_order_status", "issue_refund", "search_inventory"', required: true },
      { name: 'amountOrOrderId', type: 'string', desc: 'Payment amount, Order ID, or search query', required: true },
      { name: 'customerIdOrSku', type: 'string', desc: 'Customer email/ID or Product SKU' },
    ],
  },
  {
    id: 'iot_smart_home_control',
    name: 'IoT & Smart Home Control',
    functionName: 'iot_smart_home_control',
    category: 'Hardware & IoT',
    description: 'Control smart home IoT devices: adjust thermostats, toggle lights, lock/unlock smart doors, or trigger scene macros.',
    icon: Home,
    color: 'text-violet-500 bg-violet-500/10 border-violet-500/20',
    badge: 'Matter / Zigbee / Home Assistant',
    defaultArgs: {
      deviceIdOrGroup: 'living_room_lights',
      command: 'turn_on',
      value: '80% brightness',
    },
    paramDoc: [
      { name: 'deviceIdOrGroup', type: 'string', desc: 'Device, group, or scene (e.g. "thermostat_main")', required: true },
      { name: 'command', type: 'string', desc: 'Command: "turn_on", "turn_off", "set_temperature", "lock", "unlock", "activate_scene"', required: true },
      { name: 'value', type: 'string', desc: 'Target value (e.g. "72F", "80%")' },
    ],
  },
  {
    id: 'custom_business_logic',
    name: 'Custom Business Logic Engine',
    functionName: 'custom_business_logic',
    category: 'Custom Code',
    description: 'Execute tenant-defined custom business rules, calculation algorithms, approval workflows, or serverless script handlers.',
    icon: Sliders,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
    badge: 'Custom Scripts / Rule Engine',
    defaultArgs: {
      functionName: 'calculate_volume_discount',
      inputParams: '{"units": 15000, "customerTier": "enterprise", "country": "US"}',
    },
    paramDoc: [
      { name: 'functionName', type: 'string', desc: 'Rule or custom function name', required: true },
      { name: 'inputParams', type: 'string', desc: 'JSON object string of parameters' },
    ],
  },
];

export const DomainCustomToolsModal: React.FC<DomainCustomToolsModalProps> = ({
  isOpen,
  onClose,
  onRunTool,
}) => {
  const [selectedToolId, setSelectedToolId] = useState<string>('domain_data_services');
  const [toolArgsState, setToolArgsState] = useState<Record<string, Record<string, any>>>(
    () => {
      const initial: Record<string, Record<string, any>> = {};
      DOMAIN_CUSTOM_TOOLS.forEach((t) => {
        initial[t.id] = { ...t.defaultArgs };
      });
      return initial;
    }
  );
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Hook rules guarantee: return null AFTER declaring all hooks
  if (!isOpen) return null;

  const currentTool = DOMAIN_CUSTOM_TOOLS.find((t) => t.id === selectedToolId) || DOMAIN_CUSTOM_TOOLS[0];
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
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Domain-Specific & Custom Toolset
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Weather, Stocks, CRM, Payments, IoT & Custom Rules
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Execute real-world domain integrations: weather, stock quotes, maps, CRM/Salesforce, Stripe billing, smart home IoT, and custom rule scripts.
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
              Domain & Custom Modules
            </p>

            {DOMAIN_CUSTOM_TOOLS.map((t) => {
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
                      ? 'border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-zinc-100 shadow-sm'
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
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-amber-500" /> : <Copy className="w-3.5 h-3.5 text-amber-500" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Spec'}</span>
                </button>
              </div>

              {/* Function Spec */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between text-zinc-500 text-[10px] pb-1 border-b border-zinc-800">
                  <span className="flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-amber-400" /> Domain Tool Function Signature
                  </span>
                  <span>{currentTool.functionName}(args)</span>
                </div>
                <p className="text-amber-400 font-bold">{`function ${currentTool.functionName}(args: {`}</p>
                {currentTool.paramDoc.map((p) => (
                  <p key={p.name} className="pl-4 text-zinc-300">
                    <span className="text-emerald-400">{p.name}</span>
                    {p.required ? '' : '?'}: <span className="text-cyan-400">{p.type}</span>; <span className="text-zinc-500">// {p.desc}</span>
                  </p>
                ))}
                <p className="text-amber-400 font-bold">{`})`}</p>
              </div>

              {/* Input Form */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                  Interactive Test Parameters
                </h4>

                <div className="space-y-3">
                  {currentTool.paramDoc.map((param) => {
                    const isMultiline = param.name === 'payload' || param.name === 'inputParams';
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
                            className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono custom-scrollbar"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentArgs[param.name] ?? ''}
                            onChange={(e) => handleArgChange(param.name, e.target.value)}
                            placeholder={param.desc}
                            className="w-full px-3 py-1.5 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
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
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
              >
                {isExecuting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Executing '{currentTool.functionName}'...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run Domain Tool & Inspect Output</span>
                  </>
                )}
              </button>

              {/* Result Logs */}
              {executionResult && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-500" />
                      Execution Output Payload
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {executionResult.timestamp || 'Just now'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-950 text-amber-400 font-mono text-[11px] border border-zinc-800 max-h-56 overflow-y-auto custom-scrollbar">
                    <pre>{JSON.stringify(executionResult.output || executionResult, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Domain-specific and custom logic tools are callable in real time by the Gemini Live voice agent.
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
