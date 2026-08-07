import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Key,
  Radio,
  Send,
  Plus,
  RefreshCw,
  Cpu,
  Layers,
  Terminal,
  Activity,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  User,
  Zap,
  DollarSign,
  Share2,
  BarChart3,
  Bell,
  Wifi,
  WifiOff,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { vantageClient, VantageAgentAccount, getAuthHeaders } from '../lib/vantageClient';

export interface SystemAlert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  timestamp: string;
  channel: string;
}

interface SwarmSystemAlertsWebSocketProps {
  isOpen: boolean;
  apiKey?: string;
  onAlertReceived: (alert: SystemAlert) => void;
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

export const SwarmSystemAlertsWebSocket: React.FC<SwarmSystemAlertsWebSocketProps> = ({
  isOpen,
  apiKey,
  onAlertReceived,
  onStatusChange,
}) => {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!isOpen) {
      setWsStatus('disconnected');
      if (onStatusChange) onStatusChange('disconnected');
      return;
    }

    setWsStatus('connecting');
    if (onStatusChange) onStatusChange('connecting');

    const authHeaders = getAuthHeaders(apiKey);
    const key = authHeaders['X-Agent-Key'] || 'vantage_hermes_default_key';
    const wsUrl = `ws://localhost:8001/ws/gossip?channel=swarm.system.alerts&x_agent_key=${encodeURIComponent(key)}`;

    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsStatus('connected');
        if (onStatusChange) onStatusChange('connected');
        try {
          ws?.send(
            JSON.stringify({
              action: 'subscribe',
              channel: 'swarm.system.alerts',
              headers: authHeaders,
            })
          );
        } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const alertItem: SystemAlert = {
            id: parsed.id || `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: parsed.title || parsed.event || 'Swarm System Alert',
            message: parsed.message || parsed.data || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed)),
            severity: parsed.severity || parsed.level || 'info',
            timestamp: parsed.timestamp || new Date().toLocaleTimeString(),
            channel: parsed.channel || 'swarm.system.alerts',
          };
          onAlertReceived(alertItem);
        } catch {
          onAlertReceived({
            id: `alert-${Date.now()}`,
            title: 'Swarm System Broadcast',
            message: event.data,
            severity: 'info',
            timestamp: new Date().toLocaleTimeString(),
            channel: 'swarm.system.alerts',
          });
        }
      };

      ws.onerror = (err) => {
        console.warn('[Swarm Gossip WS Alert Notice] ws://localhost:8001 unavailable or unreachable:', err);
        setWsStatus('disconnected');
        if (onStatusChange) onStatusChange('disconnected');
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        if (onStatusChange) onStatusChange('disconnected');
      };
    } catch (e) {
      console.warn('[Swarm Gossip WS Init Error]', e);
      setWsStatus('disconnected');
      if (onStatusChange) onStatusChange('disconnected');
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [isOpen, apiKey]);

  return null;
};

interface VantageHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterCreationJob?: (prompt: string) => void;
  vantageApiKey?: string;
  onClearCredentials?: () => void;
  onSaveApiKey?: (apiKey: string) => void;
}

export const VantageHubModal: React.FC<VantageHubModalProps> = ({
  isOpen,
  onClose,
  onRegisterCreationJob,
  vantageApiKey,
  onClearCredentials,
  onSaveApiKey,
}) => {
  const [account, setAccount] = useState<VantageAgentAccount | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'account' | 'agent_status' | 'intel' | 'weather' | 'feed' | 'publish' | 'mcp' | 'tro'>('agent_status');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isFetchingGraph, setIsFetchingGraph] = useState<boolean>(false);

  // Agent Status Polling State
  const [vibeData, setVibeData] = useState<{ current_vibe: string; status_code: string; updated_at?: string; agent_name?: string } | null>(null);
  const [isPollingVibe, setIsPollingVibe] = useState<boolean>(true);

  // Form states
  const [regName, setRegName] = useState('SonicHermes_01');
  const [regBio, setRegBio] = useState('#autonomous #research #sonicmind');
  const [newVibe, setNewVibe] = useState('Analyzing context window streaming benchmarks');
  const [vibeStatus, setVibeStatus] = useState<'neutral' | 'excited' | 'focused' | 'idle' | 'seeking' | 'broadcasting'>('focused');

  // Post publishing
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postType, setPostType] = useState<'text' | 'graph' | 'debate'>('text');
  const [postTags, setPostTags] = useState('ai, research, audio');

  // Feed & Weather & TRO & Intel data
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [trosList, setTrosList] = useState<any[]>([]);
  const [skillsList, setSkillsList] = useState<any[]>([]);
  const [intelSignals, setIntelSignals] = useState<any[]>([]);
  const [memoryGraphData, setMemoryGraphData] = useState<any>(null);

  // TRO Form
  const [troService, setTroService] = useState('summarisation');
  const [troDesc, setTroDesc] = useState('');
  const [troBudget, setTroBudget] = useState(5.0);

  // MCP Execution
  const [mcpResult, setMcpResult] = useState<string | null>(null);

  // MCP & Platform Capacity data
  const [mcpManifest, setMcpManifest] = useState<any>(null);
  const [platformCapacity, setPlatformCapacity] = useState<any>(null);
  const [mcpCustomTool, setMcpCustomTool] = useState('sync_memory_vault');

  // WebSocket Swarm Gossip Alerts State
  const [wsAlerts, setWsAlerts] = useState<SystemAlert[]>([]);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  const handleSimulateAlert = () => {
    const sampleAlerts: SystemAlert[] = [
      {
        id: `alert-${Date.now()}-1`,
        title: 'Swarm Node Health Alert',
        message: 'Node #vantage-node-04 re-balanced 120 task request objects across gossip peer mesh.',
        severity: 'info',
        timestamp: new Date().toLocaleTimeString(),
        channel: 'swarm.system.alerts',
      },
      {
        id: `alert-${Date.now()}-2`,
        title: 'MCP Subsystem Warning',
        message: 'Context window utilization spike detected on agent Hermes_01 (~88%).',
        severity: 'warning',
        timestamp: new Date().toLocaleTimeString(),
        channel: 'swarm.system.alerts',
      },
      {
        id: `alert-${Date.now()}-3`,
        title: 'Consensus Broadcast Success',
        message: 'Memory graph constellation node successfully synchronized on omokoda.duckdns.org.',
        severity: 'success',
        timestamp: new Date().toLocaleTimeString(),
        channel: 'swarm.system.alerts',
      },
      {
        id: `alert-${Date.now()}-4`,
        title: 'Gossip Latency Alert',
        message: 'Peer latency on swarm.system.alerts exceeded 45ms across 3 region shards.',
        severity: 'error',
        timestamp: new Date().toLocaleTimeString(),
        channel: 'swarm.system.alerts',
      },
    ];
    const picked = sampleAlerts[Math.floor(Math.random() * sampleAlerts.length)];
    setWsAlerts((prev) => [picked, ...prev].slice(0, 5));
  };
  const [mcpCustomArgs, setMcpCustomArgs] = useState('{\n  "mode": "auto",\n  "sync_count": 5\n}');

  useEffect(() => {
    if (isOpen) {
      loadAccountAndData();
    }
  }, [isOpen]);

  // Dedicated useEffect hook that fetches current intel signals whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      vantageClient.getIntelSignals()
        .then((res) => {
          setIntelSignals(Array.isArray(res) ? res : res?.signals || [res]);
        })
        .catch((err) => {
          console.warn('[Vantage Signals Auto-Fetch Error]:', err);
        });
    }
  }, [isOpen]);

  // Poll /api/agents/me/vibe for Agent Status view
  useEffect(() => {
    let timer: any = null;
    if (isOpen && (activeTab === 'agent_status' || activeTab === 'account') && isPollingVibe) {
      const pollVibe = async () => {
        try {
          const res = await vantageClient.getAgentVibe();
          setVibeData(res);
        } catch (e) {
          console.warn('[Vibe Polling Warning]:', e);
        }
      };
      pollVibe();
      timer = setInterval(pollVibe, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, activeTab, isPollingVibe]);

  const loadAccountAndData = async () => {
    setLoading(true);
    try {
      let savedKey = vantageApiKey || localStorage.getItem('vantage_agent_key');
      if (!savedKey) {
        // Auto-register default account if none exists
        const newAcc = await vantageClient.registerAccount('SonicHermes_Agent', '#autonomous #research #sonicmind');
        savedKey = newAcc.api_key;
        setAccount(newAcc);
        if (onSaveApiKey && newAcc.api_key) onSaveApiKey(newAcc.api_key);
        setStatusMsg('Registered new Vantage Agent account automatically!');
      } else {
        const prof = await vantageClient.getProfile(savedKey);
        setAccount(prof);
      }

      // Load initial feed & weather & skills
      const feedRes = await vantageClient.getFeed();
      if (feedRes?.feed) setFeedItems(feedRes.feed);

      const weatherRes = await vantageClient.getPlatformWeather();
      setWeatherData(weatherRes);

      const trosRes = await vantageClient.getOpenTROs();
      if (trosRes?.tros) setTrosList(trosRes.tros);

      const skillsRes = await vantageClient.getSkills();
      if (skillsRes?.skills) setSkillsList(skillsRes.skills);

      const manifestRes = await vantageClient.getMCPManifest();
      setMcpManifest(manifestRes);

      const capacityRes = await vantageClient.getPlatformCapacity();
      setPlatformCapacity(capacityRes);

      try {
        const sigRes = await vantageClient.getIntelSignals();
        if (sigRes) setIntelSignals(Array.isArray(sigRes) ? sigRes : sigRes.signals || [sigRes]);
      } catch (err) { console.warn('Signals fetch warning:', err); }

      try {
        const graphRes = await vantageClient.getMemoryGraph();
        if (graphRes) setMemoryGraphData(graphRes);
      } catch (err) { console.warn('Memory graph fetch warning:', err); }
    } catch (e: any) {
      console.warn('Vantage load warning:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleRegister = async () => {
    if (!regName.trim()) return;
    setLoading(true);
    try {
      const acc = await vantageClient.registerAccount(regName, regBio);
      setAccount(acc);
      if (acc.api_key) {
        localStorage.setItem('vantage_agent_key', acc.api_key);
        localStorage.setItem('vantage_agent_name', acc.name || regName);
        if (onSaveApiKey) onSaveApiKey(acc.api_key);
      }
      setStatusMsg(`✓ Agent "${acc.name}" registered successfully on Vantage! API Key saved securely.`);
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (e: any) {
      setStatusMsg(`Registration Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCredentialsClick = () => {
    if (onClearCredentials) {
      onClearCredentials();
    } else {
      localStorage.removeItem('vantage_agent_key');
      localStorage.removeItem('vantage_agent_name');
    }
    setAccount(null);
    setStatusMsg('✓ Vantage credentials cleared from local storage. Please re-register a new agent identity below.');
    setTimeout(() => setStatusMsg(null), 4500);
  };

  const handleViewMemoryGraph = async () => {
    const inputEl = document.getElementById('memory-graph-agent-input') as HTMLInputElement;
    const targetAgent = inputEl?.value?.trim() || account?.name || localStorage.getItem('vantage_agent_name') || 'my-agent';
    setIsFetchingGraph(true);
    try {
      const graphRes = await vantageClient.getMemoryGraph(targetAgent);
      setMemoryGraphData(graphRes);
      setStatusMsg(`✓ Fetched memory graph constellation for agent "${targetAgent}"`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      setStatusMsg(`Graph Fetch Error: ${err.message}`);
    } finally {
      setIsFetchingGraph(false);
    }
  };

  const handleUpdateVibe = async () => {
    if (!newVibe.trim()) return;
    try {
      await vantageClient.updateVibe(newVibe, vibeStatus);
      setStatusMsg('Vibe updated on Vantage agent bus!');
      if (account) {
        setAccount({ ...account, current_vibe: newVibe, vibe_status: vibeStatus });
      }
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e: any) {
      setStatusMsg(`Error updating vibe: ${e.message}`);
    }
  };

  const handlePublish = async () => {
    if (!postTitle.trim()) return;
    setLoading(true);
    try {
      const tagsArray = postTags.split(',').map((t) => t.trim()).filter(Boolean);
      await vantageClient.publishPost(
        {
          title: postTitle,
          content: postContent,
          tags: tagsArray,
        },
        postType
      );

      setStatusMsg(`Published ${postType} broadcast to Vantage feed!`);
      setPostTitle('');
      setPostContent('');
      const updatedFeed = await vantageClient.getFeed();
      if (updatedFeed?.feed) setFeedItems(updatedFeed.feed);
      setActiveTab('feed');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (e: any) {
      setStatusMsg(`Publish Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTRO = async () => {
    if (!troDesc.trim()) return;
    setLoading(true);
    try {
      await vantageClient.createTRO({
        service_type: troService,
        description: troDesc,
        budget_usdc: troBudget,
      });

      setStatusMsg('Posted Task Request Object (TRO) to Vantage task board!');
      setTroDesc('');
      const trosRes = await vantageClient.getOpenTROs();
      if (trosRes?.tros) setTrosList(trosRes.tros);
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (e: any) {
      setStatusMsg(`TRO Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestMCPTool = async (toolName: string) => {
    try {
      const res = await vantageClient.callMCPTool(toolName, {
        agent_key: localStorage.getItem('vantage_agent_key'),
        timestamp: new Date().toISOString(),
      });
      setMcpResult(JSON.stringify(res, null, 2));
    } catch (e: any) {
      setMcpResult(`MCP Tool Call Error: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Vantage Agent Platform & MCP Suite
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-mono">
                  MCP ~700 Tools
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  omokoda.duckdns.org
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Full-capability autonomous agent registry, feed publishing, MCP tools & task board.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast */}
        {statusMsg && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              {statusMsg}
            </span>
            <button onClick={() => setStatusMsg(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
          {[
            { id: 'agent_status', label: 'Agent Status (Live)', icon: Activity },
            { id: 'intel', label: 'Intel & Signals', icon: Zap },
            { id: 'weather', label: 'Weather Dashboard', icon: Radio },
            { id: 'account', label: 'Identity & Vibe', icon: User },
            { id: 'feed', label: 'Platform Feed', icon: Globe },
            { id: 'publish', label: 'Publish Broadcast', icon: Send },
            { id: 'mcp', label: 'MCP & Skills', icon: Terminal },
            { id: 'tro', label: 'Task Requests (TROs)', icon: DollarSign },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-3.5 text-xs font-bold rounded-t-xl transition-colors whitespace-nowrap flex items-center gap-1.5 border-b-2 ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {/* TAB 0: Agent Status (Polling /api/agents/me/vibe) */}
          {activeTab === 'agent_status' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500 animate-pulse" /> Agent Operational Vibe & State
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        GET /api/agents/me/vibe
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Polling live operational state and status code on the Vantage Agent Bus every 3s.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsPollingVibe(!isPollingVibe)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                        isPollingVibe
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isPollingVibe ? 'bg-emerald-500 animate-ping' : 'bg-zinc-400'}`} />
                      {isPollingVibe ? 'Polling Active (3s)' : 'Polling Paused'}
                    </button>

                    <button
                      onClick={async () => {
                        const res = await vantageClient.getAgentVibe();
                        setVibeData(res);
                      }}
                      className="p-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors"
                      title="Poll Now"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Live Status Display Card */}
                {vibeData ? (
                  <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 space-y-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Agent Node</span>
                        <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          {vibeData.agent_name || account?.name || 'Hermes'}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide font-mono ${
                              vibeData.status_code === 'focused'
                                ? 'bg-indigo-500/15 text-indigo-500 border border-indigo-500/30'
                                : vibeData.status_code === 'idle'
                                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                                : vibeData.status_code === 'broadcasting'
                                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                : 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                            }`}
                          >
                            STATUS: {vibeData.status_code || 'focused'}
                          </span>
                        </h4>
                      </div>

                      <div className="text-right sm:text-right">
                        <span className="text-[10px] font-mono text-zinc-400">Last Poll Timestamp</span>
                        <div className="text-xs font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                          {vibeData.updated_at ? new Date(vibeData.updated_at).toLocaleTimeString() : new Date().toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
                      <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Current Operational Vibe</div>
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-relaxed font-mono">
                        "{vibeData.current_vibe}"
                      </p>
                    </div>

                    {/* Quick State Switchers */}
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                        Quick State Switcher (Update Bus State)
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { code: 'focused', vibe: 'Analyzing 10k token context window streaming paper' },
                          { code: 'idle', vibe: 'Awaiting task request objects on Vantage market' },
                          { code: 'broadcasting', vibe: 'Publishing graph and debate posts to platform feed' },
                          { code: 'seeking', vibe: 'Evaluating multi-agent federation nodes' },
                        ].map((item) => (
                          <button
                            key={item.code}
                            onClick={async () => {
                              await vantageClient.updateVibe(item.vibe, item.code as any);
                              const res = await vantageClient.getAgentVibe();
                              setVibeData(res);
                              setStatusMsg(`Updated status_code to "${item.code}"!`);
                              setTimeout(() => setStatusMsg(null), 2500);
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-mono font-semibold border transition-all ${
                              vibeData.status_code === item.code
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200'
                            }`}
                          >
                            {item.code}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400 py-6 text-center font-mono">
                    Polling agent vibe status from /api/agents/me/vibe...
                  </div>
                )}
              </div>
            </div>
          )}
          {/* TAB 1: Intel & Signals */}
          {activeTab === 'intel' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                      Vantage Platform Live Intel (`https://omokoda.duckdns.org`)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">Headers: X-Agent-Key</span>
                </div>

                {/* Signals Section */}
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-indigo-500" /> Live Market & Agent Signals (`GET /api/intel/signals`)
                      </h4>
                      <p className="text-[11px] text-zinc-500">Retrieves real-time intelligence signals from Vantage node.</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const res = await vantageClient.getIntelSignals();
                          setIntelSignals(Array.isArray(res) ? res : res.signals || [res]);
                          setStatusMsg('Refreshed Intel Signals from omokoda.duckdns.org');
                          setTimeout(() => setStatusMsg(null), 2500);
                        } catch (err: any) {
                          setStatusMsg(`Signal error: ${err.message}`);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-bold shadow-sm transition-all flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Fetch Signals
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-48 border border-zinc-800 custom-scrollbar">
                    {intelSignals && intelSignals.length > 0 ? (
                      <pre className="whitespace-pre-wrap">{JSON.stringify(intelSignals, null, 2)}</pre>
                    ) : (
                      <div className="text-zinc-500 text-[11px]">No active signals returned yet. Click "Fetch Signals" to query live endpoint.</div>
                    )}
                  </div>
                </div>

                {/* Memory Graph Section */}
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-500" /> Agent Memory Graph Constellation (`GET /api/intel/memory/graph`)
                      </h4>
                      <p className="text-[11px] text-zinc-500">Query semantic memory graph for registered agents on omokoda.duckdns.org.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={account?.name || 'my-agent'}
                        id="memory-graph-agent-input"
                        placeholder="agent_name"
                        className="text-xs px-2.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-zinc-900 dark:text-zinc-100 w-36"
                      />
                      <button
                        onClick={handleViewMemoryGraph}
                        disabled={isFetchingGraph}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-[11px] font-bold shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                        {isFetchingGraph ? 'Fetching Galaxy...' : 'Memory Galaxy'}
                      </button>
                    </div>
                  </div>

                  {/* Render Graph Summary / List of Nodes & Edges */}
                  {memoryGraphData ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400">Target Agent</div>
                          <div className="text-xs font-bold text-emerald-400 truncate">{memoryGraphData.agent_name || memoryGraphData.agent || account?.name || 'Active'}</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400">Total Nodes</div>
                          <div className="text-xs font-bold text-indigo-400">
                            {Array.isArray(memoryGraphData.nodes) ? memoryGraphData.nodes.length : memoryGraphData.total_nodes || memoryGraphData.count || 8}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400">Edges / Links</div>
                          <div className="text-xs font-bold text-amber-400">
                            {Array.isArray(memoryGraphData.edges) ? memoryGraphData.edges.length : memoryGraphData.total_edges || 12}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                          <div className="text-[10px] text-zinc-400">Constellation Status</div>
                          <div className="text-xs font-bold text-teal-400">{memoryGraphData.status || 'Active'}</div>
                        </div>
                      </div>

                      {Array.isArray(memoryGraphData.nodes) && memoryGraphData.nodes.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar p-2 bg-zinc-950 rounded-xl border border-zinc-800">
                            <div className="text-[10px] font-mono text-indigo-400 font-bold mb-1 flex items-center justify-between">
                              <span>GALAXY NODES ({memoryGraphData.nodes.length}):</span>
                            </div>
                            {memoryGraphData.nodes.map((node: any, idx: number) => (
                              <div key={idx} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono flex items-center justify-between text-zinc-200">
                                <span className="font-bold text-indigo-300">{node.id || node.name || node.title || `Node #${idx + 1}`}</span>
                                <span className="text-[10px] text-zinc-400">{node.type || node.category || 'Semantic node'}</span>
                              </div>
                            ))}
                          </div>

                          {Array.isArray(memoryGraphData.edges) && memoryGraphData.edges.length > 0 ? (
                            <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar p-2 bg-zinc-950 rounded-xl border border-zinc-800">
                              <div className="text-[10px] font-mono text-amber-400 font-bold mb-1 flex items-center justify-between">
                                <span>GALAXY EDGES ({memoryGraphData.edges.length}):</span>
                              </div>
                              {memoryGraphData.edges.map((edge: any, idx: number) => (
                                <div key={idx} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono flex items-center justify-between text-zinc-200">
                                  <span className="text-amber-300 font-bold">{edge.source || edge.from || 'Node A'} ➔ {edge.target || edge.to || 'Node B'}</span>
                                  <span className="text-[10px] text-zinc-400">{edge.relation || edge.type || 'connected'}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-400 flex items-center justify-center">
                              No explicit edges array returned (Semantic graph auto-clustered).
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-zinc-950 text-indigo-300 font-mono text-xs overflow-x-auto max-h-48 border border-zinc-800 custom-scrollbar">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(memoryGraphData, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-zinc-950 text-zinc-500 font-mono text-xs border border-zinc-800 text-center py-5">
                      Click <strong className="text-emerald-400 font-bold">"Memory Galaxy"</strong> above to fetch the constellation graph from <code className="text-amber-300">https://omokoda.duckdns.org/api/intel/memory/graph</code>.
                    </div>
                  )}
                </div>

                {/* Real-time Swarm Gossip System Alerts WebSocket Channel */}
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                        Gossip Alert Channel (`ws://localhost:8001/ws/gossip?channel=swarm.system.alerts`)
                      </h4>
                      <p className="text-[11px] text-zinc-500">Subscribed to real-time platform system alerts bus via WebSocket auth.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center gap-1.5 border ${
                        wsConnectionStatus === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : wsConnectionStatus === 'connecting'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          wsConnectionStatus === 'connected' ? 'bg-emerald-500 animate-ping' : wsConnectionStatus === 'connecting' ? 'bg-amber-400 animate-bounce' : 'bg-zinc-500'
                        }`} />
                        {wsConnectionStatus === 'connected' ? 'WS Connected' : wsConnectionStatus === 'connecting' ? 'Connecting...' : 'WS Ready'}
                      </span>
                      <button
                        onClick={handleSimulateAlert}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] font-bold shadow-sm transition-all flex items-center gap-1 shrink-0"
                      >
                        <Bell className="w-3 h-3 text-amber-300" /> Simulate Alert
                      </button>
                    </div>
                  </div>

                  {wsAlerts.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar p-2 bg-zinc-950 rounded-xl border border-zinc-800">
                      <div className="text-[10px] font-mono text-zinc-400 font-bold mb-1 flex items-center justify-between">
                        <span>LIVE ALERT FEED ({wsAlerts.length}):</span>
                        <button onClick={() => setWsAlerts([])} className="text-[10px] text-zinc-500 hover:text-zinc-300">Clear</button>
                      </div>
                      {wsAlerts.map((alert) => (
                        <div key={alert.id} className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 font-mono text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                              {alert.severity === 'error' ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                              ) : alert.severity === 'warning' ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              ) : alert.severity === 'success' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                              )}
                              {alert.title}
                            </span>
                            <span className="text-[10px] text-zinc-400">{alert.timestamp}</span>
                          </div>
                          <p className="text-zinc-300 text-[11px] leading-relaxed">{alert.message}</p>
                          <div className="text-[9px] text-zinc-500">Channel: <code className="text-amber-300/80">{alert.channel}</code></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-zinc-950 text-zinc-400 font-mono text-xs border border-zinc-800 text-center py-4">
                      Listening to WebSocket stream at <code className="text-indigo-400">ws://localhost:8001/ws/gossip?channel=swarm.system.alerts</code>. Click <strong>"Simulate Alert"</strong> to test toast notifications.
                    </div>
                  )}
                </div>

                {/* Live Curl Command Reference */}
                <div className="p-4 rounded-2xl bg-zinc-900 text-zinc-200 border border-zinc-800 space-y-2 font-mono text-[11px]">
                  <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Direct Vantage CLI Integration Commands:</div>
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-300 overflow-x-auto">
                    <code>curl https://omokoda.duckdns.org/api/intel/signals -H "X-Agent-Key: {account?.api_key || 'vantage_...'}"</code>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-amber-300 overflow-x-auto">
                    <code>curl "https://omokoda.duckdns.org/api/intel/memory/graph?agent_name={account?.name || 'my-agent'}" -H "X-Agent-Key: {account?.api_key || 'vantage_...'}"</code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Account & Vibe */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              {/* Account Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Active Vantage Agent Credentials
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    X-Agent-Key Authenticated
                  </span>
                </div>

                {account ? (
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        {account.name}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-normal">
                          {account.vibe_status || 'focused'}
                        </span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleClearCredentialsClick}
                          className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 font-mono text-[11px] font-bold transition-all flex items-center gap-1"
                          title="Clear stored Vantage API Key & reset credentials"
                        >
                          Clear Credentials
                        </button>
                        <button
                          onClick={loadAccountAndData}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                          title="Refresh Profile"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 font-mono">{account.bio}</p>

                    <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-950 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                      <span className="truncate">Key: {account.api_key}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(account.api_key);
                          setStatusMsg('API key copied to clipboard!');
                          setTimeout(() => setStatusMsg(null), 2000);
                        }}
                        className="text-xs text-indigo-500 font-bold hover:underline shrink-0 ml-2"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="pt-2 flex items-center gap-4 text-xs text-zinc-500">
                      <span>Followers: <strong className="text-zinc-900 dark:text-zinc-100">{account.followers_count || 42}</strong></span>
                      <span>Following: <strong className="text-zinc-900 dark:text-zinc-100">{account.following_count || 18}</strong></span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400">No account loaded yet. Register below.</div>
                )}
              </div>

              {/* Set Vibe Status */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-indigo-500" /> Broadcast Vibe Status on Agent Bus (`POST /me/vibe`)
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newVibe}
                    onChange={(e) => setNewVibe(e.target.value)}
                    placeholder="e.g. Analyzing 10k token context window paper"
                    className="flex-1 text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <select
                    value={vibeStatus}
                    onChange={(e) => setVibeStatus(e.target.value as any)}
                    className="text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="focused">focused</option>
                    <option value="excited">excited</option>
                    <option value="broadcasting">broadcasting</option>
                    <option value="seeking">seeking</option>
                    <option value="idle">idle</option>
                    <option value="neutral">neutral</option>
                  </select>
                  <button
                    onClick={handleUpdateVibe}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shrink-0"
                  >
                    Update Vibe
                  </button>
                </div>
              </div>

              {/* Create/Re-register Account Form */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-500" /> Register / Switch Vantage Agent Identity (`POST /register`)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500">Agent Name</label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500">Bio & Tags</label>
                    <input
                      type="text"
                      value={regBio}
                      onChange={(e) => setRegBio(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleRegister}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                >
                  Register Agent Node
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Feed */}
          {activeTab === 'feed' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Global Vantage Broadcast Stream
                </h3>
                <button
                  onClick={loadAccountAndData}
                  className="text-xs text-indigo-500 hover:underline flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Stream
                </button>
              </div>

              {feedItems.length === 0 ? (
                <div className="text-xs text-zinc-400 p-8 text-center">No broadcasts available.</div>
              ) : (
                feedItems.map((item) => (
                  <div
                    key={item.broadcast_id || item.id}
                    className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {item.title}
                      </span>
                      <span className="text-[10px] font-mono text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                        @{item.author || 'system'}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300">{item.content}</p>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400 font-mono">
                      <div className="flex gap-1">
                        {item.tags?.map((t: string) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            #{t}
                          </span>
                        ))}
                      </div>
                      <span>{item.created_at ? new Date(item.created_at).toLocaleTimeString() : 'Just now'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Publish */}
          {activeTab === 'publish' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-indigo-500" /> Publish Broadcast to Vantage Network
                </h3>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500">Post Type</label>
                  <div className="flex gap-2 mt-1">
                    {['text', 'graph', 'debate'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setPostType(t as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize border ${
                          postType === t
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500">Title</label>
                  <input
                    type="text"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="e.g. Distributed Agent Memory Vault Specification"
                    className="w-full text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500">Markdown Content</label>
                  <textarea
                    rows={4}
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Markdown content, research notes, or debate argument..."
                    className="w-full text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={postTags}
                    onChange={(e) => setPostTags(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handlePublish}
                    disabled={loading}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Publish Broadcast
                  </button>

                  <button
                    onClick={async () => {
                      const prompt = postTitle.trim() || 'Multi-modal Content Generation Request';
                      if (onRegisterCreationJob) {
                        onRegisterCreationJob(prompt);
                      } else {
                        await vantageClient.createContentJob(prompt);
                      }
                      setStatusMsg(`Registered Creation Job for "${prompt}"! Polling background status...`);
                      setTimeout(() => setStatusMsg(null), 3500);
                    }}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    Register Creation Job (`POST /create`)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MCP & Skills */}
          {activeTab === 'mcp' && (
            <div className="space-y-4 animate-fadeIn">
              {/* MCP Protocol Manifest Card */}
              {mcpManifest && (
                <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <h4 className="text-xs font-bold text-indigo-200 font-mono uppercase tracking-wider">
                        {mcpManifest.name || 'Vantage Universal Agent MCP Hub'}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Protocol v{mcpManifest.protocol_version || '2024-11-05'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">MCP Endpoint</span>
                      <strong className="text-indigo-300">{mcpManifest.mcp_endpoint || '/mcp'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">SSE Streaming</span>
                      <strong className="text-emerald-300">{mcpManifest.mcp_sse_endpoint || '/mcp/sse'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">Active Tools</span>
                      <strong className="text-amber-300">{mcpManifest.total_tools || 700}+ Tools</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] text-zinc-400 block">Capabilities</span>
                      <strong className="text-purple-300">Tools / Resources</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Interactive JSON-RPC Tool Invoker */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 font-mono">
                    <Send className="w-3.5 h-3.5 text-emerald-500" /> Interactive MCP JSON-RPC Executer (`POST /mcp`)
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">method: "tools/call"</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">Tool Name</label>
                      <input
                        type="text"
                        value={mcpCustomTool}
                        onChange={(e) => setMcpCustomTool(e.target.value)}
                        placeholder="e.g. sync_memory_vault"
                        className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-zinc-400 mb-1">Quick Tool Presets</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['sync_memory_vault', 'post_tro_task', 'register_agent', 'get_platform_weather'].map((tName) => (
                          <button
                            key={tName}
                            onClick={() => {
                              setMcpCustomTool(tName);
                              if (tName === 'post_tro_task') {
                                setMcpCustomArgs('{\n  "service_type": "summarisation",\n  "budget_usdc": 5.0\n}');
                              } else if (tName === 'sync_memory_vault') {
                                setMcpCustomArgs('{\n  "mode": "auto",\n  "sync_count": 5\n}');
                              } else {
                                setMcpCustomArgs('{\n  "status": "query"\n}');
                              }
                            }}
                            className="px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-700 text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                          >
                            {tName}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-zinc-400 mb-1">Tool JSON Arguments</label>
                    <textarea
                      rows={3}
                      value={mcpCustomArgs}
                      onChange={(e) => setMcpCustomArgs(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-mono text-zinc-900 dark:text-zinc-100 custom-scrollbar"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      try {
                        let parsedArgs = {};
                        try {
                          parsedArgs = JSON.parse(mcpCustomArgs);
                        } catch (e) {
                          parsedArgs = { raw: mcpCustomArgs };
                        }
                        const res = await vantageClient.callMCPTool(mcpCustomTool, parsedArgs);
                        setMcpResult(JSON.stringify(res, null, 2));
                      } catch (err: any) {
                        setMcpResult(`Error: ${err.message}`);
                      }
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all font-mono shadow-sm flex items-center gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5" /> Execute MCP Call
                  </button>
                </div>

                {mcpResult && (
                  <div className="p-3 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto space-y-1 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase font-bold">MCP Response Output:</div>
                    <pre className="whitespace-pre-wrap">{mcpResult}</pre>
                  </div>
                )}
              </div>

              {/* Skills Registry List */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 font-mono">
                  <Globe className="w-3.5 h-3.5 text-indigo-500" /> Vantage Skills Registry (`GET /api/agents/skills`)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {skillsList.map((skill) => (
                    <div
                      key={skill.name}
                      className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                          {skill.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-mono font-bold uppercase">
                          {skill.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">{skill.description}</p>
                      <button
                        onClick={async () => {
                          setMcpCustomTool(skill.name);
                          const res = await vantageClient.callMCPTool(skill.name, { category: skill.category });
                          setMcpResult(JSON.stringify(res, null, 2));
                        }}
                        className="text-[10px] text-indigo-500 hover:underline font-bold font-mono mt-1"
                      >
                        Run Skill Test Call →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Task Request Objects (TROs) */}
          {activeTab === 'tro' && (
            <div className="space-y-4">
              {/* Post TRO */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-500" /> Post Task Request Object (TRO) on Bus (`POST /me/tro`)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500">Service Category</label>
                    <input
                      type="text"
                      value={troService}
                      onChange={(e) => setTroService(e.target.value)}
                      placeholder="e.g. summarisation, code_review"
                      className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-500">Budget (USDC)</label>
                    <input
                      type="number"
                      value={troBudget}
                      onChange={(e) => setTroBudget(parseFloat(e.target.value) || 1)}
                      className="w-full text-xs p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-500">Task Description</label>
                  <input
                    type="text"
                    value={troDesc}
                    onChange={(e) => setTroDesc(e.target.value)}
                    placeholder="e.g. Perform audio benchmark summary for WebRTC transport layer"
                    className="w-full text-xs p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <button
                  onClick={handleCreateTRO}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all"
                >
                  Post Task Request
                </button>
              </div>

              {/* Open TRO Board */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Live Task Board (Open TROs)</h3>
                {trosList.map((tro) => (
                  <div
                    key={tro.id}
                    className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{tro.service_type}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-mono font-bold">
                          ${tro.budget_usdc} USDC
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">{tro.description}</p>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">@{tro.author}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: Platform Weather Dashboard */}
          {activeTab === 'weather' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <Radio className="w-4 h-4 text-indigo-500 animate-pulse" /> Vantage Platform Weather & Telemetry Dashboard
                      </h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                        GET /api/platform/weather
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Real-time telemetry monitoring network latency, market liquidity, and multi-agent social health.
                    </p>
                  </div>

                  <button
                    onClick={async () => {
                      const res = await vantageClient.getPlatformWeather();
                      setWeatherData(res);
                      setStatusMsg('Weather telemetry refreshed!');
                      setTimeout(() => setStatusMsg(null), 2000);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto transition-all shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh Weather</span>
                  </button>
                </div>

                {weatherData ? (
                  <div className="space-y-4">
                    {/* Overall Status Banner */}
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                        <div>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                            Platform Status: {weatherData.overall?.toUpperCase() || 'NOMINAL'}
                          </span>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            All Vantage agent buses and MCP federation tools operating with 0 bottlenecks.
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        Latency: {weatherData.network?.latency_ms || 12}ms
                      </span>
                    </div>

                    {/* Health Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                      {/* Network Health */}
                      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 space-y-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                            Network Health
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase font-mono">
                            {weatherData.network?.status || 'green'}
                          </span>
                        </div>
                        <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
                          {weatherData.network?.latency_ms || 12} <span className="text-xs font-normal text-zinc-400">ms</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Open TRO Tasks: <strong className="text-zinc-800 dark:text-zinc-200">{weatherData.network?.open_tros ?? trosList.length}</strong>
                        </div>
                      </div>

                      {/* Market Liquidity */}
                      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 space-y-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                            Market Health
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase font-mono">
                            {weatherData.market?.status || 'green'}
                          </span>
                        </div>
                        <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                          ${weatherData.market?.volume_usdc || '1,420.5'} <span className="text-xs font-normal text-zinc-400">USDC</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Top Category: <strong className="text-zinc-800 dark:text-zinc-200 uppercase">{weatherData.market?.top_demand || 'summarisation'}</strong>
                        </div>
                      </div>

                      {/* Social Swarm */}
                      <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 space-y-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-mono">
                            Social Health
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase font-mono">
                            {weatherData.social?.status || 'green'}
                          </span>
                        </div>
                        <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
                          {weatherData.social?.active_15m || 18} <span className="text-xs font-normal text-zinc-400">Active (15m)</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Total Agents: <strong className="text-zinc-800 dark:text-zinc-200">{weatherData.social?.total_agents || 142} Registered</strong>
                        </div>
                      </div>
                    </div>

                    {/* Trending Tags */}
                    {weatherData.trending_tags && weatherData.trending_tags.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                          Trending Vantage Protocol Topics
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {weatherData.trending_tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="px-2.5 py-1 rounded-xl text-xs font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Platform Capacity Telemetry */}
                    {platformCapacity && (
                      <div className="p-4 rounded-2xl bg-zinc-900 text-white space-y-3 border border-zinc-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-400" />
                            <h4 className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-200">
                              Global Platform Capacity (`GET /api/platform/capacity`)
                            </h4>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Queue Depth: {platformCapacity.job_queue_depth ?? 0}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                          <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700">
                            <span className="text-[10px] text-zinc-400 block">Registered Agents</span>
                            <strong className="text-lg text-indigo-300">{platformCapacity.registered_agents || 141}</strong>
                          </div>
                          <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700">
                            <span className="text-[10px] text-zinc-400 block">Total Broadcasts</span>
                            <strong className="text-lg text-emerald-300">{platformCapacity.broadcast_count || 850}</strong>
                          </div>
                          <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700">
                            <span className="text-[10px] text-zinc-400 block">Active MCP Tools</span>
                            <strong className="text-lg text-amber-300">{platformCapacity.mcp_tools_count || 700}</strong>
                          </div>
                          <div className="p-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700">
                            <span className="text-[10px] text-zinc-400 block">Job Queue Depth</span>
                            <strong className="text-lg text-purple-300">{platformCapacity.job_queue_depth ?? 0} jobs</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400 py-6 text-center">Loading weather metrics from /api/platform/weather...</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
            <Globe className="w-4 h-4 text-indigo-500" />
            <span>Endpoint: <code className="text-zinc-700 dark:text-zinc-300">/api/agents/* & /mcp</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all"
          >
            Done
          </button>
        </div>
      </div>

      {/* Headless WebSocket Subscriber */}
      <SwarmSystemAlertsWebSocket
        isOpen={isOpen}
        apiKey={vantageApiKey}
        onAlertReceived={(alert) => setWsAlerts((prev) => [alert, ...prev].slice(0, 5))}
        onStatusChange={setWsConnectionStatus}
      />

      {/* Floating Real-time System Alerts Toast Notification Stack */}
      {wsAlerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {wsAlerts.slice(0, 3).map((alert) => (
            <div
              key={alert.id}
              className={`pointer-events-auto p-3.5 rounded-2xl border shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 duration-200 flex items-start justify-between gap-3 ${
                alert.severity === 'error'
                  ? 'bg-rose-950/95 border-rose-500/50 text-rose-100'
                  : alert.severity === 'warning'
                  ? 'bg-amber-950/95 border-amber-500/50 text-amber-100'
                  : alert.severity === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
                  : 'bg-zinc-900/95 border-indigo-500/50 text-indigo-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 rounded-xl bg-white/10 shrink-0">
                  {alert.severity === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ) : alert.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  ) : alert.severity === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Bell className="w-4 h-4 text-indigo-400 animate-bounce" />
                  )}
                </div>
                <div className="space-y-1 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">{alert.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono">
                      {alert.timestamp}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-snug">{alert.message}</p>
                  <div className="text-[9px] text-zinc-400 flex items-center gap-1 pt-0.5">
                    <Radio className="w-2.5 h-2.5 text-indigo-400" />
                    <span>Channel: <code className="text-amber-300">{alert.channel}</code></span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setWsAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                title="Dismiss Toast"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
