"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, CalendarClock, KanbanSquare, ListChecks, RotateCcw, ShieldCheck, Sparkles, Target } from "lucide-react";
import { HISTORY_END, HISTORY_START, send, useApp, useSnapshot } from "./app-context";
import { Badge, Button, ErrorBox, Modal } from "./ui";
import { CopilotDrawer } from "./copilot";
import { fmtDate } from "@/lib/format";

const NAV = [
  { href: "/", label: "Overview & Funnel", icon: BarChart3 },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/campaigns", label: "Campaigns & Bets", icon: Target },
  { href: "/tasks", label: "Execution & Tasks", icon: ListChecks },
];

const JUMPS = [
  { d: "2025-01-15", l: "Launch" },
  { d: "2025-02-28", l: "Feb 28" },
  { d: "2025-03-15", l: "Target revised" },
  { d: "2025-04-11", l: "Eve of fest" },
  { d: "2025-04-20", l: "Final" },
];

function dayIndex(d: string) {
  return Math.round((Date.parse(d) - Date.parse(HISTORY_START)) / 86400000);
}
function fromIndex(i: number) {
  return new Date(Date.parse(HISTORY_START) + i * 86400000).toISOString().slice(0, 10);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { copilotOpen, setCopilotOpen } = useApp();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-[11px] font-bold text-white">GC</div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Growth Center</div>
            <div className="text-[10px] text-slate-500">Sponsorship · Challenge B</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition",
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          <button
            onClick={() => setCopilotOpen(!copilotOpen)}
            className={clsx(
              "mt-2 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition",
              copilotOpen ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50",
            )}
          >
            <Sparkles className="h-4 w-4" />
            AI Growth Copilot
          </button>
        </nav>
        <div className="border-t border-slate-100 p-3 text-[10px] leading-relaxed text-slate-400">
          Synthetic dataset · CampusFest 2025 (fictional). Values in INR. Times IST.
        </div>
      </aside>
      <div className={clsx("lg:pl-56 transition-[padding]", copilotOpen && "xl:pr-[440px]")}>
        <TopBar />
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={clsx("whitespace-nowrap rounded-md px-2.5 py-1 text-xs", path === n.href ? "bg-slate-900 text-white" : "text-slate-600")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-[1400px] p-4 md:p-6">{children}</main>
      </div>
      <CopilotDrawer />
      {!copilotOpen && (
        <button
          onClick={() => setCopilotOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-700"
        >
          <Sparkles className="h-4 w-4" /> Ask Copilot
        </button>
      )}
    </div>
  );
}

function TopBar() {
  const { asOf, setAsOf, refreshAll } = useApp();
  const { data, isValidating } = useSnapshot();
  const [hyg, setHyg] = useState(false);
  const [reset, setReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const max = dayIndex(HISTORY_END);
  const phase = data?.phase;

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">CampusFest 2025 — Sponsorship Growth Center</h1>
          <p className="text-[11px] text-slate-500">
            Fest 12–13 Apr 2025 ·{" "}
            {phase === "pre_event" ? (
              <span className="text-amber-700">{data?.kpis.days_to_event} days to fest at this snapshot</span>
            ) : phase === "event_window" ? (
              <span className="text-indigo-700">Festival window</span>
            ) : (
              <span className="text-slate-600">Post-event snapshot</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1">
            <CalendarClock className="h-4 w-4 text-slate-400" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Snapshot</span>
            <input
              type="date"
              value={asOf}
              min={HISTORY_START}
              max={HISTORY_END}
              onChange={(e) => e.target.value && setAsOf(e.target.value)}
              className="w-[118px] bg-transparent text-[13px] font-medium tabular-nums outline-none"
              aria-label="Snapshot date"
            />
            <input
              type="range"
              min={0}
              max={max}
              value={dayIndex(asOf)}
              onChange={(e) => setAsOf(fromIndex(Number(e.target.value)))}
              className="hidden w-32 accent-slate-900 md:block"
              aria-label="Scrub snapshot date"
            />
            {isValidating && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />}
          </div>
          <button onClick={() => setHyg(true)} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Data hygiene · {data?.hygiene.duplicates_removed ?? "…"} dupes removed
          </button>
          <Button size="sm" onClick={() => setReset(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to original dataset
          </Button>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-6">
        {JUMPS.map((j) => (
          <button
            key={j.d}
            onClick={() => setAsOf(j.d)}
            className={clsx(
              "whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] transition",
              asOf === j.d ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {j.l} · {fmtDate(j.d).replace(" 2025", "")}
          </button>
        ))}
      </div>

      <Modal open={hyg} onClose={() => setHyg(false)} title="Data hygiene & source-vs-assumption rules" width="max-w-2xl">
        <div className="space-y-4 text-[13px] text-slate-700">
          <p>
            The source file contains exact repeats of stable IDs from an import retry. They are removed on ingest (same ID + identical payload) and logged below. A
            repeat with a different payload would stop the import.
          </p>
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">Sheet</th>
                <th>Stable ID</th>
                <th>Raw rows</th>
                <th>Kept</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data?.hygiene.rows.map((r) => (
                <tr key={r.source_sheet + r.source_id} className="border-t border-slate-100">
                  <td className="py-1.5">{r.source_sheet}</td>
                  <td className="font-mono">{r.source_id}</td>
                  <td>{r.raw_rows}</td>
                  <td>{r.kept_rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-1.5 text-xs">
            <div>Sponsor interactions 953 → 950 · Brand qualification 434 → 433 · Opportunity history 230 → 228</div>
          </div>
          <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed">
            <div><Badge>Snapshot</Badge> Date D = end of D, 23:59:59 IST. Histories use the latest version per entity with effective_at ≤ cutoff; future rows never leak.</div>
            <div><Badge>Sourced</Badge> Brands, contacts, campaigns, interactions, qualification & stage histories, targets, activations.</div>
            <div><Badge tone="sky">User-logged</Badge> Payments (cash collected), new opportunities/interactions, stage edits — appended as new versions stamped at the end of the selected snapshot day.</div>
            <div><Badge tone="violet">Assumption</Badge> Campaign budgets/spend (no spend in source), scenario collection rates.</div>
            <div><Badge tone="amber">Caveat</Badge> confirmed_value_inr is a reported value, not a bank receipt. Activations are associations, not causal uplift.</div>
          </div>
        </div>
      </Modal>

      <Modal open={reset} onClose={() => setReset(false)} title="Reset to original dataset?">
        <p className="text-[13px] text-slate-600">
          This reloads <span className="font-mono text-xs">Sponsor Dataset.xlsx</span> and deletes every user edit, payment, new campaign and task (the 4 seed tasks are restored).
        </p>
        <label className="mt-3 block text-xs text-slate-500">
          Reset token
          <input
            type="password"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            autoComplete="off"
            placeholder="Required only when RESET_TOKEN is set on the server"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 outline-none focus:border-slate-400"
          />
        </label>
        <ErrorBox error={err} />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setReset(false)}>Cancel</Button>
          <Button
            variant="danger"
            loading={resetting}
            onClick={async () => {
              setResetting(true);
              setErr(null);
              try {
                await send("/api/reset", "POST", undefined, resetToken ? { "x-reset-token": resetToken } : undefined);
                await refreshAll();
                setReset(false);
              } catch (e) {
                setErr(e);
              } finally {
                setResetting(false);
              }
            }}
          >
            Reset everything
          </Button>
        </div>
      </Modal>
    </header>
  );
}
