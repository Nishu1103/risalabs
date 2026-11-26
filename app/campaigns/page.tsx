"use client";
import clsx from "clsx";
import { useState } from "react";
import useSWR from "swr";
import { Lightbulb, Pencil, Plus, Settings2, Sparkles } from "lucide-react";
import { fetcher, send, useApp, useSnapshot } from "@/components/app-context";
import { Badge, Button, Card, ErrorBox, Input, Label, Modal, Select, SourceTag, Td, Textarea, Th, decisionTone } from "@/components/ui";
import { DEFAULT_THRESHOLDS, type CampaignMetrics, type DecisionThresholds } from "@/lib/analytics";
import { inr, lakh, pct } from "@/lib/format";

export default function Campaigns() {
  const [th, setTh] = useState<DecisionThresholds>(DEFAULT_THRESHOLDS);
  const qs = Object.entries(th)
    .map(([k, v]) => `&${k}=${v}`)
    .join("");
  const { data, error } = useSnapshot(qs);
  const { askCopilot } = useApp();
  const [editing, setEditing] = useState<CampaignMetrics | null>(null);
  const [adding, setAdding] = useState(false);
  const [showTh, setShowTh] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="h-96 animate-pulse rounded-xl bg-slate-200/60" />;
  const bets = data.campaigns.filter((c) => c.source === "app");

  return (
    <div className="space-y-5">
      <Card
        title="Campaign performance & bet decisions"
        subtitle={`Snapshot ${data.as_of}. Decisions are rule-based on the thresholds below — change them to see decisions update.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowTh(!showTh)}>
              <Settings2 className="h-3.5 w-3.5" /> Thresholds
            </Button>
            <Button size="sm" variant="ghost" onClick={() => askCopilot("Rank our campaigns: which should we scale, pivot or kill, and where should the team's hours go next? Use the decision thresholds.")}>
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Ask Copilot
            </Button>
          </div>
        }
      >
        {showTh && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-5">
            <ThIn label="Scale: min confirmed" v={th.scaleMinConfirmed} on={(n) => setTh({ ...th, scaleMinConfirmed: n })} />
            <ThIn label="Scale: min win rate %" v={Math.round(th.scaleMinWinRate * 100)} on={(n) => setTh({ ...th, scaleMinWinRate: n / 100 })} />
            <ThIn label="Kill: min attempts" v={th.killMinAttempts} on={(n) => setTh({ ...th, killMinAttempts: n })} />
            <ThIn label="Kill: meeting rate below %" v={Math.round(th.killMaxMeetingRate * 100)} on={(n) => setTh({ ...th, killMaxMeetingRate: n / 100 })} />
            <ThIn label="Pivot: min attempts" v={th.pivotMinAttempts} on={(n) => setTh({ ...th, pivotMinAttempts: n })} />
            <p className="col-span-full text-[11px] leading-relaxed text-slate-500">
              <b>Scale</b> if confirmed ≥ {th.scaleMinConfirmed} and opp→confirmed ≥ {Math.round(th.scaleMinWinRate * 100)}%. <b>Kill</b> if attempts ≥ {th.killMinAttempts}, 0 confirmed and &lt;
              {Math.round(th.killMaxMeetingRate * 100)}% of touched brands reach a meeting. <b>Pivot</b> if attempts ≥ {th.pivotMinAttempts} and 0 confirmed but meetings happen (the
              close motion is broken, not the targeting). Otherwise <b>Test</b>.
            </p>
          </div>
        )}
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100">
              <tr>
                <Th className="pl-5">Campaign</Th>
                <Th>Decision</Th>
                <Th className="text-right">Attempts</Th>
                <Th className="text-right">Brands</Th>
                <Th className="text-right">+ve reply</Th>
                <Th className="text-right">Meetings</Th>
                <Th className="text-right">Qualified</Th>
                <Th className="text-right">Opps</Th>
                <Th className="text-right">Confirmed</Th>
                <Th className="text-right">Cash</Th>
                <Th className="text-right">Win rate</Th>
                <Th className="text-right">
                  Budget <span className="normal-case text-violet-600">(assump.)</span>
                </Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c) => (
                <tr key={c.sponsor_campaign_id} className="border-b border-slate-50 align-top hover:bg-slate-50/60">
                  <Td className="pl-5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-slate-400">{c.sponsor_campaign_id}</span>
                      <span className="font-medium text-slate-900">{c.campaign_name}</span>
                      {c.source === "app" && <Badge tone="sky">new bet</Badge>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className={c.channel_group === "warm" ? "text-emerald-700" : c.channel_group === "cold" ? "text-rose-700" : ""}>
                        {c.channel} · {c.channel_group}
                      </span>
                      · {c.owner_name} · <span className={clsx(c.status === "stopped" && "text-rose-600", c.status === "paused" && "text-amber-600")}>{c.status}</span>
                    </div>
                  </Td>
                  <Td className="min-w-[190px] max-w-[230px] whitespace-normal">
                    <Badge tone={decisionTone(c.decision.label)}>{c.decision.label}</Badge>
                    <div className="mt-1 text-[11px] leading-snug text-slate-500">{c.decision.reason}</div>
                  </Td>
                  <Td className="text-right">
                    {c.attempts}
                    <div className="text-[10px] text-slate-400">{pct(c.attempt_share)}</div>
                  </Td>
                  <Td className="text-right">{c.brands_touched}</Td>
                  <Td className="text-right">{c.positive_reply_brands}</Td>
                  <Td className="text-right">
                    {c.meeting_brands}
                    <div className="text-[10px] text-slate-400">{pct(c.meeting_rate)}</div>
                  </Td>
                  <Td className="text-right">{c.qualified_brands}</Td>
                  <Td className="text-right">
                    {c.opportunities}
                    {c.open_opportunities > 0 && <div className="text-[10px] text-amber-600">{c.open_opportunities} open</div>}
                  </Td>
                  <Td className={clsx("text-right font-semibold", c.confirmed ? "text-emerald-700" : "text-slate-400")}>{c.confirmed}</Td>
                  <Td className="text-right">
                    {lakh(c.confirmed_cash_inr)}
                    {c.confirmed_in_kind_inr > 0 && <div className="text-[10px] text-violet-600">+{lakh(c.confirmed_in_kind_inr)} in-kind</div>}
                  </Td>
                  <Td className="text-right">{pct(c.win_rate)}</Td>
                  <Td className="text-right">
                    {c.budget_inr != null ? inr(c.budget_inr) : "—"}
                    {c.cost_per_confirmed_inr && <div className="text-[10px] text-slate-400">{inr(c.cost_per_confirmed_inr)}/deal</div>}
                  </Td>
                  <Td>
                    <button onClick={() => setEditing(c)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Attempts = distinct root touches (outreach sent, intro received, inbound form). Meetings / positive replies = distinct brands. Confirmed & cash = opportunities whose originating campaign
          is this one (association). <SourceTag kind="assumption" /> Budgets are not in the source dataset — they are editable planning assumptions.
        </p>
      </Card>

      <Card
        title="Strategic bets"
        subtitle="New campaigns the team is testing. Tracked alongside source campaigns; activity logged against them flows into the same metrics."
        action={
          <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add bet
          </Button>
        }
      >
        {bets.length === 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Alumni Referral Sprint", "Warm intros from alumni in brand marketing roles — copies the SC02/SC05 pattern that closed 17 deals."],
              ["Partner-gets-partner", "Ask each of 24 confirmed partners for 2 introductions; warm channel converts ~1 deal per 2 attempts."],
              ["Inbound sponsor page + deck", "Scale the SC04 interest form (7/7 opps confirmed) with a public sponsor page and case studies."],
            ].map(([t, d]) => (
              <button key={t} onClick={() => setAdding(true)} className="rounded-xl border border-dashed border-slate-300 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/30">
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-800">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> {t}
                </div>
                <div className="mt-1 text-xs text-slate-500">{d}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bets.map((b) => (
              <div key={b.sponsor_campaign_id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold">{b.campaign_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {b.sponsor_campaign_id} · {b.channel} · {b.owner_name ?? "no owner"}
                    </div>
                  </div>
                  <Badge tone={b.status === "active" ? "emerald" : b.status === "stopped" ? "rose" : "slate"}>{b.status}</Badge>
                </div>
                {b.hypothesis && <p className="mt-2 text-xs text-slate-600">{b.hypothesis}</p>}
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">Target</div>
                    <b>{lakh(b.target_contribution_inr)}</b>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">Confirmed</div>
                    <b>{lakh(b.confirmed_cash_inr)}</b>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">Attempts</div>
                    <b>{b.attempts}</b>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${b.target_contribution_inr ? Math.min(100, (b.confirmed_cash_inr / b.target_contribution_inr) * 100) : 0}%` }} />
                </div>
                <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEditing(b)}>
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editing && <EditCampaign c={editing} onClose={() => setEditing(null)} />}
      <AddBet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ThIn({ label, v, on }: { label: string; v: number; on: (n: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" min={0} value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} />
    </div>
  );
}

function EditCampaign({ c, onClose }: { c: CampaignMetrics; onClose: () => void }) {
  const { refreshAll } = useApp();
  const [f, setF] = useState({
    status: c.status,
    budget_inr: String(c.budget_inr ?? 0),
    spent_inr: String(c.spent_inr ?? 0),
    target_contribution_inr: String(c.target_contribution_inr ?? 0),
    hypothesis: c.hypothesis ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal open onClose={onClose} title={`${c.sponsor_campaign_id} · ${c.campaign_name}`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {["planned", "active", "paused", "stopped"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Target contribution ₹</Label>
          <Input type="number" value={f.target_contribution_inr} onChange={(e) => setF({ ...f, target_contribution_inr: e.target.value })} />
        </div>
        <div>
          <Label hint="(assumption)">Budget ₹</Label>
          <Input type="number" value={f.budget_inr} onChange={(e) => setF({ ...f, budget_inr: e.target.value })} />
        </div>
        <div>
          <Label hint="(assumption)">Spent ₹</Label>
          <Input type="number" value={f.spent_inr} onChange={(e) => setF({ ...f, spent_inr: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Hypothesis / notes</Label>
          <Textarea rows={2} value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} />
        </div>
        {c.budget_basis && <p className="col-span-2 text-[11px] text-violet-700">Budget basis: {c.budget_basis}</p>}
      </div>
      <ErrorBox error={err} />
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await send(`/api/campaigns/${c.sponsor_campaign_id}`, "PATCH", {
                status: f.status,
                budget_inr: Number(f.budget_inr),
                spent_inr: Number(f.spent_inr),
                target_contribution_inr: Number(f.target_contribution_inr),
                hypothesis: f.hypothesis,
              });
              await refreshAll();
              onClose();
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
    </Modal>
  );
}

function AddBet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshAll } = useApp();
  const { data: meta } = useSWR<{ owners: string[] }>(open ? "/api/meta" : null, fetcher);
  const [f, setF] = useState<Record<string, string>>({ channel: "referral", status: "active", campaign_name: "Alumni Referral Sprint" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal open={open} onClose={onClose} title="Add strategic bet">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Name</Label>
          <Input value={f.campaign_name ?? ""} onChange={(e) => setF({ ...f, campaign_name: e.target.value })} />
        </div>
        <div>
          <Label>Channel</Label>
          <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            {["referral", "introduction", "web_inbound", "event", "email", "linkedin", "other"].map((c) => (
              <option key={c}>{c}</option>
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
          <Label>Target contribution ₹</Label>
          <Input type="number" value={f.target_contribution_inr ?? ""} onChange={(e) => setF({ ...f, target_contribution_inr: e.target.value })} />
        </div>
        <div>
          <Label hint="(assumption)">Budget ₹</Label>
          <Input type="number" value={f.budget_inr ?? ""} onChange={(e) => setF({ ...f, budget_inr: e.target.value })} />
        </div>
        <div>
          <Label>Start</Label>
          <Input type="date" value={f.planned_start ?? ""} onChange={(e) => setF({ ...f, planned_start: e.target.value })} />
        </div>
        <div>
          <Label>End</Label>
          <Input type="date" value={f.planned_end ?? ""} onChange={(e) => setF({ ...f, planned_end: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Hypothesis & kill criteria</Label>
          <Textarea
            rows={3}
            placeholder="e.g. 20 alumni asks → 10 intros → 4 confirmed at ~₹90k. Kill if < 3 meetings after 10 intros."
            value={f.hypothesis ?? ""}
            onChange={(e) => setF({ ...f, hypothesis: e.target.value })}
          />
        </div>
      </div>
      <ErrorBox error={err} />
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={busy}
          disabled={!f.campaign_name}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await send("/api/campaigns", "POST", f);
              await refreshAll();
              onClose();
            } catch (e) {
              setErr(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add bet
        </Button>
      </div>
    </Modal>
  );
}
