# Two kernel endpoints Vantage Voice needs (Phase 3/4 blockers)

Written by the Vantage Voice pane while implementing the Omo-Koda2 persona
(see `src/lib/omokoda2.ts`, `docs/` phase history in commit messages
`b507b7d`/`bae12ee`). Phase 1 (birth + think) and Phase 2 (native GlyphIndex
memory read/write) are done and live. Phase 3 (minipae NIP-AE bridge) and
Phase 4 (NIP profile-card publish) cannot proceed safely without two small
additions to the kernel (`omokoda-core/src/server.rs`), because the data
they need (the minipae signing key, the Nostr npub) is intentionally never
exposed over HTTP today — confirmed by grepping every handler in
`server.rs` for `minipae_private_key_hex` / `minipae_npub`: both only exist
in `PrivateSessionData` (`session.rs`), written once at birth
(`interpreter.rs`), read by zero HTTP handlers.

This doc is the exact contract Vantage Voice needs from each endpoint —
not a demand for a specific implementation, just the interface shape so
whoever builds it on the kernel side and this app agree on the wire format
up front.

---

## 1. `POST /v1/vault/minipae/sync` — key-internal NIP-AE sync trigger

**Why:** `~/minipae/omokoda_adapter.py` already implements the real
push/pull logic against a `NIPAE_NSEC` env var, but that key must never
leave the kernel process. This endpoint should run that same push/pull
logic (or a native Rust equivalent) *inside* the kernel, using the
already-in-memory `minipae_private_key_hex` from this guest's
`PrivateSessionData`, and return only a result summary — never the key,
never raw engram plaintext beyond what's already public per the adapter's
own metadata-only boundary (see `omokoda_adapter.py`'s docstring: it
mirrors GlyphIndex pointers, not memory content).

**Request:**
```
POST /v1/vault/minipae/sync
Headers:
  X-Agent-Id: <guest agent id>      (required — same as /v1/think)
  X-Agent-Key: <guest agent key>    (required — same as /v1/think, and
                                      SHOULD be enforced here, unlike the
                                      existing /v1/vault/glyph* routes
                                      which currently only check
                                      X-Agent-Id — flagging that gap too)
Body:
{
  "direction": "push" | "pull" | "sync",   // default "sync", matches
                                             // omokoda_adapter.py's own
                                             // push/pull/sync modes
  "relay": "wss://..."                      // optional override of the
                                             // adapter's default NIPAE_RELAY
}
```

**Response (200):**
```json
{
  "direction": "sync",
  "pushed": 4,
  "pulled": 2,
  "npub": "npub1...",
  "synced_at": "2026-08-21T19:40:00Z"
}
```
`pushed`/`pulled` are engram counts (mirrors `omokoda_adapter.py`'s own
push/pull counters), not content. `npub` is the agent's own minipae public
key, safe to echo back (see endpoint 2 below — same value).

**Errors:**
- `404 {"error": "unknown agent_id"}` — same shape as existing guest-pool errors.
- `401 {"error": "invalid or missing X-Agent-Key"}` — if key checking is added here (recommended).
- `503 {"error": "no minipae key sealed for this agent"}` — an agent birthed before `5b4436a` landed, or one where sibling-key derivation failed, has no `minipae_private_key_hex` to sync with. Should fail closed, not silently no-op.
- `502 {"error": "minipae relay unreachable: <detail>"}` — real relay-connection failure, passed through rather than swallowed.

**What Vantage Voice will do with it:** call this from
`src/lib/omokoda2.ts` (a new `syncOmokoda2Minipae()` alongside the existing
`getOmokoda2GlyphMemory`/`mergeOmokoda2GlyphMemory`), expose it the same
two ways Phase 2's memory read/write are exposed — a REST passthrough
(`POST /api/omokoda2/memory/minipae-sync`) and optionally a voice-callable
tool once there's a natural reason for a user to trigger it by voice.

---

## 2. A public-npub endpoint — for the NIP profile-card publish (Phase 4)

**Why:** Publishing a `kind:0`/`kind:10002` NIP profile card for this
persona (following Vantage's own proven `buzz_identity.py` pattern) needs
the agent's **public** NIP-06 Nostr key and/or minipae npub. Both are
public key material — safe to expose, unlike the sync endpoint above — but
neither is returned by any existing handler. `/v1/birth`'s response
currently only returns `agent_id`/`agent_key` (the guest auth pair, not
the Nostr identity), and `/v1/status` returns none of the seven
sibling-chain public keys/addresses either.

Simplest option: extend the existing `/v1/status` response rather than add
a whole new route, since it's already the "tell me about this agent"
endpoint and already takes the same `X-Agent-Id` header pattern.

**Request:**
```
GET /v1/status
Headers:
  X-Agent-Id: <guest agent id>   (existing header, already supported)
```

**Response (200) — additive fields only, nothing existing removed:**
```json
{
  "has_agent": true,
  "name": "vantage-voice",
  "id": "...",
  "identity": {
    "nostr_npub": "npub1...",
    "nostr_pubkey_hex": "...",
    "minipae_npub": "npub1...",
    "minipae_pubkey_hex": "..."
  }
}
```
`identity` can be `null`/omitted for agents birthed before the sibling-key
work landed (`7c85b2d`/`5b4436a`), so older guests don't break this
endpoint — Vantage Voice will treat a missing `identity` field as "no
portable Nostr identity yet" rather than erroring.

**What Vantage Voice will do with it:** Phase 4 will read
`identity.nostr_npub`/`identity.nostr_pubkey_hex` once, then publish
`kind:0` (name/about/`bot:true` per NIP-24) + `kind:10002` (NIP-65 relay
list) to a real relay **signed with this agent's own key** — meaning the
actual Schnorr signing also has to happen kernel-side (same
never-leave-the-vault constraint as endpoint 1), so this may end up
wanting a third endpoint (`POST /v1/vault/nostr/publish-profile` or
similar) rather than Vantage Voice holding the private key to sign
client-side. Flagging that now so it's not a surprise when Phase 4 starts
— happy to draft that third contract too once endpoint 2 exists and we
know whether "return the pubkey, let the caller sign externally" or
"sign and publish kernel-side" is the preferred shape.

---

## Summary for whoever picks this up

Two real gaps, not speculative: grepped, confirmed, zero HTTP surface for
either today. Recommend endpoint 1 (`/v1/vault/minipae/sync`) and the
`/v1/status` extension (endpoint 2) as the two concrete asks. Vantage
Voice's own code (`src/lib/omokoda2.ts`) is ready to call both the moment
they exist — no other blockers on this app's side for Phase 3/4.
