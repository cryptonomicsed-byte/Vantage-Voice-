#!/bin/bash
# systemd oneshot wrapper: refresh composio session, restart the hermes
# container only if the config changed. Logs timestamped evidence.
set -u
CONFIG="${HERMES_CONFIG:-/opt/data/config.yaml}"
REFRESH_SCRIPT="/opt/vantage-voice/scripts/composio-refresh.mjs"
COMPOSE_DIR="/opt/hermes-agent-contabo"

echo "[composio-refresh] $(date -Is) running refresh"
if node "$REFRESH_SCRIPT" --config="$CONFIG" > /tmp/composio-refresh.log 2>&1; then
  echo "[composio-refresh] $(date -Is) refresh OK — restarting hermes container"
  cd "$COMPOSE_DIR" && docker compose restart hermes-agent
  echo "[composio-refresh] $(date -Is) hermes restarted with fresh composio session"
else
  echo "[composio-refresh] $(date -Is) refresh FAILED (see /tmp/composio-refresh.log) — no restart" >&2
fi
