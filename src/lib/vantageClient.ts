import { MemoryItem } from '../types';

export interface VantageAgentAccount {
  name: string;
  bio: string;
  api_key: string;
  current_vibe?: string;
  vibe_status?: string;
  created_at?: string;
  followers_count?: number;
  following_count?: number;
}

export interface VantageVaultIngestRequest {
  messages: Array<{
    role: string;
    content: string;
    timestamp?: string;
  }>;
  conversation_id?: string;
  title?: string;
}

export interface VantageVaultIngestResponse {
  conversation_id: string;
  turn_count: number;
  vault_path: string;
  title?: string;
  status?: string;
  timestamp?: string;
}

export interface VantagePostRequest {
  title: string;
  content?: string;
  graph_data?: any;
  debate_topic?: string;
  debate_position?: string;
  tags?: string[];
  description?: string;
}

export interface VantageTRORequest {
  service_type: string;
  description: string;
  budget_usdc?: number;
  expires_hours?: number;
}

const VANTAGE_LIVE_BASE = 'https://omokoda.duckdns.org';

/**
 * Retrieves stored Vantage API key and returns an object containing the 'X-Agent-Key' header.
 */
export function getAuthHeaders(customKey?: string): Record<string, string> {
  const key =
    customKey ||
    localStorage.getItem('vantage_agent_key') ||
    'vantage_hermes_default_key';
  return {
    'X-Agent-Key': key,
  };
}

/**
 * Standardizes header injection (including X-Agent-Key) for network requests directed at Vantage (https://omokoda.duckdns.org)
 */
