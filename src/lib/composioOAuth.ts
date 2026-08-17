/**
 * Real OAuth connector management via Composio, replacing the previous
 * fake OAuth flow in OAuthIntegrationsModal.tsx (a hardcoded 2-second
 * timer that fabricated a dicebear avatar and a fake email regardless of
 * what happened in the popup, hitting a /api/auth/:provider/login route
 * that never existed server-side).
 *
 * Composio manages the actual OAuth dance for each toolkit -- this module
 * just creates a session for this app's single user, starts a real
 * authorize() redirect, and reports real connection status.
 */
import { Composio, ConnectedAccountStatuses, type ConnectedAccountStatus } from '@composio/core';

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || '';
// Single-user app -- one stable Composio user id for the whole instance,
// persisted in .env so reconnecting across restarts keeps the same
// connected accounts.
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID || 'vantage-voice-owner';

let client: Composio | null = null;
function getClient(): Composio {
  // A cached (or test-injected) client short-circuits the key check: the
  // whole point of __setClientForTests is exercising this module without a
  // real COMPOSIO_API_KEY.
  if (client) return client;
  if (!COMPOSIO_API_KEY) throw new Error('COMPOSIO_API_KEY is not set');
  client = new Composio({ apiKey: COMPOSIO_API_KEY });
  return client;
}

/** Test-only seam: inject a fake client so the alias-collision retry logic
 * can be exercised without a real Composio API key or network. */
export function __setClientForTests(fake: Composio | null): void {
  client = fake;
}

export function isComposioConfigured(): boolean {
  return Boolean(COMPOSIO_API_KEY);
}

