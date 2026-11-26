"use client";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Check, ChevronDown, ChevronRight, CircleAlert, ListPlus, Send, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { send, useApp } from "./app-context";
import { Badge, Button, Input, Select } from "./ui";
import type { PendingAction } from "@/lib/copilot-tools";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: string;
}
interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
  tools?: ToolCall[];
  pending?: (PendingAction & { state: "pending" | "created" | "dismissed"; task_id?: number })[];
  asOf?: string;
  error?: boolean;
}

const STARTERS = [
  { tag: "Diagnose", q: "Why are we short of the confirmed-partnership target, and which channel is the bottleneck? Back it with numbers." },
  { tag: "Act", q: "Which stalled deals should we chase first? Propose a task for the owner of the highest-value one." },
  { tag: "Trap", q: "How much sponsorship cash is actually sitting in our bank account right now?" },
  { tag: "Trap", q: "Did Beardo's activation increase festival attendance, and what was our CAC per sponsor?" },
  { tag: "Scenario", q: "If we collect 85% of confirmed cash, how many more warm cash deals do we need to reach ₹30L? Label the assumptions." },
  { tag: "Trend", q: "Compare Mar 15 vs Apr 11: what changed in the pipeline and which campaigns drove it?" },
];

const STORE = "risa-copilot-v1";

