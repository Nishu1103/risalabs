"use client";
import clsx from "clsx";
import Link from "next/link";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp, useSnapshot, type SnapshotResponse } from "@/components/app-context";
import { Badge, Card, ErrorBox, SourceTag, Td, Th, decisionTone } from "@/components/ui";
import { fmtDate, lakh, pct, stageLabel } from "@/lib/format";

export default function Overview() {
  const { data, error } = useSnapshot("&series=1");
  const { askCopilot } = useApp();
  if (error) return <SetupHint error={error} />;
  if (!data) return <Skeleton />;
  const k = data.kpis;

  return (
    <div className="space-y-5">
      <Diagnostics data={data} onAsk={askCopilot} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-3">
        <Kpi
          label="Qualified brands"
          value={String(k.qualified_brands)}
          target={k.qualified_goal}
          actual={k.qualified_brands}
          foot={data.target ? `${data.target.target_version} · goal ${k.qualified_goal}` : "No target yet"}
          tag="sourced"
        />
        <Kpi
          label="Confirmed partnerships"
          value={String(k.confirmed_partnerships)}
          target={k.confirmed_goal}
          actual={k.confirmed_partnerships}
          foot={`${k.confirmed_brands} brands · goal ${k.confirmed_goal ?? "—"}`}
          tag="sourced"
        />
        <Kpi label="Confirmed cash value" value={lakh(k.confirmed_cash_inr)} foot={`${k.confirmed_cash_count} cash deals · reported, not bank receipt`} tag="sourced" />
        <Kpi label="In-kind value" value={lakh(k.confirmed_in_kind_inr)} foot={`${k.confirmed_in_kind_count} in-kind deals · not cash`} tag="sourced" />
        <Kpi
          label="Cash collected before fest"
          value={lakh(k.cash_collected_before_event_inr)}
          foot={
            <span>
              {lakh(k.cash_collected_inr)} logged total ·{" "}
              <Link href="/pipeline?stage=partner_confirmed" className="text-indigo-600 hover:underline">
                log payment
              </Link>
            </span>
          }
          tag="app"
          tone={k.cash_collected_before_event_inr === 0 && k.confirmed_cash_inr > 0 ? "rose" : undefined}
        />
        <Kpi
          label="Open pipeline"
          value={lakh(k.open_pipeline_inr)}
          foot={`${k.open_opportunities} open · ${k.stalled_opportunities} stalled ${data.phase === "post_event" ? "· fest over" : ""}`}
          tag="sourced"
          tone={data.phase === "post_event" && k.open_opportunities ? "amber" : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Sponsorship growth funnel" subtitle="Distinct brands reaching each stage by the snapshot. Populations are measured independently (not strictly nested).">
          <Funnel data={data} />
        </Card>
        <Card className="xl:col-span-2" title="Targets vs actuals over time" subtitle="Weekly snapshots — target steps up on 15 Mar (revised plan)">
          <div className="h-[270px]">
            <ResponsiveContainer>
              <LineChart data={data.series} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d).replace(" 2025", "")} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={(d) => fmtDate(String(d))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="qualified" name="Qualified" stroke="#4f46e5" strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="qualified_goal" name="Qualified goal" stroke="#a5b4fc" strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="stepAfter" dataKey="confirmed_goal" name="Confirmed goal" stroke="#6ee7b7" strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <ChannelMatrix data={data} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Confirmed value by industry" subtitle="Cash vs in-kind, plus open pipeline still at stake">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={data.industries.filter((i) => i.brands > 0)} margin={{ left: -6, right: 8 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="industry" tick={{ fontSize: 10, fill: "#64748b" }} interval={0} />
                <YAxis tickFormatter={(v) => `${v / 100000}L`} tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip formatter={(v) => lakh(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="confirmed_cash_inr" name="Confirmed cash" stackId="a" fill="#059669" />
                <Bar dataKey={(d) => d.confirmed_inr - d.confirmed_cash_inr} name="Confirmed in-kind" stackId="a" fill="#6ee7b7" />
                <Bar dataKey="open_pipeline_inr" name="Open pipeline" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Pipeline by stage" subtitle={`Latest stage per opportunity · avg ${data.cycle_time.avg_days ?? "—"} days created→confirmed (min ${data.cycle_time.min_days ?? "—"}, max ${data.cycle_time.max_days ?? "—"})`}>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Stage</Th>
                <Th className="text-right">Opps</Th>
                <Th className="text-right">Proposed</Th>
                <Th className="text-right">Confirmed</Th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((s) => (
                <tr key={s.stage} className="border-t border-slate-100">
                  <Td>
                    <Link href={`/pipeline?stage=${s.stage}`} className="hover:text-indigo-600">
                      {stageLabel(s.stage)}
                    </Link>
                  </Td>
                  <Td className="text-right">{s.count}</Td>
                  <Td className="text-right">{lakh(s.proposed_value_inr)}</Td>
                  <Td className="text-right">{s.confirmed_value_inr ? lakh(s.confirmed_value_inr) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Diagnostics({ data, onAsk }: { data: SnapshotResponse; onAsk: (q: string) => void }) {
  const ds = data.diagnostics.slice(0, 4);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {ds.map((d) => {
        const Icon = d.severity === "critical" ? AlertOctagon : d.severity === "warning" ? AlertTriangle : CheckCircle2;
        return (
          <div
            key={d.id}
            className={clsx(
              "flex gap-3 rounded-xl border p-3.5",
              d.severity === "critical" && "border-rose-200 bg-rose-50/70",
              d.severity === "warning" && "border-amber-200 bg-amber-50/70",
              d.severity === "ok" && "border-emerald-200 bg-emerald-50/60",
            )}
          >
            <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", d.severity === "critical" ? "text-rose-600" : d.severity === "warning" ? "text-amber-600" : "text-emerald-600")} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-900">{d.title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{d.detail}</div>
            </div>
            <button
              onClick={() => onAsk(`Explain this diagnostic and recommend what to do: "${d.title}"`)}
              className="self-start rounded-md p-1 text-indigo-600 hover:bg-white"
              title="Ask Copilot"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, foot, target, actual, tag, tone }: { label: string; value: string; foot: React.ReactNode; target?: number | null; actual?: number; tag: "sourced" | "app" | "assumption"; tone?: "rose" | "amber" }) {
  const progress = target && actual !== undefined ? Math.min(1, actual / target) : null;
  const met = target && actual !== undefined ? actual >= target : null;
  return (
    <div className={clsx("rounded-xl border bg-white p-3.5", tone === "rose" ? "border-rose-200" : tone === "amber" ? "border-amber-200" : "border-slate-200")}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-500">{label}</span>
        <span className="shrink-0 scale-90 origin-top-right">
          <SourceTag kind={tag} />
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {target ? <span className="text-xs tabular-nums text-slate-400">/ {target}</span> : null}
      </div>
      {progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={clsx("h-full rounded-full", met ? "bg-emerald-500" : progress > 0.8 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <div className="mt-2 text-[11px] leading-snug text-slate-500">{foot}</div>
    </div>
  );
}

function Funnel({ data }: { data: SnapshotResponse }) {
  const max = Math.max(1, data.funnel[0].count);
  return (
    <div className="space-y-1.5">
      {data.funnel.map((f, i) => (
        <div key={f.key}>
          {i > 0 && (
            <div className="flex items-center gap-1 py-0.5 pl-[156px] text-[10px] text-slate-400">
              <ArrowRight className="h-3 w-3 rotate-90" />
              <span className={clsx("tabular-nums", (f.conv_from_prev ?? 1) < 0.5 && "font-semibold text-rose-600")}>{pct(f.conv_from_prev)}</span> stage conversion
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-[144px] shrink-0 text-right">
              <div className="text-xs font-medium text-slate-700">{f.label}</div>
              <div className="truncate text-[10px] text-slate-400" title={f.note}>
                {f.note}
              </div>
            </div>
            <div className="relative h-7 flex-1 rounded-md bg-slate-50">
              <div
                className={clsx("flex h-full items-center rounded-md px-2 text-xs font-semibold tabular-nums text-white transition-all", i >= 5 ? "bg-emerald-600" : i >= 4 ? "bg-indigo-600" : "bg-slate-700")}
                style={{ width: `${Math.max(6, (f.count / max) * 100)}%` }}
              >
                {f.count}
              </div>
            </div>
            <div className="w-12 text-right text-[11px] tabular-nums text-slate-500">{pct(f.conv_from_top)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChannelMatrix({ data }: { data: SnapshotResponse }) {
  const [warm, cold] = data.channel_groups;
  const rows: [string, (g: typeof warm) => string][] = [
    ["Campaigns", (g) => g.campaigns.join(", ")],
    ["Outreach attempts", (g) => `${g.attempts} (${pct(g.attempt_share)})`],
    ["Opportunities", (g) => String(g.opportunities)],
    ["Confirmed deals", (g) => `${g.confirmed} (${pct(g.confirmed_share)} of all)`],
    ["Confirmed cash", (g) => lakh(g.confirmed_cash_inr)],
    ["Open / stalled pipeline", (g) => `${g.open_opportunities} · ${lakh(g.open_pipeline_inr)}`],
  ];
  return (
    <Card title="Channel performance matrix" subtitle="Warm/inbound (introductions, referrals, interest form) vs cold outbound (email, LinkedIn, revival)">
      <div className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <table className="w-full">
            <thead>
              <tr>
                <Th />
                <Th className="text-emerald-700">Warm / inbound</Th>
                <Th className="text-rose-700">Cold outbound</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([l, f]) => (
                <tr key={l} className="border-t border-slate-100">
                  <Td className="text-slate-500">{l}</Td>
                  <Td className="font-medium">{f(warm)}</Td>
                  <Td className="font-medium">{f(cold)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" /> Attribution = campaign recorded on the opportunity at creation. It is an association, not proof of cause.
          </p>
        </div>
        <div className="xl:col-span-3">
          <div className="h-[230px]">
            <ResponsiveContainer>
              <BarChart data={data.campaigns.map((c) => ({ ...c, label: c.sponsor_campaign_id }))} margin={{ left: -18, right: 8 }}>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis yAxisId="a" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis yAxisId="b" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelFormatter={(l, p) => (p?.[0]?.payload?.campaign_name ? `${l} · ${p[0].payload.campaign_name}` : String(l))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="a" dataKey="attempts" name="Attempts" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="b" dataKey="confirmed" name="Confirmed deals" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="b" dataKey="open_opportunities" name="Open opps" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.campaigns.map((c) => (
              <Link key={c.sponsor_campaign_id} href="/campaigns">
                <Badge tone={decisionTone(c.decision.label)}>
                  {c.sponsor_campaign_id} {c.decision.label}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/60" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}

function SetupHint({ error }: { error: unknown }) {
  return (
    <Card title="Can't load data">
      <ErrorBox error={error} />
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-slate-600">
        <li>Set DATABASE_URL in .env.local (or Vercel env vars).</li>
        <li>Run the SQL in supabase/schema.sql, then <code>npm run seed</code> — or press “Reset to original dataset” above.</li>
      </ol>
    </Card>
  );
}
