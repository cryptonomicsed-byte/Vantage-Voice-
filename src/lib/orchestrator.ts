/**
 * Real multi-agent turn planner. See docs/MULTI_AGENT_ORCHESTRATION.md for
 * the full design. This module owns the planning decision (which roster
 * member(s) respond, in what order, to do what) and the sequential
 * execution loop; the actual "how do I reach this agent" and "how do I
 * speak this" calls are injected from server.ts so this stays testable
 * and doesn't duplicate the real, already-working bridge/TTS code.
 */
import type { GoogleGenAI } from '@google/genai';

export type RosterBackend = 'native' | 'hermes' | 'hermes_contabo' | 'open_claw' | 'omokoda2';

export interface RosterMember {
  id: string;
  displayName: string;
  backend: RosterBackend;
  voice: string;
}

export interface PlannedTurn {
  memberId: string;
  task: string;
}

export interface OrchestratorDeps {
  /** Real, non-live, tool-LESS Gemini call -- used only for the planner's own routing decision, where a fast, deterministic JSON reply matters more than tool access. */
  generateText: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Real, non-live, tool-ENABLED Gemini call (generateTextWithTools in server.ts) -- used for native's actual conversational turns, so native keeps its real Vantage/Composio tool access inside a multi-agent exchange instead of losing it the moment a 2nd roster member joins. */
  generateNativeReply: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Real Hermes/OpenClaw/Omo-Koda2 bridge call (bridgeToAgent in server.ts). */
  callBridge: (backend: 'hermes' | 'hermes_contabo' | 'open_claw' | 'omokoda2', text: string) => Promise<string>;
  /** Real direct TTS + WS audio send for one spoken turn. */
  speak: (text: string, voice: string) => Promise<void>;
  /** Real WS transcript event, tagged with who's speaking. */
  emitTranscript: (displayName: string, text: string) => void;
}

/**
 * Real routing decision via Gemini's non-live generateContent -- reads
 * intent (a question aimed at one member by name, a task that splits into
 * draft-then-review, a general question nobody needs to own) and returns
 * a real ordered plan. Falls back to a single native turn on any
 * malformed/failed response rather than silently doing nothing.
 */
export async function planTurns(
  generateText: OrchestratorDeps['generateText'],
  utterance: string,
  roster: RosterMember[],
  recentHistory: string,
): Promise<PlannedTurn[]> {
  const rosterDesc = roster
    .map((m) => `- id="${m.id}" name="${m.displayName}" backend=${m.backend}`)
    .join('\n');

  const systemPrompt = `You are the turn-taking orchestrator for a real multi-agent voice
roundtable. Given the user's latest message, the roster of participants, and recent conversation
history (including what each participant has already said), decide which participant(s) respond
and in what order, and what each is actually being asked to do.

Default to a roundtable: when the user asks an open question, makes a general statement, or asks
the group something, include EVERY roster member in the plan (in a sensible speaking order) so
they each get to weigh in -- that's the whole point of having them all in the conversation. Use
their real prior turns (in recent history) to avoid restating each other; each should add their
own angle, agree/disagree, or build on what was already said, not just repeat it.

Narrow to fewer responders only when it's clearly warranted: the user addresses one participant by
name specifically ("Hermes, ..."), the message is a private/administrative aside (owner PIN, a
settings change) that isn't actually a conversational question, or a participant has nothing
relevant to add because the topic is squarely outside anything they'd know. When in doubt, include
more participants rather than fewer -- silence from someone in the roster should be the exception.

Respond with ONLY a JSON object of the form {"turns":[{"memberId":"...", "task":"..."}]} using
memberId values exactly as given. If truly nothing needs a spoken response (e.g. pure silence/noise),
return {"turns":[]}.`;

  const userPrompt = `Roster:\n${rosterDesc}\n\nRecent history:\n${recentHistory || '(none yet)'}\n\nUser's latest message: "${utterance}"`;

  try {
    const raw = await generateText(systemPrompt, userPrompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in planner response');
    const parsed = JSON.parse(jsonMatch[0]);
    const turns: PlannedTurn[] = Array.isArray(parsed.turns) ? parsed.turns : [];
    const validIds = new Set(roster.map((m) => m.id));
    const filtered = turns.filter((t) => t && typeof t.memberId === 'string' && validIds.has(t.memberId));
    if (filtered.length === 0 && turns.length === 0) return []; // genuinely no response needed
    if (filtered.length === 0) throw new Error('planner returned no valid memberIds');
    return filtered;
  } catch (err: any) {
    console.warn('[Orchestrator] planning failed, falling back to single default turn:', err?.message || err);
    const fallback = roster[0];
    return fallback ? [{ memberId: fallback.id, task: utterance }] : [];
  }
}

/**
 * Executes a real plan sequentially: each turn sees the prior turns' real
 * output (genuine hand-off, not independent parallel answers), speaks via
 * the injected TTS, and a failed turn is skipped (spoken as a short
 * notice) without stalling the rest of the plan.
 */
export async function executeTurns(
  deps: OrchestratorDeps,
  utterance: string,
  roster: RosterMember[],
  plan: PlannedTurn[],
): Promise<void> {
  const exchangeSoFar: string[] = [];

  for (const turn of plan) {
    const member = roster.find((m) => m.id === turn.memberId);
    if (!member) continue;

    const context = exchangeSoFar.length > 0
      ? `Earlier in this exchange:\n${exchangeSoFar.join('\n\n')}\n\n`
      : '';
    const prompt = `${context}The user said: "${utterance}"\n\nYour specific task: ${turn.task}\n\nRespond naturally for spoken voice -- concise, no markdown formatting.`;

    let reply: string;
    try {
      if (member.backend === 'native') {
        reply = await deps.generateNativeReply(
          'You are Vantage-Voice, participating in a real multi-agent voice conversation. You have real tool access (Vantage platform tools, Composio connectors, owner controls) exactly like your normal single-agent self -- use tool_search_retrieval/mcp_server_client or the direct real-Vantage/Composio tools when the task actually needs real data or a real action, don\'t guess. Speak naturally and concisely for voice, no markdown.',
          prompt,
        );
      } else {
        reply = await deps.callBridge(member.backend, prompt);
      }
    } catch (err: any) {
      console.warn(`[Orchestrator] turn for ${member.displayName} failed:`, err?.message || err);
      deps.emitTranscript(member.displayName, `(${member.displayName} didn't respond)`);
      continue;
    }

    deps.emitTranscript(member.displayName, reply);
    exchangeSoFar.push(`${member.displayName}: ${reply}`);
    try {
      await deps.speak(reply, member.voice);
    } catch (err: any) {
      console.warn(`[Orchestrator] TTS failed for ${member.displayName}'s turn:`, err?.message || err);
    }
  }
}