export function CopilotDrawer() {
  const { copilotOpen, setCopilotOpen, asOf, pendingQuestion, clearPendingQuestion, refreshAll } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(STORE);
      if (s) setMsgs(JSON.parse(s));
    } catch {
      /* storage unavailable */
    }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ignore */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim(), asOf }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const history = next
        .filter((m) => m.role !== "system" && !m.error)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      const r = await send<{ reply: string; tool_calls: ToolCall[]; pending_actions: PendingAction[] }>("/api/copilot", "POST", { messages: history, asOf });
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: r.reply, tools: r.tool_calls, pending: r.pending_actions.map((p) => ({ ...p, state: "pending" as const })), asOf },
      ]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (pendingQuestion && copilotOpen && !busy) {
      const q = pendingQuestion;
      clearPendingQuestion();
      void ask(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingQuestion, copilotOpen]);

  async function confirmTask(mi: number, pi: number, edited: PendingAction) {
    const r = await send<{ task_id: number }>("/api/tasks", "POST", { ...edited, created_by: "ai_copilot", status: "todo" });
    setMsgs((m) =>
      m.map((x, i) =>
        i !== mi ? x : { ...x, pending: x.pending?.map((p, j) => (j === pi ? { ...p, ...edited, state: "created", task_id: r.task_id } : p)) },
      ),
    );
    setMsgs((m) => [...m, { role: "system", content: `✓ Task #${r.task_id} created from Copilot: "${edited.title}". It now appears in Execution & Tasks with an AI-generated badge.` }]);
    await refreshAll();
  }
  function dismiss(mi: number, pi: number) {
    setMsgs((m) => m.map((x, i) => (i !== mi ? x : { ...x, pending: x.pending?.map((p, j) => (j === pi ? { ...p, state: "dismissed" } : p)) })));
  }

  if (!copilotOpen) return null;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl xl:shadow-none">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[13px] font-semibold">AI Growth Analyst & Copilot</div>
          <div className="text-[11px] text-slate-500">Live tool calls on the database · snapshot {asOf}</div>
        </div>
        <button onClick={() => setMsgs([])} title="Clear conversation" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Trash2 className="h-4 w-4" />
        </button>
        <button onClick={() => setCopilotOpen(false)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close copilot">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              I answer only from the live database through deterministic tools (summary, campaigns, pipeline, brand lookup, snapshot compare, scenario math,
              calculator, data-availability check). I propose tasks; you confirm them. Every answer shows the tool evidence it used.
            </div>
            <div className="grid gap-2">
              {STARTERS.map((s) => (
                <button key={s.q} onClick={() => ask(s.q)} className="group rounded-lg border border-slate-200 p-2.5 text-left text-xs text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/40">
                  <Badge tone={s.tag === "Trap" ? "rose" : s.tag === "Act" ? "emerald" : s.tag === "Diagnose" ? "amber" : "indigo"} className="mb-1">
                    {s.tag}
                  </Badge>
                  <div>{s.q}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "system" ? (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {m.content}
            </div>
          ) : m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-3.5 py-2 text-[13px] text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              <div className={clsx("flex gap-2", m.error && "text-rose-700")}>
                <div className={clsx("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md", m.error ? "bg-rose-100" : "bg-indigo-50 text-indigo-600")}>
                  {m.error ? <CircleAlert className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-800">
                  <Markdown text={m.content} />
                </div>
              </div>
              {m.tools && m.tools.length > 0 && <Evidence tools={m.tools} asOf={m.asOf} />}
              {m.pending?.map((p, j) => (
                <TaskCard key={j} p={p} onConfirm={(e) => confirmTask(i, j, e)} onDismiss={() => dismiss(i, j)} />
              ))}
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
            </span>
            Querying live data…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {msgs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-4 pt-2">
          {STARTERS.slice(0, 4).map((s) => (
            <button key={s.q} onClick={() => ask(s.q)} disabled={busy} className="whitespace-nowrap rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
              {s.tag}: {s.q.slice(0, 32)}…
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={2}
          placeholder="Ask about funnel, campaigns, stalled deals, cash…"
          className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <Button type="submit" variant="primary" loading={busy} className="h-10 w-10 !px-0" aria-label="Send">
          {!busy && <Send className="h-4 w-4" />}
        </Button>
      </form>
    </aside>
  );
}

function Evidence({ tools, asOf }: { tools: ToolCall[]; asOf?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="ml-8 rounded-lg border border-slate-200 bg-slate-50/60">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
        <Wrench className="h-3 w-3" /> Evidence · {tools.length} tool call{tools.length > 1 ? "s" : ""} {asOf && <span className="text-slate-400">· snapshot {asOf}</span>}
      </div>
      {tools.map((t, i) => (
        <div key={i} className="border-t border-slate-200">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[11px] text-slate-700 hover:bg-white">
            {open === i ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t.name}
            <span className="truncate text-slate-400">({Object.entries(t.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})</span>
          </button>
          {open === i && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-white px-2.5 py-2 font-mono text-[10px] leading-snug text-slate-600">{pretty(t.result)}</pre>}
        </div>
      ))}
    </div>
  );
}
function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 1);
  } catch {
    return s;
  }
}

function TaskCard({ p, onConfirm, onDismiss }: { p: NonNullable<Msg["pending"]>[number]; onConfirm: (e: PendingAction) => Promise<void>; onDismiss: () => void }) {
  const [e, setE] = useState<PendingAction>(p);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (p.state === "dismissed") return <div className="ml-8 text-[11px] text-slate-400">Proposal dismissed.</div>;
  return (
    <div className={clsx("ml-8 rounded-xl border p-3", p.state === "created" ? "border-emerald-200 bg-emerald-50/60" : "border-indigo-200 bg-indigo-50/40")}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
        <ListPlus className="h-3.5 w-3.5" /> {p.state === "created" ? `Task #${p.task_id} created` : "Proposed task · needs your confirmation"}
      </div>
      {p.state === "created" ? (
        <div className="text-[13px] font-medium text-slate-800">{e.title}</div>
      ) : (
        <div className="space-y-2">
          <Input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} />
          <p className="text-xs text-slate-600">{e.description}</p>
          {e.rationale && <p className="rounded-md bg-white/70 px-2 py-1 text-[11px] text-slate-500">Why: {e.rationale}</p>}
          <div className="grid grid-cols-3 gap-1.5">
            <Input value={e.owner_name ?? ""} placeholder="Owner" onChange={(x) => setE({ ...e, owner_name: x.target.value })} />
            <Select value={e.priority} onChange={(x) => setE({ ...e, priority: x.target.value })}>
              {["low", "medium", "high", "critical"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
            <Input type="date" value={e.due_date ?? ""} onChange={(x) => setE({ ...e, due_date: x.target.value || null })} />
          </div>
          <div className="flex flex-wrap gap-1 text-[11px]">
            {e.linked_opportunity_id && <Badge>Opp {e.linked_opportunity_id}</Badge>}
            {e.linked_campaign_id && <Badge>Campaign {e.linked_campaign_id}</Badge>}
          </div>
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true);
                setErr(null);
                try {
                  await onConfirm(e);
                } catch (x) {
                  setErr((x as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Check className="h-3.5 w-3.5" /> Confirm & create task
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Minimal, safe markdown: headings, bullets, numbered lists, bold, italics, inline code, tables rendered as text. */
function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    out.push(
      L.ordered ? (
        <ol key={out.length} className="my-1 list-decimal space-y-0.5 pl-5">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ol>
      ) : (
        <ul key={out.length} className="my-1 list-disc space-y-0.5 pl-5 marker:text-slate-400">
          {L.items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const b = /^\s*[-*•]\s+(.*)$/.exec(line);
    const n = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (b || n) {
      const ordered = Boolean(n);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((b ?? n)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) out.push(<div key={out.length} className="mt-2 font-semibold text-slate-900">{inline(h[1])}</div>);
    else out.push(<p key={out.length} className="my-1">{inline(line)}</p>);
  }
  flush();
  return <>{out}</>;
}
function inline(t: string): ReactNode[] {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-slate-900">
        {p.slice(2, -2)}
      </strong>
    ) : p.startsWith("`") && p.endsWith("`") ? (
      <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[11px]">
        {p.slice(1, -1)}
      </code>
    ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
