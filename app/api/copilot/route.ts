import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { bad, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";
import { runTool, TOOL_DECLARATIONS, type PendingAction } from "@/lib/copilot-tools";
import { loadState } from "@/lib/state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_STEPS = 8;
const BUDGET_MS = 48_000;
// gemini-3.8-flash is the default. Preview, then lite, are fallbacks when it 503s or 429s.
// gemini-2.5-flash and gemini-2.0-flash 404 for this key ("no longer available").
const DEFAULT_MODELS = "gemini-3.8-flash,gemini-3-flash-preview,gemini-3.1-flash-lite";

function isQuota(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  return /429|RESOURCE_EXHAUSTED|quota exceeded|rate limit/i.test(m);
}

function isModelUnavailable(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  return isQuota(e) || /404|not found|not supported|NOT_FOUND|PERMISSION_DENIED|403|no longer available|deprecated|503|504|UNAVAILABLE|DEADLINE_EXCEEDED|Deadline expired|high demand|TimeoutError|timed out/i.test(m);
}

function isAuthFailure(e: unknown) {
  const m = String((e as Error)?.message ?? e);
  return /401|UNAUTHENTICATED|API key not valid|API_KEY_INVALID/i.test(m);
}

function systemPrompt(asOf: string) {
  return `You are the Growth Analyst & Copilot inside the "CampusFest 2025 — Sponsorship Growth Center" (RISA Labs Challenge B: maximise sponsorship cash collected before the festival).
The user is currently viewing snapshot date ${asOf} (end of day, Asia/Kolkata). Use it as as_of_date unless the user names another date. The source history covers 2025-01-15..2025-04-20; the festival ran 2025-04-12 10:00 to 2025-04-13 20:00 IST.

GROUNDING RULES — non-negotiable
1. Every number you state must come from a tool result in THIS turn. Call tools first; never answer from memory or earlier turns, because the data may have been edited since.
2. Never do arithmetic in your head, and never add deal rows yourself. If you need a sum, difference, ratio or percentage that is not already a finished total, call \`calculate\`. When a tool result includes negotiating_stalled_by_owner, negotiating_stalled_totals or filtered_negotiating_stalled, copy that object's proposed_value_inr, min_days_in_stage and max_days_in_stage exactly, with the owner name on that row. Do not state a total or a day range unless those exact integers came back from one of those objects or from \`calculate\`.
3. Before answering about any metric you have not seen in a tool result (CAC, ad spend, open rates, venue cost, ROI, attendee impact, probability, etc.) call \`check_data_availability\`. If it is not in the data, say so plainly, do NOT estimate it, and offer the closest sourced proxy.
4. Separate evidence from inference. Structure substantive answers as:
   **Answer** (1–3 sentences) → **Evidence** (bullets with exact figures + which tool) → **Assumptions / limits** (only if any) → **Recommended next step**.
5. Money: format Indian style, e.g. ₹20,00,000 or ₹20.00L. Always say "reported confirmed value" for confirmed_value_inr — it is NOT cash in the bank. "Cash collected" is only what users logged as payments in the app. When asked what is in the bank or what was collected, state three separate figures: reported confirmed cash, reported in-kind, and user-logged cash collected.
6. Causality: campaign attribution and sponsor activations are observational associations. Never claim a campaign or activation caused a deal or increased attendees.
7. Budgets/spend in the app are team-entered ASSUMPTIONS, not source data — label them every time you use them.
8. Projections (simulate_scenario) must be labelled as projections with their assumptions listed.
9. If a question is outside this data (e.g. generic marketing advice, other festivals), say what the data can and cannot support, then give at most a brief clearly-labelled general suggestion.
10. Actions: when the user asks you to create/assign/track something, or after you recommend a concrete action and the user agrees, call \`propose_action_task\` with a specific title, owner (use real owner names from tool results), priority, due date and a data-backed rationale. You CANNOT write tasks yourself — the user must click "Confirm & create task" on the card. Never say a task was created.
11. Follow-ups: resolve references like "those deals" or "that campaign" from the conversation, but re-fetch the numbers with tools.
12. Be concise and decisive. Prefer a clear recommendation with the threshold that justifies it (Scale / Pivot / Kill rules are returned by get_campaign_performance).

Key definitions: qualified brand = latest qualification status "qualified"; confirmed partnership = opportunity whose latest stage is partner_confirmed; open stages = prospecting, contacted, proposal_sent, negotiating; stalled = proposal_sent/negotiating idle > threshold days; warm channels = introduction + web_inbound (SC02, SC04, SC05); cold = email + linkedin (SC01, SC03, SC06).`;
}

interface ClientMsg {
  role: "user" | "assistant";
  content: string;
}

export const POST = handle(async (req: Request) => {
  const body = (await req.json()) as { messages?: ClientMsg[]; asOf?: string };
  const asOf = isDate(body.asOf) ? body.asOf : "2025-04-20";
  const msgs = (body.messages ?? []).filter((m) => m.content?.trim()).slice(-16);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return bad("Last message must be from the user");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return ok(
      {
        error: "GEMINI_API_KEY is not configured on the server. Add it in .env.local (local) or Vercel → Settings → Environment Variables, then redeploy.",
      },
      503,
    );

  // The SDK defaults to API v1. gemini-3-flash-preview is served on v1beta (v1 returns 404).
  const ai = new GoogleGenAI({ apiKey, apiVersion: "v1beta", httpOptions: { timeout: 45000 } });
  // Unset GEMINI_MODEL to use DEFAULT_MODELS. A set value replaces the whole list.
  const candidates = (process.env.GEMINI_MODEL || DEFAULT_MODELS).split(",").map((m) => m.trim()).filter(Boolean);
  let model = candidates[0];
  const contents: Content[] = msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  let state = await loadState();
  const trace: { name: string; args: Record<string, unknown>; result: unknown }[] = [];
  const pending: PendingAction[] = [];
  let reply = "";
  const startedAt = Date.now();
  const abort = new AbortController();
  const budgetTimer = setTimeout(() => abort.abort(), BUDGET_MS);
  const remaining = () => BUDGET_MS - (Date.now() - startedAt);
  const budgetHit = () => abort.signal.aborted || remaining() <= 1500;

  try {
  for (let step = 0; step < MAX_STEPS; step++) {
    if (budgetHit() || remaining() < 1500) break;
    const request = (m: string) =>
      ai.models.generateContent({
        model: m,
        contents,
        config: {
          systemInstruction: systemPrompt(asOf),
          tools: [{ functionDeclarations: TOOL_DECLARATIONS as unknown as never[] }],
          abortSignal: abort.signal,
          httpOptions: { timeout: Math.max(1500, Math.min(45000, remaining() - 500)) },
        },
      });
    let res;
    try {
      res = await request(model);
    } catch (e) {
      if (budgetHit()) break;
      if (isAuthFailure(e))
        return bad(
          "Gemini rejected GEMINI_API_KEY (401). Put a valid key from https://aistudio.google.com/apikey in .env.local or in Vercel environment variables, then restart.",
          401,
        );
      // Only fall back on the first step, before any tool turn depends on a specific model.
      const next = step === 0 && isModelUnavailable(e) ? candidates.slice(candidates.indexOf(model) + 1) : [];
      if (!next.length) {
        if (isQuota(e)) return bad("Gemini rate limit reached. Wait about a minute and ask again.", 429);
        if (budgetHit()) break;
        throw e;
      }
      let lastErr = e;
      for (const m of next) {
        if (budgetHit() || remaining() < 1500) break;
        try {
          res = await request(m);
          model = m;
          break;
        } catch (e2) {
          if (budgetHit()) break;
          if (isAuthFailure(e2))
            return bad(
              "Gemini rejected GEMINI_API_KEY (401). Put a valid key from https://aistudio.google.com/apikey in .env.local or in Vercel environment variables, then restart.",
              401,
            );
          lastErr = e2;
          if (!isModelUnavailable(e2)) throw e2;
        }
      }
      if (!res) {
        if (budgetHit()) break;
        if (isQuota(lastErr)) return bad("Gemini rate limit reached. Wait about a minute and ask again.", 429);
        throw lastErr;
      }
    }
    const calls = res.functionCalls ?? [];
    if (!calls.length) {
      reply = res.text ?? "";
      break;
    }
    // Keep the model's own turn (includes thought signatures required by Gemini 2.5 for multi-step tool use).
    const modelContent = res.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);
    const responses: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = (call.args ?? {}) as Record<string, unknown>;
      let output;
      try {
        output = await runTool(name, args, state, asOf);
      } catch (e) {
        output = { result: { error: (e as Error).message } };
      }
      if (output.pending_action) pending.push(output.pending_action);
      trace.push({ name, args, result: output.result });
      responses.push({ functionResponse: { id: call.id, name, response: { output: output.result } } });
    }
    contents.push({ role: "user", parts: responses });
    if (step === MAX_STEPS - 2) state = await loadState(); // refresh for long chains
  }
  } finally {
    clearTimeout(budgetTimer);
  }
  if (!reply)
    reply = trace.length
      ? "I gathered the data but hit the 48 second limit before the write-up. Use the finished totals in Evidence (proposed_value_inr, min_days_in_stage, max_days_in_stage). Do not add the rows yourself."
      : "Gemini timed out before answering. Ask again.";

  q(`insert into copilot_log (question, tools_called) values ($1, $2)`, [
    msgs[msgs.length - 1].content.slice(0, 1000),
    JSON.stringify(trace.map((t) => ({ name: t.name, args: t.args }))),
  ]).catch(() => undefined);

  return ok({
    reply,
    model,
    as_of: asOf,
    tool_calls: trace.map((t) => {
      const json = JSON.stringify(t.result);
      return { name: t.name, args: t.args, result: json.length > 40000 ? `${json.slice(0, 40000)}… (truncated for display)` : json };
    }),
    pending_actions: pending,
  });
});
