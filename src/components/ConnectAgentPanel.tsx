import React, { useEffect, useState } from 'react';
import { Plus, Trash2, PlugZap, Check, Star, Loader2 } from 'lucide-react';

/** Public shape of a saved agent connection (secrets are never returned). */
interface ConnectionPublic {
  id: string;
  userId: string;
  kind: 'native' | 'omokoda2' | 'hermes' | 'openclaw' | 'openai';
  label: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  config: Record<string, any>;
  hasSecrets: string[];
}

const KINDS: { id: ConnectionPublic['kind']; name: string; hint: string }[] = [
  { id: 'omokoda2', name: 'Omokoda-agent (citizen)', hint: 'Your own Omo-Koda2 kernel: URL + birth creds (optional). Turns flow through its control kernel and receipt system.' },
  { id: 'hermes', name: 'Hermes (visitor)', hint: 'Any Hermes gateway: URL + API key. Session key keeps memory and skills across turns.' },
  { id: 'openclaw', name: 'OpenClaw (visitor)', hint: 'OpenClaw endpoint + key.' },
  { id: 'openai', name: 'Generic OpenAI-compatible (visitor)', hint: 'Base URL + key + model. Any /v1/chat/completions endpoint.' },
  { id: 'native', name: 'Vantage Copilot (fallback)', hint: 'No external agent — the built-in Vantage copilot with full MCP tools.' },
];

const uid = () => localStorage.getItem('vantage_agent_name') || 'local-owner';

