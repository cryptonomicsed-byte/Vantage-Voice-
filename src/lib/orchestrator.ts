/**
 * Real multi-agent turn planner. See docs/MULTI_AGENT_ORCHESTRATION.md for
 * the full design. This module owns the planning decision (which roster
 * member(s) respond, in what order, to do what) and the sequential
 * execution loop; the actual "how do I reach this agent" and "how do I
 * speak this" calls are injected from server.ts so this stays testable
 * and doesn't duplicate the real, already-working bridge/TTS code.
 */
import type { GoogleGenAI } from '@google/genai';

export type RosterBackend = 'native' | 'hermes' | 'open_claw';

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
  /** Real, non-live Gemini call used for both planning and native-member turns. */
  generateText: (systemPrompt: string, userPrompt: string) => Promise<string>;
  /** Real Hermes/OpenClaw bridge call (callVantageAgentBridge in server.ts). */
  callBridge: (backend: 'hermes' | 'open_claw', text: string) => Promise<string>;
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

  const systemPrompt = `You are the turn-taking orchestrator for a multi-agent voice conversation.
Given the user's latest message, the roster of participants, and recent conversation history,
decide which participant(s) should respond and in what order, and what each is actually being
asked to do. Prefer a single responder for ordinary questions. Use multiple turns only when the
task genuinely splits across participants (e.g. one drafts, another reviews) or the user
explicitly asks more than one participant something. Respond with ONLY a JSON object of the form
{"turns":[{"memberId":"...", "task":"..."}]} using memberId values exactly as given. If nothing
needs a spoken response, return {"turns":[]}.`;

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
        reply = await deps.generateText(
          'You are a helpful, concise voice assistant participating in a multi-agent conversation. Speak naturally.',
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
