#!/bin/bash
# Composio Tool Router session refresh hook for the Hermes-agent-contabo
# container. Runs BEFORE hermes starts so every boot gets a FRESH composio
# MCP session URL+key (Composio mints one-time sessions that expire — a
# hardcoded URL silently kills the brain's composio tools).
#
# Idempotent: if mint fails, we log loudly and still start hermes (the
# old URL may still work); if mint succeeds, config.yaml is rewritten with
# the new url+key and hermes starts against the fresh session.
set -u

CONFIG="${HERMES_CONFIG:-/opt/data/config.yaml}"
REFRESH_SCRIPT="${REFRESH_SCRIPT:-/opt/vantage-voice/scripts/composio-refresh.mjs}"

if [ -n "${COMPOSIO_API_KEY:-}" ] || [ -f /root/.vv-cascade-keys.env ] || [ -f /opt/vantage-voice/.vv-cascade-keys.env ]; then
  echo "[composio-refresh] minting fresh session pre-start (config=${CONFIG})"
  if node "$REFRESH_SCRIPT" --config="$CONFIG"; then
    echo "[composio-refresh] OK — fresh composio session written to config"
  else
    echo "[composio-refresh] FAILED — starting hermes with existing config (may be stale)" >&2
  fi
else
  echo "[composio-refresh] COMPOSIO_API_KEY not available — skipping refresh, starting hermes" >&2
fi

exec "$@"
