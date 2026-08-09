# Decision: Vantage-Voice- is Vantage's voice front-end, not s2s

**Status: decided.** `/Users/bino/s2s` ("S2S Voice AI") is retired from
consideration. This repo (Vantage-Voice-, aka SonicMind S2S) is the real,
ongoing voice integration for Vantage.

## Why this needed a decision at all

There is no code-level coupling between Vantage's backend and either
project — both are standalone apps that happen to talk to Vantage over
HTTP/MCP. So "replacing s2s" isn't a migration of running infrastructure
(there was nothing of s2s's deployed anywhere Vantage or any user could
reach); it's a decision about which codebase gets further investment.
s2s's local dev processes (vite + tsx watch, running unattended on this
machine since earlier in the week) have been stopped.

## Basis for the decision

Full comparison: see the session's live-verified findings (real Vantage
MCP access — 669 tools; s2s has zero Vantage integration, only reaches
Hermes's own toolset one hop removed). Vantage-Voice- also already has,
live and verified: real Composio OAuth (full ~1000-toolkit catalog), real
Hermes/OpenClaw agent bridges, owner-gated self-control tools, PWA
install, and now real multi-agent orchestration (see
`docs/MULTI_AGENT_ORCHESTRATION.md`). s2s's genuine strength — a cleaner
cascade architecture with real tests and Docker packaging — doesn't
outweigh the fact that Vantage-Voice- is the one with real, live access to
Vantage itself, which is the actual point of a Vantage voice front-end.

## What was not done

s2s's repo itself has not been deleted — it's untouched on disk at
`/Users/bino/s2s`, just no longer running. Deleting a separate git repo
outright wasn't asked for and isn't done here; only its stray background
processes were stopped.
