# Vantage Voice Architecture — citizen / visitor agent model

## The model

Vantage Voice is a **neutral voice front-end** for any agent framework, with
Vantage as the account + memory + tool system.

- **Citizen**: Omokoda-agent (via the Omokoda2 kernel) — the native path.
  Turns go through the kernel's own `POST /v1/birth` identity and
  `POST /v1/think` control path, so voice actions stay inside the same
  receipt / capability-gate system as every other Omokoda-agent action.
- **Visitors**: Hermes (any gateway URL + key, sessionful), OpenClaw, and any
  generic OpenAI-compatible endpoint (`/v1/chat/completions`). Visitors are
  reached over their own user-supplied endpoints; Vantage Voice never
  hard-depends on any one of them.
- **Fallback**: native Vantage Copilot (Gemini Live with the user's Vantage
  MCP tools).

All agent connections are **user-supplied**: endpoint + credentials + the
user's own Vantage `X-Agent-Key`. Credentials are stored per-user, encrypted
at rest (`AES-256-GCM`, master key from `VV_CREDENTIAL_MASTER_KEY` or an
auto-generated `data/.vv-master.key`), and are **never** returned by any API
(public views carry `hasSecret` + last-4 only). Server-side env defaults remain
supported as the single-user legacy path — a per-user connection always wins.

## Turn flow

```
  microphone ──► cascade engine (server VAD → Groq Whisper STT)
                        │
                        ▼
              active agent connection
        ┌───────────────┼───────────────────────┐
        │ citizen       │ visitors              │ fallback
        ▼               ▼                       ▼
  Omokoda2 kernel  Hermes gateway           Gemini Live
  /v1/think        (sessionful, tools,      (native, with the
  (receipts,       memory)                  connection's Vantage
  capability       OpenClaw / OpenAI-       MCP tool scope)
  gates)           compatible SSE turn
        └───────────────┼───────────────────────┘
                        ▼
              streaming ElevenLabs TTS (barge-in)
                        │
                        ▼
   ┌────────────────────┴────────────────────────┐
   │ Vantage MCP  — per X-Agent-Key scope        │
   │   trading, wallet, social/buzz, jobs,       │
   │   guilds — money-moving gated by owner PIN  │
   ├─────────────────────────────────────────────┤
   │ Vantage voice sessions — transcript + tool  │
   │   audit per conversation (X-Agent-Key)      │
   ├─────────────────────────────────────────────┤
   │ Vantage memory vault — ingest-only connector│
   │   token per connection (VVAULT_CONNECTOR)   │
   └─────────────────────────────────────────────┘
```

Key properties:

- **Per-connection MCP scopes** (`src/lib/vantageMcp.ts`): one MCP client per
  `X-Agent-Key`, each with its own discovered tool list and name map. A user's
  agent sees exactly the tools its key is authorized for — never another
  user's surface.
- **Money-moving gates unchanged**: `isMoneyMovingVantageToolFor()` + owner
  PIN / explicit confirmation are enforced server-side on every path
  (native live session, `mcp_server_client`, generic-endpoint tool
  injection).
- **Memory continuity**: Hermes sessions carry `X-Hermes-Session-Key` /
  `X-Hermes-Session-Id` so the visitor agent's own memory and skills ride
  along; Omokoda2 turns hit the kernel's glyph vault; every turn is also
  mirrored into the user's Vantage memory vault via the per-connection
  connector token.
- **Audit**: each voice session records which connection (id + kind + label)
  served it, in the server log and in the Vantage voice-session metadata.

## Storage & isolation

- `data/connections/<userId>.json` — one encrypted store file per user,
  mode 0600. User identity comes from the `x-user-id` request header the
  browser supplies (falls back to `local-owner` for single-user deploys).
- REST surface: `GET/POST/PUT/DELETE /api/connections[/:id]`,
  `POST /api/connections/:id/activate`, `POST /api/connections/:id/test`
  (probe + tool/MCP enumeration).
- The browser persists the chosen connection in `localStorage`
  (`vv_connection_id`) and sends it with the WebSocket `config` message;
  the server resolves the connection per session before choosing the
  voice engine (cascade for omokoda2/hermes/openclaw/openai, Gemini Live
  for native).

## Files

- `src/lib/agentConnections.ts` — types, encrypted store, connection tests
- `src/lib/openAiCompat.ts` — generic OpenAI-compatible SSE client
- `src/lib/vantageMcp.ts` — per-key MCP scopes + money-moving gate
- `src/lib/vantageVoiceSession.ts` — per-connection voice sessions
- `src/lib/omokoda2.ts` — citizen path (kernel birth/think/glyph)
- `src/lib/hermesDirect.ts` — visitor path (Hermes gateway, sessionful)
- `src/components/ConnectAgentPanel.tsx` — Settings → "Connect Your Agent"
- `server.ts` — `/api/connections/*` routes + per-session connection wiring