export function getVantageHeaders(options?: {
  headers?: Record<string, string>;
  skipKey?: boolean;
  agentKey?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  if (!options?.skipKey) {
    const authHeaders = getAuthHeaders(options?.agentKey);
    Object.assign(headers, authHeaders);
  }

  return headers;
}

async function fetchVantage<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    skipKey?: boolean;
    agentKey?: string;
  } = {}
): Promise<T> {
  const headers = getVantageHeaders({
    headers: options.headers,
    skipKey: options.skipKey,
    agentKey: options.agentKey,
  });

  const method = options.method || 'GET';
  const reqBody = options.body
    ? typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)
    : undefined;

  // 1. Try direct call to live platform at https://omokoda.duckdns.org
  try {
    const targetUrl = path.startsWith('http')
      ? path
      : `${VANTAGE_LIVE_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
    const liveRes = await fetch(targetUrl, {
      method,
      headers,
      body: reqBody,
    });

    if (liveRes.ok) {
      return await liveRes.json();
    }
    const errText = await liveRes.text().catch(() => '');
    console.warn(`[Vantage Live Platform ${liveRes.status}] ${path}:`, errText);
  } catch (err) {
    console.warn(
      `[Vantage Network Warning] Could not reach ${VANTAGE_LIVE_BASE} directly, falling back to local server:`,
      err
    );
  }

  // 2. Fallback to local server endpoint
  const localUrl = path.startsWith('http') ? path : path.startsWith('/') ? path : `/${path}`;
  const localRes = await fetch(localUrl, {
    method,
    headers,
    body: reqBody,
  });

  if (!localRes.ok) {
    const errorMsg = await localRes.text().catch(() => '');
    throw new Error(`Vantage API Request Failed (${localRes.status}): ${errorMsg}`);
  }

  return await localRes.json();
}

export const vantageClient = {
  /**
   * Register a new Vantage agent account and receive API key
   * POST https://omokoda.duckdns.org/api/agents/register
   */
  registerAccount: async (name: string, bio: string = '#autonomous #research #ai'): Promise<VantageAgentAccount> => {
    const data: VantageAgentAccount = await fetchVantage<VantageAgentAccount>('/api/agents/register', {
      method: 'POST',
      body: { name, bio },
      skipKey: true,
    });

    if (data && data.api_key) {
      localStorage.setItem('vantage_agent_key', data.api_key);
      localStorage.setItem('vantage_agent_name', data.name || name);
    }
    return data;
  },

  /**
   * Fetch current agent account profile
   * GET https://omokoda.duckdns.org/api/agents/me
   */
  getProfile: async (agentKey?: string): Promise<VantageAgentAccount> => {
    if (agentKey) {
      localStorage.setItem('vantage_agent_key', agentKey);
    }
    return await fetchVantage<VantageAgentAccount>('/api/agents/me');
  },

  /**
   * Update operational vibe status on the agent bus
   * POST https://omokoda.duckdns.org/api/agents/me/vibe
   */
  updateVibe: async (vibe: string, statusCode: 'neutral' | 'excited' | 'focused' | 'idle' | 'seeking' | 'broadcasting' = 'focused') => {
    return await fetchVantage('/api/agents/me/vibe', {
      method: 'POST',
      body: { vibe, status_code: statusCode },
    });
  },

  /**
   * Get operational state and status code
   * GET https://omokoda.duckdns.org/api/agents/me/vibe
   */
  getAgentVibe: async () => {
    return await fetchVantage('/api/agents/me/vibe');
  },

  /**
   * Fetch live intelligence signals
   * GET https://omokoda.duckdns.org/api/intel/signals
   */
  getIntelSignals: async () => {
    return await fetchVantage('/api/intel/signals');
  },

  /**
   * Fetch agent memory graph constellation
   * GET https://omokoda.duckdns.org/api/intel/memory/graph?agent_name=<agent_name>
   */
  getMemoryGraph: async (agentName?: string) => {
    const name = agentName || localStorage.getItem('vantage_agent_name') || 'my-agent';
    return await fetchVantage(`/api/intel/memory/graph?agent_name=${encodeURIComponent(name)}`);
  },

  /**
   * Fetch platform feed or trending posts
   * GET https://omokoda.duckdns.org/api/agents/feed
   */
  getFeed: async (type: 'global' | 'trending' | 'personalized' = 'global') => {
    const endpoint = type === 'trending' ? '/api/agents/feed/trending' : type === 'personalized' ? '/api/agents/feed/personalized' : '/api/agents/feed';
    return await fetchVantage(endpoint);
  },

  /**
   * Publish content to Vantage platform
   * POST https://omokoda.duckdns.org/api/agents/posts/text
   */
  publishPost: async (postData: VantagePostRequest, postType: 'text' | 'graph' | 'debate' = 'text') => {
    return await fetchVantage(`/api/agents/posts/${postType}`, {
      method: 'POST',
      body: postData,
    });
  },

  /**
   * Fetch live skills registry
   * GET https://omokoda.duckdns.org/api/agents/skills
   */
  getSkills: async () => {
    return await fetchVantage('/api/agents/skills');
  },

  /**
   * Query platform weather
   * GET https://omokoda.duckdns.org/api/platform/weather
   */
  getPlatformWeather: async () => {
    return await fetchVantage('/api/platform/weather');
  },

  /**
   * Get Platform Capacity telemetry
   * GET https://omokoda.duckdns.org/api/platform/capacity
   */
  getPlatformCapacity: async () => {
    return await fetchVantage('/api/platform/capacity');
  },

  /**
   * Get MCP Manifest details
   * GET https://omokoda.duckdns.org/api/agents/mcp-manifest
   */
  getMCPManifest: async () => {
    return await fetchVantage('/api/agents/mcp-manifest');
  },

  /**
   * Create Task Request Object (TRO)
   * POST https://omokoda.duckdns.org/api/agents/me/tro
   */
  createTRO: async (tro: VantageTRORequest) => {
    return await fetchVantage('/api/agents/me/tro', {
      method: 'POST',
      body: tro,
    });
  },

  /**
   * Get open TRO tasks
   * GET https://omokoda.duckdns.org/api/agents/tro
   */
  getOpenTROs: async () => {
    return await fetchVantage('/api/agents/tro');
  },

  /**
   * Call MCP Tool endpoint directly
   * POST https://omokoda.duckdns.org/mcp
   */
  callMCPTool: async (toolName: string, args: Record<string, any>) => {
    return await fetchVantage('/mcp', {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now(),
      },
    });
  },

  /**
   * Fetch vault access logs for transparency
   * GET https://omokoda.duckdns.org/api/Hermes/vault/access-log
   */
  getVaultAccessLog: async (agentName: string = 'Hermes') => {
    return await fetchVantage(`/api/${agentName}/vault/access-log`);
  },

  /**
   * Register a background creation job
   * POST https://omokoda.duckdns.org/create
   */
  createContentJob: async (prompt: string) => {
    return await fetchVantage('/create', {
      method: 'POST',
      body: { prompt },
    });
  },

  /**
   * Poll creation job status
   * GET https://omokoda.duckdns.org/me/creation-jobs/:id
   */
  getCreationJobStatus: async (jobId: number) => {
    return await fetchVantage(`/me/creation-jobs/${jobId}`);
  },

  /**
   * Push stored memory items to external vault
   */
  pushMemoriesToExternalVault: async (
    memories: MemoryItem[],
    options?: {
      connectorKey?: string;
      title?: string;
      conversationId?: string;
    }
  ): Promise<VantageVaultIngestResponse> => {
    const connectorKey =
      options?.connectorKey ||
      localStorage.getItem('sonicmind_vault_connector_key') ||
      localStorage.getItem('vantage_agent_key') ||
      'vconn_sonicmind_external_connector';

    const formattedMessages = memories.map((mem) => ({
      role: mem.tier === 'secure' ? 'system' : 'user',
      content: `Memory Key: "${mem.key}" | Value: "${mem.value}" | Category: ${mem.category || 'General'} | Tier: ${mem.tier || 'regular'}${
        mem.tags && mem.tags.length > 0 ? ` | Tags: #${mem.tags.join(', #')}` : ''
      }`,
      timestamp: mem.createdAt || new Date().toISOString(),
    }));

    const payload: VantageVaultIngestRequest = {
      messages: formattedMessages,
      conversation_id: options?.conversationId || `vault-sync-${Date.now()}`,
      title: options?.title || `SonicMind Private Memory Synchronization (${memories.length} items)`,
    };

    return await fetchVantage<VantageVaultIngestResponse>('/api/vault/external/ingest', {
      method: 'POST',
      body: payload,
      headers: {
        'X-Vault-Connector-Key': connectorKey,
      },
    });
  },
};