// Real toolkit slugs (confirmed against Composio's live catalog: gmail,
// github, google-calendar, etc) are lowercase alphanumeric with
// underscores/hyphens. These functions are reachable directly from HTTP
// route params (/api/oauth/:toolkit/connect) -- validate before an
// arbitrary path segment reaches the Composio SDK.
const SLUG_RE = /^[a-z0-9_-]{1,64}$/;
function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid toolkit slug: "${slug}"`);
  }
}

// Composio's real connected-account IDs are "ca_" + alphanumerics.
const CONNECTION_ID_RE = /^ca_[A-Za-z0-9_-]{1,64}$/;
function assertValidConnectionId(id: string): void {
  if (!CONNECTION_ID_RE.test(id)) {
    throw new Error(`Invalid connection id: "${id}"`);
  }
}

export interface RealConnectedAccount {
  id: string;
  toolkitSlug: string;
  alias: string;
  status: string;
  createdAt: string;
}

export async function listRealConnections(): Promise<RealConnectedAccount[]> {
  const composio = getClient();
  const result = await composio.connectedAccounts.list({ userIds: [COMPOSIO_USER_ID] });
  const items: any[] = (result as any)?.items || [];
  return items.map((i) => ({
    id: i.id,
    toolkitSlug: i.toolkit?.slug || 'unknown',
    alias: i.alias || '',
    status: i.status || 'UNKNOWN',
    createdAt: i.createdAt || '',
  }));
}

// Every status a connected account can be in. Named explicitly (rather than
// leaving Composio's list endpoint to apply whatever it defaults to when no
// `statuses` filter is given) because the case this exists for is a
// connection stuck in INITIATED/INITIALIZING -- an OAuth attempt that was
// started but never completed, e.g. the popup got closed. That connection
// still holds its alias on Composio's side; if it doesn't show up in an
// unfiltered/default-filtered list, the pre-emptive cleanup below silently
// does nothing and authorize() collides with it anyway.
const ALL_CONNECTION_STATUSES = Object.values(ConnectedAccountStatuses) as ConnectedAccountStatus[];

async function findConnectionsByAlias(alias: string, toolkitSlug: string) {
  const composio = getClient();
  const result = await composio.connectedAccounts.list({
    userIds: [COMPOSIO_USER_ID],
    toolkitSlugs: [toolkitSlug],
    statuses: ALL_CONNECTION_STATUSES,
  });
  const items: any[] = (result as any)?.items || [];
  return items.filter((i) => i.alias === alias) as { id: string }[];
}

/** Deletes every connection under this alias, across all statuses. Returns
 * how many were actually removed, so a caller can tell "nothing to clean up"
 * apart from "cleanup ran but didn't help". */
async function removeConnectionsByAlias(alias: string, toolkitSlug: string): Promise<number> {
  const composio = getClient();
  const stale = await findConnectionsByAlias(alias, toolkitSlug);
  let removed = 0;
  for (const c of stale) {
    try {
      await composio.connectedAccounts.delete(c.id);
      removed++;
    } catch {
      /* best-effort; if this leaves the alias still taken, the retry in
         startRealOAuth surfaces Composio's real error instead of looping */
    }
  }
  return removed;
}

/** Composio's specific "alias already in use" collision (code 600, slug
 * ConnectedAccount_BadRequest) -- distinct from any other 400 authorize()
 * could raise, which should NOT trigger a forced cleanup + retry. */
function isAliasCollision(err: unknown): boolean {
  const anyErr = err as any;
  if (anyErr?.status === 400 && anyErr?.error?.error?.slug === 'ConnectedAccount_BadRequest') {
    return true;
  }
  // Fallback for however a differently-shaped error surfaces this same
  // condition -- matched on both words so an unrelated 400 mentioning only
  // one of them isn't mistaken for this.
  const msg = typeof anyErr?.message === 'string' ? anyErr.message : String(err);
  return /alias/i.test(msg) && /already in use/i.test(msg);
}

/**
 * Starts a real OAuth authorize flow for a toolkit. Returns the real
 * redirectUrl the user must visit to approve access.
 *
 * Re-connecting the same toolkit reuses this app's fixed alias
 * (vantage-voice-{toolkitSlug}), so a leftover connection from a previous
 * attempt is removed first. If that pre-emptive pass still misses it --
 * see ALL_CONNECTION_STATUSES above for why it might -- authorize()'s own
 * "already in use" error is caught, answered with a forced re-lookup and
 * delete, and the authorize call is retried once. Driven by Composio's own
 * report that the alias is taken, rather than by guessing up front which
 * status filter would have caught it.
 */
export async function startRealOAuth(toolkitSlug: string): Promise<{ redirectUrl: string; connectionId: string }> {
  assertValidSlug(toolkitSlug);
  const composio = getClient();
  const alias = `vantage-voice-${toolkitSlug}`;

  await removeConnectionsByAlias(alias, toolkitSlug);

  const session = await composio.create(COMPOSIO_USER_ID);
  try {
    const auth = await session.authorize(toolkitSlug, { alias });
    return { redirectUrl: auth.redirectUrl, connectionId: (auth as any).id };
  } catch (err) {
    if (!isAliasCollision(err)) throw err;

    const removed = await removeConnectionsByAlias(alias, toolkitSlug);
    if (removed === 0) {
      // Nothing found to clean up and Composio still says it's taken -- not
      // something a retry would fix (e.g. the alias belongs to a different
      // Composio project/entity). Surface the real error rather than loop.
      throw err;
    }
    const retryAuth = await session.authorize(toolkitSlug, { alias });
    return { redirectUrl: retryAuth.redirectUrl, connectionId: (retryAuth as any).id };
  }
}

export async function deleteRealConnection(connectionId: string): Promise<void> {
  assertValidConnectionId(connectionId);
  const composio = getClient();
  await composio.connectedAccounts.delete(connectionId);
}

export interface RealToolkitSummary {
  slug: string;
  name: string;
  description: string;
  logo: string;
  category: string;
  toolsCount: number;
  connectable: boolean; // has Composio-managed OAuth or no-auth; false = needs a custom auth config
}

// Composio's real catalog is ~1000 toolkits -- fetch once and cache
// in-memory rather than hit the API on every keystroke of a search box.
let toolkitCache: RealToolkitSummary[] | null = null;
let toolkitCacheAt = 0;
const TOOLKIT_CACHE_TTL_MS = 60 * 60 * 1000;
const CATALOG_FETCH_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function listAllToolkits(forceRefresh = false): Promise<RealToolkitSummary[]> {
  const composio = getClient();
  if (!forceRefresh && toolkitCache && Date.now() - toolkitCacheAt < TOOLKIT_CACHE_TTL_MS) {
    return toolkitCache;
  }
  // getToolkits() works at runtime (verified live -- real catalog of
  // ~1000 toolkits returned) but the SDK's .d.ts marks it @private, so
  // TS blocks the call through the typed surface. Casting to any here.
  const raw: any[] = await withTimeout((composio.toolkits as any).getToolkits({}), CATALOG_FETCH_TIMEOUT_MS, 'Composio catalog fetch');
  toolkitCache = raw.map((t: any) => ({
    slug: t.slug,
    name: t.name,
    description: t.meta?.description || '',
    logo: t.meta?.logo || '',
    category: t.meta?.categories?.[0]?.name || 'other',
    toolsCount: t.meta?.toolsCount || 0,
    connectable: Boolean(t.noAuth) || (t.composioManagedAuthSchemes?.length || 0) > 0,
  }));
  toolkitCacheAt = Date.now();
  return toolkitCache;
}

/** Real per-user MCP endpoint -- once toolkits are connected, this is a
 *  genuine MCP server exposing their real tools (send/read email, star a
 *  repo, post to Slack, etc), usable the same way vantageMcp.ts already
 *  connects to Vantage's own MCP server. */
export async function getComposioMcpSession(): Promise<{ url: string; headers: Record<string, string> }> {
  const composio = getClient();
  const session = await composio.create(COMPOSIO_USER_ID, { mcp: true });
  return { url: session.mcp.url, headers: session.mcp.headers as Record<string, string> };
}
