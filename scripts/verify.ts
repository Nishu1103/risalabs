/**
 * npm run verify
 * Asserts the seeded database reproduces the ground-truth numbers computed independently
 * from the xlsx (pandas cross-check, see README), and that snapshots never leak the future.
 * Run right after `npm run seed` (or the in-app Reset) — user edits will change the numbers.
 */
import "./env";
import { computeSnapshot } from "../lib/analytics";
import { getPool } from "../lib/db";
import { loadDataset } from "../lib/dataset";
import { loadState, type DbState } from "../lib/state";
import { runTool } from "../lib/copilot-tools";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

async function main() {
  // ---------- 1. Ingest & deduplication (straight from the xlsx)
  const d = await loadDataset();
  check("raw interactions = 953", d.rawCounts.interactions, 953);
  check("unique interactions = 950", d.interactions.length, 950);
  check("raw qualification = 434", d.rawCounts.qualification, 434);
  check("unique qualification = 433", d.qualification.length, 433);
  check("raw opportunity history = 230", d.rawCounts.oppHistory, 230);
  check("unique opportunity history = 228", d.oppHistory.length, 228);
  check("total duplicates removed = 6", d.hygiene.reduce((a, h) => a + h.raw_rows - h.kept_rows, 0), 6);

  const s = await loadState();
  check("DB hygiene log rows = 6 duplicate IDs", s.hygiene.reduce((a, h) => a + h.raw_rows - h.kept_rows, 0), 6);
  check("DB brands = 180", s.brands.length, 180);
  check("DB contacts = 270", s.contacts.length, 270);
  check("DB opportunities = 58", s.opportunities.length, 58);

  // ---------- 2. Final snapshot 2025-04-20
  const f = computeSnapshot(s, "2025-04-20");
  check("target version (Apr 20) = Sponsor revised plan", f.target?.target_version, "Sponsor revised plan");
  check("targets 55 qualified / 28 confirmed", [f.kpis.qualified_goal, f.kpis.confirmed_goal], [55, 28]);
  check("qualified brands = 60", f.kpis.qualified_brands, 60);
  check("qualification mix", f.qualification_mix, { qualified: 60, engaged: 28, dormant: 63, unqualified: 21, unreviewed: 8 });
  check("confirmed opps = 24", f.kpis.confirmed_partnerships, 24);
  check("confirmed cash = 20 deals / ₹20,00,000", [f.kpis.confirmed_cash_count, f.kpis.confirmed_cash_inr], [20, 2000000]);
  check("confirmed in-kind = 4 deals / ₹2,40,000", [f.kpis.confirmed_in_kind_count, f.kpis.confirmed_in_kind_inr], [4, 240000]);
  check("confirmed total = ₹22,40,000", f.kpis.confirmed_total_inr, 2240000);
  const st = Object.fromEntries(f.stages.map((x) => [x.stage, [x.count, x.proposed_value_inr]]));
  check("negotiating = 8 / ₹7,20,000", st.negotiating, [8, 720000]);
  check("proposal_sent = 6 / ₹3,30,000", st.proposal_sent, [6, 330000]);
  check("contacted = 6 / ₹2,40,000", st.contacted, [6, 240000]);
  check("prospecting = 6 / ₹1,50,000", st.prospecting, [6, 150000]);
  check("lost = 7 / ₹7,80,000", st.lost, [7, 780000]);
  check("withdrawn = 1 / ₹80,000", st.withdrawn, [1, 80000]);
  check("open pipeline = 26 opps / ₹14,40,000", [f.kpis.open_opportunities, f.kpis.open_pipeline_inr], [26, 1440000]);
  check("cash collected (no receipts in source) = 0", f.kpis.cash_collected_inr, 0);

  const camp = Object.fromEntries(f.campaigns.map((c) => [c.sponsor_campaign_id, c]));
  check("SC01/SC03/SC06 confirmed = 0", [camp.SC01.confirmed, camp.SC03.confirmed, camp.SC06.confirmed], [0, 0, 0]);
  check("cold attempts SC01/SC03/SC06 = 224/54/44", [camp.SC01.attempts, camp.SC03.attempts, camp.SC06.attempts], [224, 54, 44]);
  check("SC05 = 9 confirmed, ₹7.25L cash", [camp.SC05.confirmed, camp.SC05.confirmed_cash_inr], [9, 725000]);
  check("SC02 = 8 confirmed, ₹6.40L cash", [camp.SC02.confirmed, camp.SC02.confirmed_cash_inr], [8, 640000]);
  check("SC04 = 7 confirmed, ₹6.35L cash", [camp.SC04.confirmed, camp.SC04.confirmed_cash_inr], [7, 635000]);
  const cold = f.channel_groups.find((g) => g.group === "cold")!;
  const warm = f.channel_groups.find((g) => g.group === "warm")!;
  check("warm channels = 24/24 confirmed", warm.confirmed, 24);
  check("cold attempt share ≈ 87%", Math.round((cold.attempt_share ?? 0) * 100), 87);
  check("cold holds all 26 open opps / ₹14.40L", [cold.open_opportunities, cold.open_pipeline_inr], [26, 1440000]);
  check("decisions SC01 Kill, SC03 Pivot, SC06 Pivot, SC02/04/05 Scale",
    f.campaigns.map((c) => c.decision.label), ["Kill", "Scale", "Pivot", "Scale", "Scale", "Pivot"]);
  check("undefined threshold overrides keep defaults (API path)",
    computeSnapshot(s, "2025-04-20", { thresholds: { scaleMinConfirmed: undefined } as never }).campaigns.map((c) => c.decision.label), ["Kill", "Scale", "Pivot", "Scale", "Scale", "Pivot"]);
  check("cycle time avg/min/max = 10.2/5.0/13.1 days", [f.cycle_time.avg_days, f.cycle_time.min_days, f.cycle_time.max_days], [10.2, 5, 13.1]);
  const beardo = f.opportunities.filter((o) => o.brand_id === "A001").map((o) => [o.opportunity_id, o.stage, o.support_type, o.confirmed_value_inr || o.proposed_value_inr]);
  check("Beardo: O001 confirmed ₹2L cash, O002 lost ₹30k", beardo, [["O001", "partner_confirmed", "cash", 200000], ["O002", "lost", "cash", 30000]]);
  check("funnel researched/touched/qualified/opp brands/confirmed brands",
    f.funnel.map((x) => x.count).filter((_, i) => [0, 1, 4, 5].includes(i)), [180, 180, 60, 57]);

  // ---------- 3. Time travel: 2025-02-28
  const feb = computeSnapshot(s, "2025-02-28");
  check("Feb 28 target = Sponsor launch plan 40/20", [feb.target?.target_version, feb.kpis.qualified_goal, feb.kpis.confirmed_goal], ["Sponsor launch plan", 40, 20]);
  const cut = Date.parse("2025-02-28T23:59:59+05:30");
  const leakedOpps = feb.opportunities.filter((o) => Date.parse(o.last_update) > cut || Date.parse(o.created_at) > cut);
  check("Feb 28: zero March/April opportunity states leak", leakedOpps.length, 0);
  check("Feb 28: opps existing = 34", feb.kpis.total_opportunities, 34);
  check("Feb 28: qualified = 39", feb.kpis.qualified_brands, 39);
  check("Feb 28: confirmed = 8", feb.kpis.confirmed_partnerships, 8);
  const feb2 = computeSnapshot(s, "2025-02-28");
  check("snapshot is deterministic", JSON.stringify(feb2.kpis), JSON.stringify(feb.kpis));
  const jan = computeSnapshot(s, "2025-01-15");
  check("Jan 15: launch plan active, 0 confirmed", [jan.target?.target_version, jan.kpis.confirmed_partnerships], ["Sponsor launch plan", 0]);
  check("Mar 14 still launch plan; Mar 15 revised", [computeSnapshot(s, "2025-03-14").target?.target_version, computeSnapshot(s, "2025-03-15").target?.target_version], ["Sponsor launch plan", "Sponsor revised plan"]);

  // ---------- 4. Live recalculation (in-memory mutation, DB untouched)
  const mutated: DbState = structuredClone(s);
  mutated.oppHistory.push({
    history_id: "TEST1", opportunity_id: "O043", stage: "partner_confirmed", proposed_value_inr: 90000, confirmed_value_inr: 90000,
    support_type: null, owner_name: "Meera Iyer", effective_at: "2025-04-20T23:59:58+05:30", note: "test", source: "app", recorded_at: "2026-01-01T00:00:00+05:30",
  });
  mutated.payments.push({ payment_id: 1, opportunity_id: "O001", amount_inr: 200000, received_at: "2025-04-05T12:00:00+05:30", reference: "UTR-TEST" });
  const m = computeSnapshot(mutated, "2025-04-20");
  check("mutation: confirmed 24→25, cash ₹20L→₹20.9L", [m.kpis.confirmed_partnerships, m.kpis.confirmed_cash_inr], [25, 2090000]);
  check("mutation: negotiating 8→7", m.stages.find((x) => x.stage === "negotiating")?.count, 7);
  check("mutation: cash collected before fest = ₹2L", m.kpis.cash_collected_before_event_inr, 200000);
  check("mutation does not leak into Apr 19 snapshot", computeSnapshot(mutated, "2025-04-19").kpis.confirmed_partnerships, 24);

  // ---------- 5. Copilot tools are grounded in the same engine
  const tool = (await runTool("get_executive_summary", { as_of_date: "2025-04-20" }, s)) as { result: Record<string, unknown> };
  const kp = tool.result.kpis as Record<string, number>;
  check("tool get_executive_summary confirmed cash = 2000000", kp.confirmed_cash_inr, 2000000);
  const miss = (await runTool("check_data_availability", { topic: "CAC ad spend" }, s)) as { result: { available: boolean } };
  check("tool check_data_availability(CAC) → not available", miss.result.available, false);
  const riya = (await runTool("get_pipeline_diagnostics", { as_of_date: "2025-04-20", owner_name: "Riya Kapoor" }, s)) as {
    result: {
      negotiating_stalled_by_owner: { owner: string; proposed_value_inr: number; min_days_in_stage: number; max_days_in_stage: number }[];
      filtered_negotiating_stalled: { proposed_value_inr: number; min_days_in_stage: number; max_days_in_stage: number };
    };
  };
  const riyaRow = riya.result.negotiating_stalled_by_owner.find((o) => o.owner === "Riya Kapoor");
  check(
    "Riya stalled negotiating = ₹3,60,000 over 30–47 days",
    [
      riyaRow?.proposed_value_inr,
      riyaRow?.min_days_in_stage,
      riyaRow?.max_days_in_stage,
      riya.result.filtered_negotiating_stalled.proposed_value_inr,
      riya.result.filtered_negotiating_stalled.min_days_in_stage,
      riya.result.filtered_negotiating_stalled.max_days_in_stage,
    ],
    [360000, 30, 47, 360000, 30, 47],
  );
  const calc = (await runTool("calculate", { expression: "2000000 * 0.8 - 150000" }, s)) as { result: { value: number } };
  check("tool calculate", calc.result.value, 1450000);

  console.log(`\n${pass} passed, ${fail} failed`);
  await getPool().end();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
