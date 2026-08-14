#!/bin/bash
# systemd oneshot wrapper: refresh composio session, restart the hermes
# container only if the config changed. Logs timestamped evidence.
set -u
# Host-side path (the container's /opt/data is mounted from here).
CONFIG="${HERMES_CONFIG:-/opt/hermes-agent-contabo/data/config.yaml}"
REFRESH_SCRIPT="/opt/vantage-voice/scripts/composio-refresh.mjs"
COMPOSE_DIR="/opt/hermes-agent-contabo"

echo "[composio-refresh] $(date -Is) running refresh"
# Key lives in the voice app's .env; export if not already in env.
if [ -z "${COMPOSIO_API_KEY:-}" ] && [ -f /opt/vantage-voice/.env ]; then
  export COMPOSIO_API_KEY="$(grep -E '^COMPOSIO_API_KEY=' /opt/vantage-voice/.env | head -1 | cut -d= -f2- | tr -d '"')"
fi
if [ -z "${COMPOSIO_USER_ID:-}" ] && [ -f /opt/vantage-voice/.env ]; then
  export COMPOSIO_USER_ID="$(grep -E '^COMPOSIO_USER_ID=' /opt/vantage-voice/.env | head -1 | cut -d= -f2- | tr -d '"')"
fi
if node "$REFRESH_SCRIPT" --config="$CONFIG" > /tmp/composio-refresh.log 2>&1; then
  echo "[composio-refresh] $(date -Is) refresh OK — restarting hermes container"
  cd "$COMPOSE_DIR" && docker compose restart hermes-agent
  echo "[composio-refresh] $(date -Is) hermes restarted with fresh composio session"
else
  echo "[composio-refresh] $(date -Is) refresh FAILED (see /tmp/composio-refresh.log) — no restart" >&2
fi
