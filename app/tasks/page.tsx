"use client";
import clsx from "clsx";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Bot, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { fetcher, send, useApp, useSnapshot } from "@/components/app-context";
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Modal, Select, Textarea, type Tone } from "@/components/ui";
import type { TaskRow } from "@/lib/state";
import { fmtDate } from "@/lib/format";

const COLS = [
  { k: "todo", l: "To do" },
  { k: "in_progress", l: "In progress" },
  { k: "done", l: "Done" },
] as const;
const priTone: Record<string, Tone> = { critical: "rose", high: "amber", medium: "sky", low: "slate" };

export default function Tasks() {
  const { data: snap } = useSnapshot();
  const { data: tasks, error, mutate } = useSWR<TaskRow[]>("/api/tasks", fetcher);
  const { refreshAll, askCopilot, asOf } = useApp();
  const [edit, setEdit] = useState<Partial<TaskRow> | null>(null);
  const [owner, setOwner] = useState("");
  const [src, setSrc] = useState("");

  const list = useMemo(() => (tasks ?? []).filter((t) => (!owner || t.owner_name === owner) && (!src || t.created_by === src)), [tasks, owner, src]);
  const owners = [...new Set((tasks ?? []).map((t) => t.owner_name).filter(Boolean))] as string[];

  async function move(t: TaskRow, status: string) {
    await send(`/api/tasks/${t.task_id}`, "PATCH", { status });
    await Promise.all([mutate(), refreshAll()]);
  }

  if (error) return <ErrorBox error={error} />;
  const overdue = (t: TaskRow) => t.status !== "done" && t.due_date && t.due_date < asOf;

  return (
    <div className="space-y-4">
      <Card
        title="Execution & task manager"
        subtitle="Owners, deadlines and action items linked to deals and campaigns. Copilot-proposed tasks land here after you confirm them."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => askCopilot("Based on current bottlenecks, what are the 3 highest-impact tasks we are missing? Propose the most important one as a task.")}>
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Suggest tasks
            </Button>
            <Button size="sm" variant="primary" onClick={() => setEdit({ priority: "medium", status: "todo" })}>
              <Plus className="h-3.5 w-3.5" /> New task
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="!w-auto">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Select value={src} onChange={(e) => setSrc(e.target.value)} className="!w-auto">
            <option value="">User + AI</option>
            <option value="user">Created by user</option>
            <option value="ai_copilot">AI-generated</option>
          </Select>
          <span className="ml-auto text-slate-500">
            {list.filter((t) => t.status !== "done").length} open · {list.filter((t) => t.created_by === "ai_copilot").length} AI-generated · {list.filter((t) => overdue(t)).length} overdue vs snapshot
          </span>
        </div>
        {!tasks ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {COLS.map((c) => {
              const xs = list.filter((t) => t.status === c.k);
              return (
                <div key={c.k} className="rounded-xl bg-slate-50 p-2.5">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">
                    {c.l} <span className="tabular-nums text-slate-400">{xs.length}</span>
                  </div>
                  <div className="space-y-2">
                    {xs.length === 0 && <Empty>Nothing here</Empty>}
                    {xs.map((t) => (
                      <div key={t.task_id} className={clsx("rounded-lg border bg-white p-3 shadow-sm", t.created_by === "ai_copilot" ? "border-indigo-200" : "border-slate-200")}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className={clsx("text-[13px] font-medium leading-snug", t.status === "done" ? "text-slate-400 line-through" : "text-slate-900")}>{t.title}</div>
                            {t.description && <div className="mt-1 line-clamp-3 text-xs text-slate-500">{t.description}</div>}
                            {t.rationale && <div className="mt-1 rounded bg-indigo-50/60 px-1.5 py-1 text-[11px] text-indigo-800">Why: {t.rationale}</div>}
                          </div>
                          <button onClick={() => setEdit(t)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Edit task">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <Badge tone={priTone[t.priority]}>{t.priority}</Badge>
                          {t.created_by === "ai_copilot" && (
                            <Badge tone="indigo">
                              <Bot className="h-3 w-3" /> AI-generated
                            </Badge>
                          )}
                          {t.linked_opportunity_id && <Badge>{t.linked_opportunity_id}</Badge>}
                          {t.linked_campaign_id && <Badge>{t.linked_campaign_id}</Badge>}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            {t.owner_name ?? "Unassigned"} · <span className={overdue(t) ? "font-semibold text-rose-600" : ""}>{t.due_date ? `due ${fmtDate(t.due_date)}` : "no due date"}</span>
                          </span>
                          <Select value={t.status} onChange={(e) => move(t, e.target.value)} className="!h-6 !w-auto !py-0 !text-[11px]">
                            {COLS.map((x) => (
                              <option key={x.k} value={x.k}>
                                {x.l}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {edit && (
        <TaskModal
          t={edit}
          owners={owners}
          opps={snap?.opportunities.map((o) => ({ id: o.opportunity_id, label: `${o.opportunity_id} · ${o.brand_name}` })) ?? []}
          camps={snap?.campaigns.map((c) => ({ id: c.sponsor_campaign_id, label: `${c.sponsor_campaign_id} · ${c.campaign_name}` })) ?? []}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            await Promise.all([mutate(), refreshAll()]);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function TaskModal({
  t,
  owners,
  opps,
  camps,
  onClose,
  onSaved,
}: {
  t: Partial<TaskRow>;
  owners: string[];
  opps: { id: string; label: string }[];
  camps: { id: string; label: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [f, setF] = useState<Partial<TaskRow>>(t);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const { data: meta } = useSWR<{ owners: string[] }>("/api/meta", fetcher);
  const allOwners = [...new Set([...(meta?.owners ?? []), ...owners])];
  const isNew = !t.task_id;
  return (
    <Modal open onClose={onClose} title={isNew ? "New task" : `Edit task #${t.task_id}`}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Title</Label>
          <Input value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Textarea rows={3} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
        <div>
          <Label>Owner</Label>
          <Select value={f.owner_name ?? ""} onChange={(e) => setF({ ...f, owner_name: e.target.value })}>
            <option value="">Unassigned</option>
            {allOwners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Due date</Label>
          <Input type="date" value={f.due_date ?? ""} onChange={(e) => setF({ ...f, due_date: e.target.value })} />
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={f.priority ?? "medium"} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {["low", "medium", "high", "critical"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={f.status ?? "todo"} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {COLS.map((c) => (
              <option key={c.k} value={c.k}>
                {c.l}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Linked opportunity</Label>
          <Select value={f.linked_opportunity_id ?? ""} onChange={(e) => setF({ ...f, linked_opportunity_id: e.target.value || null })}>
            <option value="">—</option>
            {opps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Linked campaign</Label>
          <Select value={f.linked_campaign_id ?? ""} onChange={(e) => setF({ ...f, linked_campaign_id: e.target.value || null })}>
            <option value="">—</option>
            {camps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBox error={err} />
      <div className="mt-4 flex items-center gap-2">
        {!isNew && (
          <Button
            variant="ghost"
            className="text-rose-600"
            onClick={async () => {
              await send(`/api/tasks/${t.task_id}`, "DELETE");
              await onSaved();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!f.title?.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const body = {
                  title: f.title,
                  description: f.description,
                  owner_name: f.owner_name,
                  due_date: f.due_date,
                  priority: f.priority,
                  status: f.status,
                  linked_opportunity_id: f.linked_opportunity_id ?? "",
                  linked_campaign_id: f.linked_campaign_id ?? "",
                };
                if (isNew) await send("/api/tasks", "POST", body);
                else await send(`/api/tasks/${t.task_id}`, "PATCH", body);
                await onSaved();
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
