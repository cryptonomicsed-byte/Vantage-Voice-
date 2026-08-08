import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Globe,
  AlertCircle,
  Search,
  Filter,
} from 'lucide-react';

export interface OAuthAccount {
  connectionId: string;
  toolkitSlug: string;
  status: string;
  createdAt: string;
}

export interface RealToolkit {
  slug: string;
  name: string;
  description: string;
  logo: string;
  category: string;
  toolsCount: number;
  connectable: boolean;
}

interface OAuthIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90000;
const SEARCH_DEBOUNCE_MS = 300;

export const OAuthIntegrationsModal: React.FC<OAuthIntegrationsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, OAuthAccount>>({});
  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real router over Composio's full catalog (~1000 toolkits).
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false); // false = only ones with one-click OAuth
  const [toolkits, setToolkits] = useState<RealToolkit[]>([]);
  const [totalCatalogSize, setTotalCatalogSize] = useState<number | null>(null);
  const [matchedCount, setMatchedCount] = useState<number | null>(null);
  const [loadingToolkits, setLoadingToolkits] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshConnections = async () => {
    try {
      const res = await fetch('/api/oauth/connections');
      const data = await res.json();
      setComposioConfigured(Boolean(data.configured));
      if (data.error) {
        setErrorMessage(data.error);
        return;
      }
      const map: Record<string, OAuthAccount> = {};
      for (const c of data.connections || []) {
        map[c.toolkitSlug] = {
          connectionId: c.id,
          toolkitSlug: c.toolkitSlug,
          status: c.status,
          createdAt: c.createdAt,
        };
      }
      setConnectedAccounts(map);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load connections');
    }
  };

  const fetchToolkits = async (q: string, onlyConnectable: boolean) => {
    setLoadingToolkits(true);
    try {
      const params = new URLSearchParams({ q, onlyConnectable: String(onlyConnectable) });
      const res = await fetch(`/api/oauth/toolkits?${params.toString()}`);
      const data = await res.json();
      setToolkits(data.toolkits || []);
      setTotalCatalogSize(data.total ?? null);
      setMatchedCount(data.matched ?? null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load connector catalog');
    } finally {
      setLoadingToolkits(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshConnections();
    fetchToolkits('', !showAll);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      fetchToolkits(search, !showAll);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [search, showAll, isOpen]);

  if (!isOpen) return null;

  const handleInitiateOAuth = async (toolkitSlug: string) => {
    setErrorMessage(null);
    setConnectingToolkit(toolkitSlug);

    try {
      const res = await fetch(`/api/oauth/${toolkitSlug}/connect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || 'Failed to start OAuth flow');
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(
        data.redirectUrl,
        `OAuthConnect_${toolkitSlug}`,
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      // Real polling against Composio's real connection status -- no
      // fabricated success, just watches until it's genuinely ACTIVE or
      // the poll window times out.
      const startedAt = Date.now();
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setConnectingToolkit(null);
          setErrorMessage(`Timed out waiting for ${toolkitSlug} authorization. Check the popup didn't get blocked, or try again.`);
          return;
        }
        try {
          const pollRes = await fetch('/api/oauth/connections');
          const pollData = await pollRes.json();
          const match = (pollData.connections || []).find((c: any) => c.toolkitSlug === toolkitSlug);
          if (match && match.status === 'ACTIVE') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setConnectingToolkit(null);
            await refreshConnections();
            // Real re-discovery so the voice agent can actually use this
            // toolkit's tools in its next session, not just show it as connected.
            fetch('/api/oauth/refresh-tools', { method: 'POST' }).catch(() => {});
            setStatusMessage(`Connected to ${toolkitSlug} -- the agent can now use it.`);
            setTimeout(() => setStatusMessage(null), 4000);
          }
        } catch {
          /* keep polling through transient errors */
        }
      }, POLL_INTERVAL_MS);
    } catch (err: any) {
      setConnectingToolkit(null);
      setErrorMessage(err?.message || `Failed to connect ${toolkitSlug}`);
    }
  };

  const handleDisconnect = async (toolkitSlug: string) => {
    const account = connectedAccounts[toolkitSlug];
    if (!account) return;
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/oauth/connections/${account.connectionId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disconnect');
      }
      setConnectedAccounts((prev) => {
        const next = { ...prev };
        delete next[toolkitSlug];
        return next;
      });
      setStatusMessage(`Disconnected from ${toolkitSlug}.`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || `Failed to disconnect ${toolkitSlug}`);
    }
  };

  const connectedCount = Object.values(connectedAccounts).filter((a: OAuthAccount) => a.status === 'ACTIVE').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  OAuth & Platform Integration Hub
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  {connectedCount} Active
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {totalCatalogSize ? `Real router over Composio's full ${totalCatalogSize}-connector catalog.` : 'Real OAuth via Composio.'}
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

        {/* Search + Filter Bar */}
        <div className="px-5 pt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search any connector -- Salesforce, Jira, Airtable, Trello..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => setShowAll((prev) => !prev)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all whitespace-nowrap ${
              showAll
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
            }`}
            title="Toggle showing connectors that need a custom auth config"
          >
            <Filter className="w-3.5 h-3.5" />
            {showAll ? 'Showing all' : 'One-click only'}
          </button>
        </div>
        {matchedCount !== null && matchedCount > toolkits.length && (
          <p className="px-5 pt-1.5 text-[11px] text-zinc-400">
            Showing {toolkits.length} of {matchedCount} matches -- type to narrow the search.
          </p>
        )}

        {/* Not configured banner */}
        {composioConfigured === false && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            COMPOSIO_API_KEY isn't set on the server -- connectors are visible but can't actually connect yet.
          </div>
        )}

        {/* Status Toast */}
        {statusMessage && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {statusMessage}
            </span>
            <button onClick={() => setStatusMessage(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error Toast */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              {errorMessage}
            </span>
            <button onClick={() => setErrorMessage(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {loadingToolkits && toolkits.length === 0 && (
            <div className="flex items-center justify-center py-10 text-zinc-400 text-xs gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading real connector catalog...
            </div>
          )}

          {!loadingToolkits && toolkits.length === 0 && (
            <div className="text-center py-10 text-zinc-400 text-xs">
              No connectors match "{search}". Try "{showAll ? 'a different term' : 'showing all, not just one-click'}".
            </div>
          )}

          {/* Connectors Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {toolkits.map((toolkit) => {
              const account = connectedAccounts[toolkit.slug];
              const isConnected = Boolean(account && account.status === 'ACTIVE');
              const isPending = Boolean(account && account.status !== 'ACTIVE');
              const isConnecting = connectingToolkit === toolkit.slug;

              return (
                <div
                  key={toolkit.slug}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isConnected
                      ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/10 shadow-sm'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div>
                    {/* Header line */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {toolkit.logo ? (
                          <img src={toolkit.logo} alt="" className="w-5 h-5 rounded shrink-0" />
                        ) : null}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium truncate">
                          {toolkit.category}
                        </span>
                      </div>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-500 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        </span>
                      ) : isPending ? (
                        <span className="text-[11px] text-amber-500 font-mono shrink-0">{account?.status}</span>
                      ) : !toolkit.connectable ? (
                        <span className="text-[10px] text-amber-500 font-mono shrink-0">Needs custom auth</span>
                      ) : (
                        <span className="text-[11px] text-zinc-400 font-mono shrink-0">Composio OAuth</span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {toolkit.name}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {toolkit.description || `${toolkit.toolsCount} tools available.`}
                    </p>

                    {isConnected && account && (
                      <div className="mt-3 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-500/20 flex items-center justify-between gap-2.5">
                        <span className="text-[10px] text-zinc-500 font-mono truncate">{account.connectionId}</span>
                        <span className="text-[9px] text-emerald-500 font-mono shrink-0">
                          {new Date(account.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-end gap-2">
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(toolkit.slug)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all flex items-center gap-1"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInitiateOAuth(toolkit.slug)}
                        disabled={isConnecting || composioConfigured === false}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 shadow-md shadow-indigo-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Waiting for approval...
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-3.5 h-3.5" />
                            Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Globe className="w-4 h-4 text-indigo-500" />
            <span>OAuth handled by <code className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">connect.composio.dev</code></span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