/** Field grid for a connection kind. */
function kindFields(kind: ConnectionPublic['kind'], cfg: Record<string, any>, setCfg: (c: Record<string, any>) => void): React.ReactNode {
  const set = (k: string, v: string) => setCfg({ ...cfg, [k]: v });
  const input = (k: string, label: string, placeholder: string, type = 'text') => (
    <label key={k} className="block">
      <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={cfg[k] || ''}
        onChange={(e) => set(k, e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </label>
  );
  switch (kind) {
    case 'omokoda2':
      return (
        <>
          {input('kernelUrl', 'Kernel URL', 'http://127.0.0.1:7777')}
          {input('agentName', 'Agent name (new guest birth)', 'vantage-voice')}
          {input('agentId', 'Existing agent id (optional)', 'ag_...')}
          {input('agentKey', 'Existing agent key (optional)', '••••••', 'password')}
        </>
      );
    case 'hermes':
      return (
        <>
          {input('gatewayUrl', 'Gateway URL', 'http://127.0.0.1:8642')}
          {input('apiKey', 'API key', '••••••', 'password')}
          {input('model', 'Model (optional)', 'hermes-agent')}
        </>
      );
    case 'openclaw':
      return (
        <>
          {input('endpoint', 'Endpoint', 'http://127.0.0.1:3000')}
          {input('openclawKey', 'Key', '••••••', 'password')}
        </>
      );
    case 'openai':
      return (
        <>
          {input('baseUrl', 'Base URL', 'https://api.openai.com/v1')}
          {input('openaiKey', 'API key', 'sk-••••', 'password')}
          {input('openaiModel', 'Model', 'gpt-4o-mini')}
        </>
      );
    default:
      return null;
  }
}

/** "Connect Your Agent" tab: per-user connections with encrypted secrets. */
export const ConnectAgentPanel: React.FC = () => {
  const [connections, setConnections] = useState<ConnectionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ConnectionPublic['kind']>('hermes');
  const [label, setLabel] = useState('');
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  const api = (path: string, init?: RequestInit) =>
    fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-user-id': uid(), ...(init?.headers || {}) },
    }).then((r) => r.json());

  const refresh = () => api('/api/connections').then((d) => {
    setConnections(d.connections || []);
    setLoading(false);
  });

  useEffect(() => { void refresh(); }, []);

  const notify = (m: string) => { setMessage(m); setTimeout(() => setMessage(''), 6000); };

  const create = async () => {
    setBusy('create');
    try {
      const d = await api('/api/connections', {
        method: 'POST',
        body: JSON.stringify({ kind, label: label || `${KINDS.find((k) => k.id === kind)?.name}`, config: cfg }),
      });
      if (d.ok) {
        notify(`Connected: ${d.connection.label}`);
        setCfg({});
        setLabel('');
        await refresh();
      } else notify(d.error || 'create failed');
    } finally { setBusy(null); }
  };

  const test = async (id: string) => {
    setBusy(`test:${id}`);
    try {
      const d = await api(`/api/connections/${id}/test`, { method: 'POST' });
      notify(d.ok
        ? `Test OK — ${d.message}${d.tools ? ` | tools: ${d.tools.join(', ')}` : ''}${d.mcpServers ? ` | MCP servers: ${d.mcpServers.join(', ')}` : ''}`
        : `Test failed — ${d.message}`);
    } finally { setBusy(null); }
  };

  const activate = async (id: string) => {
    setBusy(`activate:${id}`);
    try {
      const d = await api(`/api/connections/${id}/activate`, { method: 'POST' });
      if (d.ok) {
        localStorage.setItem('vv_connection_id', id);
        notify(`Active agent: ${d.connection.label} — applies on the next voice session`);
        await refresh();
      } else notify(d.error || 'activate failed');
    } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    setBusy(`remove:${id}`);
    try {
      const d = await api(`/api/connections/${id}`, { method: 'DELETE' });
      if (d.ok) { notify('Connection removed'); await refresh(); }
      else notify(d.error || 'remove failed');
    } finally { setBusy(null); }
  };

  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Citizen / visitor model: Omokoda-agent is the native citizen; Hermes, OpenClaw and any
        OpenAI-compatible endpoint are visitors. Credentials are encrypted at rest per user and
        never leave this server. Your Vantage X-Agent-Key here gives the connected agent full
        MCP access to YOUR Vantage account — money-moving actions stay behind the owner PIN.
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      )}

      {/* saved connections */}
      <div className="space-y-2">
        <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Connected agents</div>
        {loading && <div className="text-xs text-zinc-400">Loading…</div>}
        {!loading && connections.length === 0 && (
          <div className="text-xs text-zinc-400">No agent connections yet — add one below, or voice falls back to server defaults.</div>
        )}
        {connections.map((c) => (
          <div key={c.id} className={`rounded-xl border p-3 flex items-center gap-3 ${c.active ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40' : 'border-zinc-200 dark:border-zinc-800'}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{c.label}</span>
                {c.active && <Star className="w-3.5 h-3.5 text-indigo-500 fill-current" />}
                <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">{c.kind}</span>
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {c.hasSecrets?.length ? `secrets set: ${c.hasSecrets.join(', ')}` : 'no secrets'}
                {c.config?.gatewayUrl ? ` · ${c.config.gatewayUrl}` : ''}
                {c.config?.baseUrl ? ` · ${c.config.baseUrl}` : ''}
                {c.config?.kernelUrl ? ` · ${c.config.kernelUrl}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => test(c.id)} disabled={busy !== null} className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-600 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Test connection">
                {busy === `test:${c.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
              </button>
              <button onClick={() => activate(c.id)} disabled={busy !== null || c.active} className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Set active">
                {busy === `activate:${c.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => remove(c.id)} disabled={busy !== null} className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800" title="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* add new */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-3 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">Add a connection</div>
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Type</span>
            <select
              value={kind}
              onChange={(e) => { setKind(e.target.value as ConnectionPublic['kind']); setCfg({}); }}
              className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100"
            >
              {KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-zinc-400">{KINDS.find((k) => k.id === kind)?.hint}</p>
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Hermes (Contabo)"
              className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100" />
          </label>
          {kindFields(kind, cfg, setCfg)}

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Vantage account binding (optional — enables live MCP tools for THIS agent)</span>
          </div>
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Vantage X-Agent-Key</span>
            <input type="password" value={cfg.vantageAgentKey || ''} onChange={(e) => setCfg({ ...cfg, vantageAgentKey: e.target.value })}
              placeholder="ak_... (your account's agent key)" className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100" />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Vault connector key (optional — writes turns into your Vantage memory vault)</span>
            <input type="password" value={cfg.vaultConnectorKey || ''} onChange={(e) => setCfg({ ...cfg, vaultConnectorKey: e.target.value })}
              placeholder="vconn_..." className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100" />
          </label>
          <button
            onClick={create}
            disabled={busy !== null}
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 transition-colors disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Save connection
          </button>
        </div>
      </div>
    </div>
  );
};
