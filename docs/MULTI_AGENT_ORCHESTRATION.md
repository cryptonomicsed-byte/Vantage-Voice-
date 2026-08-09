# Multi-Agent Orchestrated Voice Sessions — Architecture

## Problem

Today, a Vantage-Voice- session has exactly one active "brain" per turn:
native Gemini, or one bridged agent (Hermes or OpenClaw), selected once in
Settings before the call starts. There's no way to have Hermes and
OpenClaw (or native Gemini plus either) in the *same* conversation,
responding to each other and to you, working a shared task.

## Constraints that shape the design

- **One audio engine.** Gemini Live is the only thing in this app that
  turns text into spoken audio. Multiple agents "talking" is necessarily
  multiple *sequential* TTS turns through the same pipeline, not
  simultaneous voices. This is already solved for single-agent bridging
  (`synthesizeSpeechDirect()` in `server.ts`) — the orchestrator reuses it
  per-turn with a per-agent voice, so each participant is recognizable by
  voice even though only one speaks at a time.
- **Bridged agents are non-streaming, request/response.** `Hermes` and
  `OpenClaw` are reached via `callVantageAgentBridge()` — one HTTP call,
  one full reply back. There is no live back-channel between them. Any
  "collaboration" is the orchestrator explicitly feeding one agent's
  output into the next agent's input, in the app layer — the agents don't
  natively know about each other.
- **Native Gemini is also a participant, not just the host.** When the
  roster includes "native", that turn is Gemini answering directly
  in-session (with real Vantage/Composio tool access), not a bridge call.

## Session model

A **roster** is an ordered list of participants for the current session,
each with a stable id, display name, backend (`native` | `hermes` |
`open_claw`), and an assigned Gemini voice (so each is audibly distinct).
Default roster is a single native participant — today's behavior,
unchanged, if multi-agent mode is off.

```ts
interface RosterMember {
  id: string;            // 'native' | 'hermes' | 'open_claw' | future ids
  displayName: string;   // "Hermes", "OpenClaw", "Vantage" (native)
  backend: 'native' | 'hermes' | 'open_claw';
  voice: VoiceName;       // distinct per member
}
```

Configured in Settings (client), sent to the server in the WS `config`
payload as `multiAgentEnabled: boolean` + `roster: RosterMember[]`.

## Turn-taking: the orchestrator's real job

On each finalized user utterance, if `multiAgentEnabled` and the roster
has more than one member, the server does **not** immediately speak a
reply. Instead:

1. **Plan.** A real routing call — `planTurns()` in
   `src/lib/orchestrator.ts` — sends the user's utterance, the roster, and
   recent shared-conversation history to Gemini's non-live
   `generateContent` (a fast, structured JSON call, not the live audio
   session) with an explicit instruction: decide which roster member(s)
   should respond, in what order, and what each is actually being asked
   to do. Returns real structured output:
   ```json
   { "turns": [
       { "memberId": "hermes", "task": "draft a Flask health-check endpoint" },
       { "memberId": "open_claw", "task": "review Hermes's draft for bugs" }
   ] }
   ```
   This is a genuine LLM decision, not a hardcoded round-robin or a
   keyword match — the whole point of "real coordination" is that the
   router reads intent (a question directed at one agent by name, a task
   that logically splits into draft-then-review, a general question
   nobody needs to own) and produces a plan accordingly. A plan can be a
   single turn (most messages), multiple turns (collaboration), or zero
   turns (orchestrator asks the user a clarifying question itself,
   spoken as "Vantage" in the native voice).

2. **Execute, sequentially, with shared context.** For each planned turn,
   in order:
   - Build that member's real input: the user's original utterance, the
     specific `task` the planner assigned them, and a transcript of
     *this exchange's* prior turns so far (so turn 2 genuinely sees turn
     1's output — real hand-off, not two independent answers to the same
     prompt).
   - Dispatch to that member's backend: `native` calls Gemini's
     `generateContent` directly (with the same real Vantage/Composio tool
     access the live session has, via the existing MCP clients); `hermes`
     / `open_claw` call `callVantageAgentBridge()`, unchanged.
   - Speak the real reply via `synthesizeSpeechDirect()` using that
     member's assigned voice, and emit a transcript event tagged with the
     member's display name so the UI can show who said what.
   - Append the real reply to the shared exchange transcript before
     moving to the next planned turn.

3. **Done.** Once all planned turns have spoken, the session returns to
   listening. The next user utterance starts a new planning pass with the
   full session history available to the planner (so it can address "the
   thing Hermes just built" correctly).

## Failure handling

- Planner call fails or returns malformed JSON → fall back to a single
  turn: whichever roster member is marked `default`, real error is
  logged, not hidden.
- A bridge call fails mid-plan → that turn is skipped with a spoken
  "<name> didn't respond" and the remaining planned turns still run; one
  agent being down doesn't stall the whole exchange.
- Native tool calls inside a planned turn behave exactly as the existing
  single-session tool-calling does (real Vantage/Composio errors surface
  honestly).

## What this deliberately does not do

- No simultaneous/overlapping speech — sequential only, by the "one audio
  engine" constraint above.
- No persistent inter-agent memory beyond one exchange's transcript —
  each planning pass starts from the session's real transcript, not a
  separate long-term shared memory store (the existing per-app memory
  vault is a different, already-real feature and is out of scope here).
- The planner is Gemini, not a separate model — reuses the existing
  Gemini key pool rather than adding a new dependency.
