"use client";
import clsx from "clsx";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { AlertTriangle, Columns3, MessageSquarePlus, Plus, Rows3, Search, Sparkles } from "lucide-react";
import { fetcher, send, useApp, useSnapshot } from "@/components/app-context";
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Modal, Select, SlideOver, Td, Textarea, Th, stageTone } from "@/components/ui";
import { fmtDate, inr, lakh, stageLabel } from "@/lib/format";
import type { OppView } from "@/lib/analytics";

const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];

interface Meta {
  brands: { brand_id: string; brand_name: string; industry: string }[];
  campaigns: { sponsor_campaign_id: string; campaign_name: string }[];
  owners: string[];
  contacts: { contact_id: string; contact_name: string; job_title: string; brand_id: string }[];
  industries: string[];
}

export default function PipelinePage() {
  return (
    <Suspense>
      <Pipeline />
    </Suspense>
  );
}

function Pipeline() {
  const params = useSearchParams();
  const { stalledDays, setStalledDays } = useApp();
  const { data, error } = useSnapshot();
  const [view, setView] = useState<"table" | "kanban">("table");
  const [qText, setQ] = useState("");
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [camp, setCamp] = useState("");
  const [owner, setOwner] = useState("");
  const [support, setSupport] = useState("");
  const [onlyStalled, setOnlyStalled] = useState(params.get("stalled") === "1");
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpp, setNewOpp] = useState(false);
  const [newIx, setNewIx] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const t = qText.toLowerCase();
    return data.opportunities.filter(
      (o) =>
        (!t || `${o.opportunity_id} ${o.brand_name} ${o.opportunity_name} ${o.campaign_name}`.toLowerCase().includes(t)) &&
        (!stage || o.stage === stage) &&
        (!camp || o.campaign_id === camp) &&
        (!owner || o.owner_name === owner) &&
        (!support || o.support_type === support) &&
        (!onlyStalled || o.is_stalled),
    );
  }, [data, qText, stage, camp, owner, support, onlyStalled]);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-xl bg-slate-200/60" />;
  const owners = [...new Set(data.opportunities.map((o) => o.owner_name).filter(Boolean))] as string[];

  return (
    <div className="space-y-4">
      {data.stalled.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13px]">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>
            <b>{data.stalled.length} stuck deals</b> in proposal/negotiation &gt; {stalledDays} days · {lakh(data.kpis.stalled_value_inr)} at risk
            {data.phase === "post_event" && <span className="text-slate-600"> · fest is over: {data.kpis.open_opportunities} open deals should be closed out</span>}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
            Stuck after
            <Input type="number" min={1} max={60} value={stalledDays} onChange={(e) => setStalledDays(Math.max(1, Number(e.target.value) || 7))} className="!w-16 !py-1" />
            days
          </label>
          <Button size="sm" onClick={() => setOnlyStalled(!onlyStalled)}>
            {onlyStalled ? "Show all" : "Show stuck only"}
          </Button>
        </div>
      )}

      <Card
        title={`Opportunities · ${rows.length} of ${data.opportunities.length}`}
        subtitle={`Latest version per opportunity at snapshot ${data.as_of}. Click a row to edit — every change appends a new version, history stays intact.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setNewIx(true)}>
              <MessageSquarePlus className="h-3.5 w-3.5" /> Log interaction
            </Button>
            <Button size="sm" variant="primary" onClick={() => setNewOpp(true)}>
              <Plus className="h-3.5 w-3.5" /> New opportunity
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search brand, ID, campaign…" value={qText} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={stage} onChange={(e) => setStage(e.target.value)} className="!w-auto">
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </Select>
          <Select value={camp} onChange={(e) => setCamp(e.target.value)} className="!w-auto">
            <option value="">All campaigns</option>
            {data.campaigns.map((c) => (
              <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>
                {c.sponsor_campaign_id} {c.campaign_name}
              </option>
            ))}
          </Select>
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="!w-auto">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
          <Select value={support} onChange={(e) => setSupport(e.target.value)} className="!w-auto">
            <option value="">Cash & in-kind</option>
            <option value="cash">Cash</option>
            <option value="in_kind">In-kind</option>
          </Select>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button onClick={() => setView("table")} className={clsx("rounded-md p-1.5", view === "table" ? "bg-slate-900 text-white" : "text-slate-500")} aria-label="Table view">
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setView("kanban")} className={clsx("rounded-md p-1.5", view === "kanban" ? "bg-slate-900 text-white" : "text-slate-500")} aria-label="Kanban view">
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty>No opportunities match these filters at this snapshot.</Empty>
        ) : view === "table" ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th className="pl-5">ID</Th>
                  <Th>Brand</Th>
                  <Th>Stage</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Proposed</Th>
                  <Th className="text-right">Confirmed</Th>
                  <Th className="text-right">Collected</Th>
                  <Th>Campaign</Th>
                  <Th>Owner</Th>
                  <Th className="text-right">Days in stage</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.opportunity_id} onClick={() => setSelected(o.opportunity_id)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50">
                    <Td className="pl-5 font-mono text-xs text-slate-500">
                      {o.opportunity_id}
                      {o.source === "app" && <Badge tone="sky" className="ml-1">new</Badge>}
                    </Td>
                    <Td className="font-medium text-slate-900">
                      {o.brand_name}
                      <div className="text-[11px] font-normal text-slate-400">{o.industry}</div>
                    </Td>
                    <Td>
                      <Badge tone={stageTone(o.stage)}>{stageLabel(o.stage)}</Badge>
                      {o.is_stalled && <Badge tone="rose" className="ml-1">stuck</Badge>}
                    </Td>
                    <Td>{o.support_type === "cash" ? "Cash" : <Badge tone="violet">In-kind</Badge>}</Td>
                    <Td className="text-right">{inr(o.proposed_value_inr)}</Td>
                    <Td className="text-right">{o.confirmed_value_inr ? inr(o.confirmed_value_inr) : "—"}</Td>
                    <Td className={clsx("text-right", o.cash_collected_inr > 0 && "font-medium text-emerald-700")}>{o.cash_collected_inr ? inr(o.cash_collected_inr) : "—"}</Td>
                    <Td className="max-w-[180px] truncate text-xs">
                      <span className={o.channel_group === "warm" ? "text-emerald-700" : o.channel_group === "cold" ? "text-rose-700" : ""}>{o.campaign_id}</span> {o.campaign_name}
                    </Td>
                    <Td className="text-xs">{o.owner_name}</Td>
                    <Td className={clsx("text-right", o.is_stalled && "font-semibold text-rose-600")}>{o.is_open ? o.days_in_stage : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Kanban rows={rows} onOpen={setSelected} />
        )}
      </Card>

      {selected && <OppDrawer id={selected} onClose={() => setSelected(null)} view={data.opportunities.find((o) => o.opportunity_id === selected)} />}
      <NewOpportunity open={newOpp} onClose={() => setNewOpp(false)} />
      <NewInteraction open={newIx} onClose={() => setNewIx(false)} />
    </div>
  );
}

function Kanban({ rows, onOpen }: { rows: OppView[]; onOpen: (id: string) => void }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto pb-2">
      {STAGES.map((s) => {
        const xs = rows.filter((o) => o.stage === s);
        return (
          <div key={s} className="w-56 shrink-0 rounded-xl bg-slate-50 p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <Badge tone={stageTone(s)}>{stageLabel(s)}</Badge>
              <span className="text-[11px] tabular-nums text-slate-500">
                {xs.length} · {lakh(xs.reduce((a, o) => a + (o.confirmed_value_inr || o.proposed_value_inr), 0))}
              </span>
            </div>
            <div className="space-y-1.5">
              {xs.map((o) => (
                <button key={o.opportunity_id} onClick={() => onOpen(o.opportunity_id)} className={clsx("w-full rounded-lg border bg-white p-2 text-left shadow-sm hover:border-indigo-300", o.is_stalled ? "border-rose-200" : "border-slate-200")}>
                  <div className="flex justify-between gap-1 text-xs font-medium text-slate-900">
                    <span className="truncate">{o.brand_name}</span>
                    <span className="tabular-nums">{lakh(o.confirmed_value_inr || o.proposed_value_inr)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      {o.opportunity_id} · {o.campaign_id} · {o.owner_name?.split(" ")[0]}
                    </span>
                    {o.is_open && <span className={o.is_stalled ? "font-semibold text-rose-600" : ""}>{o.days_in_stage}d</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Detail {
  opportunity: { opportunity_id: string; opportunity_name: string; brand_id: string; brand_name: string; industry: string; campaign_name: string | null; contact_name: string | null; job_title: string | null; support_type: string; source: string };
  history: { history_id: string; stage: string; proposed_value_inr: number; confirmed_value_inr: number; support_type: string | null; owner_name: string | null; note: string | null; source: string; effective_at: string }[];
  payments: { payment_id: number; amount_inr: number; reference: string | null; received_at: string }[];
  interactions: { interaction_id: string; event_type: string; outcome: string | null; summary: string | null; campaign_name: string | null; contact_name: string | null; occurred_at: string; source: string }[];
  qualification: { history_id: string; qualification_status: string; reason: string | null; effective_at: string; source: string }[];
  tasks: { task_id: number; title: string; status: string; owner_name: string | null; due_date: string | null }[];
}

function OppDrawer({ id, onClose, view }: { id: string; onClose: () => void; view?: OppView }) {
  const { asOf, refreshAll, askCopilot } = useApp();
  const { data, mutate, error } = useSWR<Detail>(`/api/opportunities/${id}`, fetcher);
  const { data: meta } = useSWR<Meta>("/api/meta", fetcher);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pay, setPay] = useState({ amount: "", date: asOf > "2025-04-11" ? "2025-04-11" : asOf, ref: "" });
  const [qual, setQual] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const v = view;
  const val = (k: string, d: string | number | null | undefined) => form[k] ?? (d === null || d === undefined ? "" : String(d));

  async function run(label: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(label);
    setErr(null);
    setSaved(null);
    try {
      await fn();
      await Promise.all([mutate(), refreshAll()]);
      setSaved(msg);
      setForm({});
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  }

  const latestQual = data?.qualification.filter((q) => q.effective_at <= `${asOf}T23:59:59+05:30`).at(-1);

  return (
    <SlideOver
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{id}</span>
          <span className="truncate">{data?.opportunity.brand_name ?? v?.brand_name}</span>
          {v && <Badge tone={stageTone(v.stage)}>{stageLabel(v.stage)}</Badge>}
          {v?.is_stalled && <Badge tone="rose">stuck {v.days_in_stage}d</Badge>}
        </div>
      }
    >
      <div className="space-y-5 p-5">
        <ErrorBox error={error || err} />
        {saved && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">✓ {saved} — dashboard, campaigns and copilot now use the new numbers.</div>}
        {!v && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">This opportunity does not exist yet at snapshot {asOf}. Move the snapshot forward to edit it.</div>}

        {data && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs md:grid-cols-4">
            <Info l="Industry" v={data.opportunity.industry} />
            <Info l="Originating campaign" v={data.opportunity.campaign_name ?? "—"} />
            <Info l="Primary contact" v={data.opportunity.contact_name ? `${data.opportunity.contact_name}` : "—"} sub={data.opportunity.job_title ?? undefined} />
            <Info l="Brand qualification" v={latestQual?.qualification_status ?? "—"} />
          </div>
        )}

        {v && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Update deal (appends a new version)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div>
                <Label>Stage</Label>
                <Select value={val("stage", v.stage)} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {stageLabel(s)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Proposed ₹</Label>
                <Input type="number" min={0} value={val("proposed_value_inr", v.proposed_value_inr)} onChange={(e) => setForm({ ...form, proposed_value_inr: e.target.value })} />
              </div>
              <div>
                <Label hint="(only when confirmed)">Confirmed ₹</Label>
                <Input
                  type="number"
                  min={0}
                  disabled={val("stage", v.stage) !== "partner_confirmed"}
                  value={val("confirmed_value_inr", v.confirmed_value_inr)}
                  onChange={(e) => setForm({ ...form, confirmed_value_inr: e.target.value })}
                />
              </div>
              <div>
                <Label>Support type</Label>
                <Select value={val("support_type", v.support_type)} onChange={(e) => setForm({ ...form, support_type: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="in_kind">In-kind</option>
                </Select>
              </div>
              <div>
                <Label>Owner</Label>
                <Select value={val("owner_name", v.owner_name)} onChange={(e) => setForm({ ...form, owner_name: e.target.value })}>
                  {(meta?.owners ?? [v.owner_name ?? ""]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label hint="(IST end of day)">Effective date</Label>
                <Input type="date" value={val("effective_date", asOf)} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
              </div>
              <div className="col-span-2 md:col-span-3">
                <Label>Note</Label>
                <Input value={val("note", "")} placeholder="e.g. Signed MoU received from brand" onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                loading={busy === "save"}
                disabled={Object.keys(form).filter((k) => k !== "effective_date").length === 0}
                onClick={() =>
                  run(
                    "save",
                    () =>
                      send(`/api/opportunities/${id}`, "PATCH", {
                        effective_date: form.effective_date ?? asOf,
                        stage: form.stage,
                        proposed_value_inr: form.proposed_value_inr,
                        confirmed_value_inr: form.confirmed_value_inr,
                        support_type: form.support_type,
                        owner_name: form.owner_name,
                        note: form.note,
                      }),
                    "New version saved",
                  )
                }
              >
                Save new version
              </Button>
              <Button variant="ghost" onClick={() => askCopilot(`Assess opportunity ${id} (${v.brand_name}): is it worth chasing, what is the risk, and what should the owner do next?`)}>
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Ask Copilot about this deal
              </Button>
            </div>
          </section>
        )}

        {v && (
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments · cash collected</h3>
              <span className="text-[11px] text-slate-500">Source data has no bank receipts — log real receipts here</span>
            </div>
            {data?.payments.length ? (
              <ul className="mb-3 space-y-1 text-xs">
                {data.payments.map((p) => (
                  <li key={p.payment_id} className="flex items-center justify-between rounded-md bg-emerald-50 px-2 py-1.5">
                    <span>
                      <b className="tabular-nums">{inr(p.amount_inr)}</b> · {fmtDate(p.received_at)} {p.reference && <span className="text-slate-500">· {p.reference}</span>}
                    </span>
                    <button
                      className="text-[11px] text-rose-600 hover:underline"
                      onClick={() => run("delpay", () => send(`/api/payments?id=${p.payment_id}`, "DELETE"), "Payment removed")}
                    >
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-xs text-slate-500">No payments logged.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" min={1} placeholder="Amount ₹" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
              <Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              <Input placeholder="UTR / reference" value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value })} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                loading={busy === "pay"}
                disabled={!Number(pay.amount)}
                onClick={() =>
                  run("pay", () => send("/api/payments", "POST", { opportunity_id: id, amount_inr: Number(pay.amount), received_date: pay.date, reference: pay.ref }), "Payment logged")
                }
              >
                Log payment
              </Button>
              {v.stage === "partner_confirmed" && v.support_type === "cash" && (
                <button className="text-[11px] text-indigo-600 hover:underline" onClick={() => setPay({ ...pay, amount: String(v.confirmed_value_inr - v.cash_collected_inr) })}>
                  fill outstanding {inr(Math.max(0, v.confirmed_value_inr - v.cash_collected_inr))}
                </button>
              )}
            </div>
          </section>
        )}

        {data && (
          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Stage history (append-only)</h3>
              <ol className="space-y-2 border-l border-slate-200 pl-3">
                {data.history.map((h) => {
                  const future = h.effective_at > `${asOf}T23:59:59+05:30`;
                  return (
                    <li key={h.history_id} className={clsx("relative text-xs", future && "opacity-40")}>
                      <span className={clsx("absolute -left-[17px] top-1 h-2 w-2 rounded-full", h.source === "app" ? "bg-sky-500" : "bg-slate-400")} />
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={stageTone(h.stage)}>{stageLabel(h.stage)}</Badge>
                        <span className="tabular-nums text-slate-600">{inr(h.confirmed_value_inr || h.proposed_value_inr)}</span>
                        {h.support_type && <Badge tone="violet">{h.support_type}</Badge>}
                        {h.source === "app" && <Badge tone="sky">app edit</Badge>}
                        {future && <Badge>after snapshot</Badge>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {fmtDate(h.effective_at)} · {h.owner_name} {h.note && `· ${h.note}`}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand qualification</h3>
              <div className="flex gap-2">
                <Select value={qual || latestQual?.qualification_status || ""} onChange={(e) => setQual(e.target.value)}>
                  {["unreviewed", "engaged", "qualified", "unqualified", "dormant"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={!qual || qual === latestQual?.qualification_status}
                  loading={busy === "qual"}
                  onClick={() =>
                    run("qual", () => send(`/api/brands/${data.opportunity.brand_id}`, "PATCH", { qualification_status: qual, effective_date: asOf }), "Qualification updated")
                  }
                >
                  Update
                </Button>
              </div>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-500">
                {data.qualification.map((q) => (
                  <li key={q.history_id} className={q.effective_at > `${asOf}T23:59:59+05:30` ? "opacity-40" : ""}>
                    {fmtDate(q.effective_at)} · <b className="text-slate-700">{q.qualification_status}</b> — {q.reason}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Brand interactions</h3>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto text-xs">
                {data.interactions.map((i) => (
                  <li key={i.interaction_id} className={clsx("rounded-md bg-slate-50 px-2 py-1.5", i.occurred_at > `${asOf}T23:59:59+05:30` && "opacity-40")}>
                    <div className="flex justify-between">
                      <b className="text-slate-700">
                        {i.event_type.replace(/_/g, " ")}
                        {i.outcome && i.event_type === "replied" ? ` · ${i.outcome}` : ""}
                      </b>
                      <span className="text-slate-400">{fmtDate(i.occurred_at)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {i.campaign_name} {i.contact_name && `· ${i.contact_name}`}
                    </div>
                  </li>
                ))}
              </ul>
              {data.tasks.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked tasks</h3>
                  <ul className="space-y-1 text-xs">
                    {data.tasks.map((t) => (
                      <li key={t.task_id}>
                        #{t.task_id} {t.title} <Badge>{t.status}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </SlideOver>
  );
}

function Info({ l, v, sub }: { l: string; v: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{l}</div>
      <div className="font-medium text-slate-800">{v}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

function NewOpportunity({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { asOf, refreshAll } = useApp();
  const { data: meta } = useSWR<Meta>(open ? "/api/meta" : null, fetcher);
  const [f, setF] = useState<Record<string, string>>({ support_type: "cash", stage: "prospecting" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const isNew = f.brand_id === "__new";
  return (
    <Modal open={open} onClose={onClose} title="New opportunity">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Brand</Label>
          <Select value={f.brand_id ?? ""} onChange={(e) => setF({ ...f, brand_id: e.target.value })}>
            <option value="">Select brand…</option>
            <option value="__new">+ New brand</option>
            {meta?.brands.map((b) => (
              <option key={b.brand_id} value={b.brand_id}>
                {b.brand_name} ({b.brand_id})
              </option>
            ))}
          </Select>
        </div>
        {isNew && (
          <>
            <div>
              <Label>New brand name</Label>
              <Input value={f.new_brand_name ?? ""} onChange={(e) => setF({ ...f, new_brand_name: e.target.value })} />
            </div>
            <div>
              <Label>Industry</Label>
              <Select value={f.industry ?? ""} onChange={(e) => setF({ ...f, industry: e.target.value })}>
                {meta?.industries.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </div>
          </>
        )}
        <div>
          <Label>Campaign</Label>
          <Select value={f.sponsor_campaign_id ?? ""} onChange={(e) => setF({ ...f, sponsor_campaign_id: e.target.value })}>
            <option value="">—</option>
            {meta?.campaigns.map((c) => (
              <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>
                {c.sponsor_campaign_id} {c.campaign_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Owner</Label>
          <Select value={f.owner_name ?? ""} onChange={(e) => setF({ ...f, owner_name: e.target.value })}>
            <option value="">—</option>
            {meta?.owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Stage</Label>
          <Select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Support type</Label>
          <Select value={f.support_type} onChange={(e) => setF({ ...f, support_type: e.target.value })}>
            <option value="cash">Cash</option>
            <option value="in_kind">In-kind</option>
          </Select>
        </div>
        <div>
          <Label>Proposed value ₹</Label>
          <Input type="number" min={0} value={f.proposed_value_inr ?? ""} onChange={(e) => setF({ ...f, proposed_value_inr: e.target.value })} />
        </div>
        <div>
          <Label>Created on</Label>
          <Input type="date" value={f.effective_date ?? asOf} onChange={(e) => setF({ ...f, effective_date: e.target.value })} />
        </div>
      </div>
      <div className="mt-3">
        <ErrorBox error={err} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!f.brand_id || (isNew && !f.new_brand_name)}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await send("/api/opportunities", "POST", {
                ...f,
                brand_id: isNew ? undefined : f.brand_id,
                industry: f.industry ?? meta?.industries[0],
                effective_date: f.effective_date ?? asOf,
              });
              await refreshAll();
              setF({ support_type: "cash", stage: "prospecting" });
              onClose();
            } catch (e) {
              setErr(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}

const EVENT_TYPES: Record<string, string[]> = {
  outreach_sent: ["sent"],
  replied: ["positive", "neutral", "not_interested", "wrong_contact"],
  meeting_booked: ["scheduled"],
  meeting_held: ["attended"],
  introduction_received: ["introduced"],
  web_inbound: ["interest_submitted"],
  opt_out: ["do_not_contact"],
};

function NewInteraction({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { asOf, refreshAll } = useApp();
  const { data: meta } = useSWR<Meta>(open ? "/api/meta" : null, fetcher);
  const [f, setF] = useState<Record<string, string>>({ event_type: "outreach_sent" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const contacts = meta?.contacts.filter((c) => c.brand_id === f.brand_id) ?? [];
  return (
    <Modal open={open} onClose={onClose} title="Log interaction">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Brand</Label>
          <Select value={f.brand_id ?? ""} onChange={(e) => setF({ ...f, brand_id: e.target.value, contact_id: "" })}>
            <option value="">Select brand…</option>
            {meta?.brands.map((b) => (
              <option key={b.brand_id} value={b.brand_id}>
                {b.brand_name} ({b.brand_id})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Contact</Label>
          <Select value={f.contact_id ?? ""} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.contact_id} value={c.contact_id}>
                {c.contact_name} · {c.job_title}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Campaign</Label>
          <Select value={f.sponsor_campaign_id ?? ""} onChange={(e) => setF({ ...f, sponsor_campaign_id: e.target.value })}>
            <option value="">—</option>
            {meta?.campaigns.map((c) => (
              <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>
                {c.sponsor_campaign_id} {c.campaign_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Event</Label>
          <Select value={f.event_type} onChange={(e) => setF({ ...f, event_type: e.target.value, outcome: EVENT_TYPES[e.target.value][0] })}>
            {Object.keys(EVENT_TYPES).map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Outcome</Label>
          <Select value={f.outcome ?? EVENT_TYPES[f.event_type][0]} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
            {EVENT_TYPES[f.event_type].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input type="date" value={f.occurred_date ?? asOf} onChange={(e) => setF({ ...f, occurred_date: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Summary</Label>
          <Textarea rows={2} value={f.summary ?? ""} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Outreach, intros and inbound count as new attempts in campaign metrics and the funnel.</p>
      <div className="mt-3">
        <ErrorBox error={err} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!f.brand_id}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await send("/api/interactions", "POST", { ...f, occurred_date: f.occurred_date ?? asOf });
              await refreshAll();
              setF({ event_type: "outreach_sent" });
              onClose();
            } catch (e) {
              setErr(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Log interaction
        </Button>
      </div>
    </Modal>
  );
}
