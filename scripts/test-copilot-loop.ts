/**
 * npm run test:copilot
 * Exercises the real /api/copilot handler + real @google/genai SDK against a mocked Gemini HTTP
 * endpoint: verifies multi-step function calling, tool execution on live DB state, functionResponse
 * round-trip, and that propose_action_task yields a pending (unwritten) action.
 */
import "./env";
import { POST } from "../app/api/copilot/route";
import { q, getPool } from "../lib/db";

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
const script = [
  { functionCall: { id: "c1", name: "get_campaign_performance", args: { as_of_date: "2025-04-20" } } },
  { functionCall: { id: "c2", name: "check_data_availability", args: { topic: "CAC" } } },
  { functionCall: { id: "c3", name: "propose_action_task", args: { title: "Pause SC01", description: "0 confirmed from 224 attempts", priority: "high", owner_name: "Kabir Shah", linked_campaign_id: "sc01" } } },
  { text: "**Answer** SC01 should be killed." },
];
const sent: unknown[] = [];
const realFetch = globalThis.fetch;
let step = 0;
let rejectModel: string | null = null;
const modelsHit: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url instanceof Request ? url.url : url);
  if (!u.includes("generativelanguage")) return realFetch(url, init);
  if (rejectModel && u.includes(rejectModel))
    return new Response(JSON.stringify({ error: { code: 404, message: `models/${rejectModel} is not found`, status: "NOT_FOUND" } }), { status: 404, headers: { "content-type": "application/json" } });
  modelsHit.push(u.match(/models\/([^:]+):/)?.[1] ?? "?");
  sent.push(JSON.parse(String(init?.body)));
  const part = script[step++];
  return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [part] }, finishReason: "STOP" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

let fail = 0;
const check = (n: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${n} ${ok ? "" : extra}`);
  if (!ok) fail++;
};

async function main() {
  // Exercise the code default even if .env.local pins GEMINI_MODEL.
  delete process.env.GEMINI_MODEL;
  const before = (await q(`select count(*)::int n from tasks`))[0].n;
  const res = await POST(new Request("http://x/api/copilot", { method: "POST", body: JSON.stringify({ asOf: "2025-04-20", messages: [{ role: "user", content: "Should we kill SC01? What's our CAC?" }] }) }));
  const j = await res.json();
  check("status 200", res.status === 200, JSON.stringify(j));
  check("4 model calls (3 tool steps + answer)", step === 4, String(step));
  check("tool trace names", JSON.stringify(j.tool_calls.map((t: { name: string }) => t.name)) === JSON.stringify(["get_campaign_performance", "check_data_availability", "propose_action_task"]));
  const sc01 = JSON.parse(j.tool_calls[0].result).campaigns.find((c: { sponsor_campaign_id: string }) => c.sponsor_campaign_id === "SC01");
  check("tool result grounded: SC01 attempts 224, confirmed 0, Kill", sc01.attempts === 224 && sc01.confirmed === 0 && sc01.decision.label === "Kill");
  check("CAC flagged unavailable", JSON.parse(j.tool_calls[1].result).available === false);
  const last = sent[3] as { contents: { role: string; parts: { functionResponse?: { name: string; id?: string } }[] }[]; tools: unknown[]; systemInstruction: unknown };
  const fr = last.contents.flatMap((c) => c.parts).filter((p) => p.functionResponse);
  check("functionResponses sent back with ids", fr.length === 3 && fr[0].functionResponse?.id === "c1", JSON.stringify(fr));
  check("tool declarations + system prompt sent", Array.isArray(last.tools) && Boolean(last.systemInstruction));
  check("pending action returned, campaign id normalised", j.pending_actions.length === 1 && j.pending_actions[0].linked_campaign_id === "SC01");
  const after = (await q(`select count(*)::int n from tasks`))[0].n;
  check("no task written without user confirmation", after === before);
  check("final reply text", j.reply.includes("SC01"));
  check("default model is gemini-3.8-flash", j.model === "gemini-3.8-flash" && modelsHit[0] === "gemini-3.8-flash", JSON.stringify(modelsHit));
  const prompt = JSON.stringify(sent[0] ?? "");
  check("prompt forbids re-adding stalled totals", prompt.includes("negotiating_stalled_by_owner") && prompt.includes("never add deal rows yourself"));

  // Fallback: first model 404s → route retries on the next model in the chain.
  step = 3; // jump straight to the final text answer
  rejectModel = "gemini-3.8-flash";
  modelsHit.length = 0;
  const r2 = await POST(new Request("http://x/api/copilot", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
  const j2 = await r2.json();
  check("falls back to gemini-3-flash-preview when 3.8-flash is unavailable", r2.status === 200 && j2.model === "gemini-3-flash-preview", JSON.stringify(j2));
  console.log(fail ? `\n${fail} failed` : "\nall copilot loop checks passed");
  await getPool().end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
