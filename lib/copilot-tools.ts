/**
 * Deterministic backend tools exposed to Gemini via function calling.
 * The model never sees raw tables and never computes numbers itself: every figure in an
 * answer must come from one of these tool results (computed by lib/analytics.ts on live DB state).
 */
import { computeSnapshot, cutoffFor, ms, OPEN_STAGES } from "./analytics";
import { strategyPlan } from "./strategy-plan";
import type { DbState } from "./state";

export const DEFAULT_AS_OF = "2025-04-20";

// ------------------------------------------------------------------ tool declarations (JSON schema)
export const TOOL_DECLARATIONS = [
  {
    name: "get_executive_summary",
    description:
      "Headline KPIs at a snapshot date: funnel counts, active target version & goals, qualified brands, confirmed partnerships split cash vs in-kind, user-logged cash collected, open/stalled pipeline, gaps to target, cycle time and ranked automated diagnostics.",
    parametersJsonSchema: {
      type: "object",
      properties: { as_of_date: { type: "string", description: "Snapshot date YYYY-MM-DD (end of day IST)." } },
      required: ["as_of_date"],
    },
  },
  {
    name: "get_campaign_performance",
    description:
      "Per-campaign (SC01–SC06 plus any new bets) attempts, attempt share, brands touched, positive replies, meetings, qualified brands, opportunities, open pipeline, confirmed count & cash, win rate, assumed budget/spend, and Scale/Pivot/Kill decision with the threshold reason. Also warm vs cold channel group totals.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        as_of_date: { type: "string" },
        campaign_id: { type: "string", description: "Optional, e.g. SC01. Omit for all campaigns." },
      },
      required: ["as_of_date"],
    },
  },
  {
    name: "get_pipeline_diagnostics",
    description:
      "Open opportunities, stalled deals (proposal_sent/negotiating idle longer than threshold), owner workload, value at risk, and post-event open deals. Optional filters by stage or owner. negotiating_stalled_by_owner, negotiating_stalled_totals and filtered_negotiating_stalled are finished totals (proposed_value_inr, min_days_in_stage, max_days_in_stage). Copy them exactly; do not add the rows.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        as_of_date: { type: "string" },
        stage_filter: {
          type: "string",
          enum: ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"],
        },
        owner_name: { type: "string" },
        stalled_days_threshold: { type: "number", description: "Default 7." },
      },
      required: ["as_of_date"],
    },
  },
  {
    name: "get_brand_and_activations",
    description:
      "Look up one brand (fuzzy name or brand_id): industry, owner, qualification history, contacts, opportunities with stage history, outreach summary, and attendee-campaign activation links (observational only). Omit brand_name to list all activation links.",
    parametersJsonSchema: {
      type: "object",
      properties: { brand_name: { type: "string" }, as_of_date: { type: "string" } },
    },
  },
  {
    name: "compare_snapshots",
    description:
      "Compare two snapshot dates to explain what changed (KPIs, stage counts, per-campaign confirmed, target version). Use for trend / 'what drove the change' questions.",
    parametersJsonSchema: {
      type: "object",
      properties: { date_a: { type: "string" }, date_b: { type: "string" } },
      required: ["date_a", "date_b"],
    },
  },
  {
    name: "simulate_scenario",
    description:
      "Deterministic what-if math. Starts from sourced confirmed cash at the snapshot, applies an ASSUMED collection rate and an ASSUMED number of extra warm deals at the sourced average warm cash deal size, and reports gap to a cash target plus warm attempts needed at the historical warm conversion. Output is a projection, not a fact.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        as_of_date: { type: "string" },
        target_cash_inr: { type: "number" },
        assumed_collection_rate: { type: "number", description: "0–1, e.g. 0.85" },
        extra_warm_deals: { type: "number", description: "Additional warm cash deals assumed to close" },
      },
      required: ["target_cash_inr", "assumed_collection_rate"],
    },
  },
  {
    name: "list_tasks",
    description: "Current execution tasks (title, owner, status, priority, due date, linked campaign/opportunity, created_by).",
    parametersJsonSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["todo", "in_progress", "done"] } },
    },
  },
  {
    name: "check_data_availability",
    description:
      "Check whether a metric/field exists in the source dataset or app (e.g. CAC, ad spend, open rates, venue cost, bank receipts, attendee uplift, budgets). ALWAYS call before answering about any metric you have not seen in another tool result.",
    parametersJsonSchema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    },
  },
  {
    name: "calculate",
    description: "Evaluate an arithmetic expression exactly (+ - * / parentheses, decimals). Use for ANY arithmetic not already in a tool result.",
    parametersJsonSchema: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
  },
  {
    name: "propose_action_task",
    description:
      "Propose a task for the execution tracker. Does NOT write anything: it returns a pending card the user must confirm in the UI. Use after a diagnosis when the user asks for an action, or when you recommend one.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        owner_name: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
        due_date: { type: "string", description: "YYYY-MM-DD" },
        linked_opportunity_id: { type: "string" },
        linked_campaign_id: { type: "string" },
        rationale: { type: "string", description: "Data-backed reason, citing tool numbers." },
      },
      required: ["title", "description", "priority"],
    },
  },
] as const;

// ------------------------------------------------------------------ data catalogue for honesty checks
const AVAILABLE: { keys: string[]; what: string }[] = [
  { keys: ["brand", "industry", "owner"], what: "Brands (180) with industry, owner and created date." },
  { keys: ["contact", "job", "title", "person"], what: "Sponsor contacts (270) with job title, linked to brands." },
  { keys: ["campaign", "channel", "objective", "audience"], what: "6 sponsor acquisition campaigns with channel, objective, audience, owner and planned dates." },
  { keys: ["outreach", "reply", "replies", "response", "meeting", "opt", "interaction", "attempt", "touch", "delivered"], what: "Sponsor interactions: outreach_sent, delivered, replied (positive/neutral/not_interested/wrong_contact), meeting_booked/held, opt_out, introduction_received, web_inbound — with timestamps." },
  { keys: ["qualif", "dormant", "engaged", "unqualified"], what: "Brand qualification history (full-state versions with reasons)." },
  { keys: ["opportunit", "stage", "pipeline", "deal", "proposed", "confirmed", "negotiat", "lost", "win"], what: "58 opportunities with stage history, proposed and confirmed value (INR), support type cash/in_kind." },
  { keys: ["target", "goal"], what: "Targets: launch plan (40 qualified / 20 confirmed from 2025-01-15) and revised plan (55 / 28 from 2025-03-15)." },
  { keys: ["activation", "attendee campaign", "creator partners"], what: "3 sponsor activations linking confirmed opportunities to attendee campaigns (association only)." },
  { keys: ["cycle", "velocity", "days to close", "time to close"], what: "Derivable: days from opportunity creation to confirmation from stage history." },
  { keys: ["task", "action item"], what: "App-managed tasks (not source data)." },
];
const MISSING: { keys: string[]; why: string; proxy?: string }[] = [
  { keys: ["cac", "acquisition cost", "cost per acquisition", "cost per sponsor", "cost per deal"], why: "No spend or cost data exists in the source dataset, so CAC cannot be computed from sourced facts.", proxy: "The app holds team-entered planning budgets that are explicitly ASSUMPTIONS; cost-per-deal on those is illustrative only. Attempts per confirmed deal is a sourced effort proxy." },
  { keys: ["ad spend", "marketing spend", "spend", "budget", "cost"], why: "The source dataset has no marketing spend or budget table (the Event sheet names INR as currency only).", proxy: "Campaign budgets shown in the app are labelled assumptions entered by the team, editable on the Campaigns page." },
  { keys: ["open rate", "click", "ctr", "email open", "bounce"], why: "Interactions record sent/delivered/replied only — no opens or clicks.", proxy: "Reply rate and positive-reply rate per attempt are available." },
  { keys: ["venue", "stage cost", "production cost", "event cost"], why: "No venue or event cost fields exist in the sponsorship dataset." },
  { keys: ["bank", "receipt", "received", "collected", "in the bank", "paid", "payment", "invoice"], why: "Source confirmed_value_inr is a reported partnership value, not proof of bank receipt; the source has no payment records.", proxy: "Users can log payments in the app (Pipeline → opportunity → Log payment); cash_collected_inr is the sum of those user-logged receipts." },
  { keys: ["attendee", "footfall", "uplift", "increase attendance", "visitors", "causal", "impact"], why: "Sponsor activations only record that a sponsor was associated with an attendee campaign; there is no attendee count and no control group, so causal uplift cannot be established.", proxy: "You can state the association exists and when it was linked." },
  { keys: ["probability", "likelihood", "forecast"], why: "There is no deal probability field; any probability is an assumption." },
  { keys: ["satisfaction", "nps", "renewal", "retention"], why: "No sponsor satisfaction or renewal data." },
  { keys: ["revenue", "profit", "margin"], why: "Only reported sponsorship values exist — no festival P&L, revenue or margin." },
];

export function checkAvailability(topic: string) {
  const t = topic.toLowerCase();
  const missing = MISSING.filter((m) => m.keys.some((k) => t.includes(k)));
  const available = AVAILABLE.filter((a) => a.keys.some((k) => t.includes(k)));
  return {
    topic,
    available: missing.length === 0 && available.length > 0,
    not_in_dataset: missing.map((m) => ({ reason: m.why, closest_sourced_proxy: m.proxy ?? null })),
    related_available_data: available.map((a) => a.what),
    guidance:
      missing.length > 0
        ? "Say clearly that this is not in the data and do not fabricate a value. Offer the proxy if one exists."
        : available.length === 0
          ? "No matching field found. Treat as NOT available unless another tool returned it."
          : "Available — fetch numbers with the relevant tool.",
  };
}

// ------------------------------------------------------------------ safe calculator
export function calculate(expr: string): number {
  const src = expr.replace(/,/g, "").replace(/₹/g, "");
  let i = 0;
  const peek = () => src[i];
  const ws = () => {
    while (src[i] === " ") i++;
  };
  function num(): number {
    ws();
    if (peek() === "(") {
      i++;
      const v = add();
      ws();
      if (src[i++] !== ")") throw new Error("Missing )");
      return v;
    }
    if (peek() === "-") {
      i++;
      return -num();
    }
    const m = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (!m) throw new Error(`Unexpected token at ${i}: "${src.slice(i, i + 8)}"`);
    i += m[0].length;
    ws();
    if (peek() === "%") {
      i++;
      return Number(m[0]) / 100;
    }
    return Number(m[0]);
  }
  function mul(): number {
    let v = num();
    for (;;) {
      ws();
      if (peek() === "*") {
        i++;
        v *= num();
      } else if (peek() === "/") {
        i++;
        const d = num();
        if (d === 0) throw new Error("Division by zero");
        v /= d;
      } else return v;
    }
  }
  function add(): number {
    let v = mul();
    for (;;) {
      ws();
      if (peek() === "+") {
        i++;
        v += mul();
      } else if (peek() === "-") {
        i++;
        v -= mul();
      } else return v;
    }
  }
  const v = add();
  ws();
  if (i < src.length) throw new Error(`Unexpected trailing input: "${src.slice(i)}"`);
  return Math.round(v * 1e6) / 1e6;
}

// ------------------------------------------------------------------ executor
export interface PendingAction {
  kind: "create_task";
  title: string;
  description: string;
  owner_name: string | null;
  priority: string;
  due_date: string | null;
  linked_opportunity_id: string | null;
  linked_campaign_id: string | null;
  rationale: string | null;
}
export interface ToolOutput {
  result: unknown;
  pending_action?: PendingAction;
}

const lakh = (x: number) => `₹${(x / 100000).toFixed(2)}L`;

function validDate(d: unknown, fallback: string) {
  const v = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback;
  cutoffFor(v);
  return v;
}

export async function runTool(name: string, args: Record<string, unknown>, state: DbState, defaultAsOf = DEFAULT_AS_OF): Promise<ToolOutput> {
  const asOf = validDate(args.as_of_date, defaultAsOf);
  const range = { min: state.event.history_start, max: state.event.history_end };
  const outOfRange = asOf < range.min || asOf > range.max
    ? `Note: ${asOf} is outside the source history window ${range.min}..${range.max}; only app-entered changes can differ from the boundary snapshot.`
    : undefined;

  switch (name) {
    case "get_executive_summary": {
      const s = computeSnapshot(state, asOf);
      return {
        result: {
          as_of: s.as_of,
          cutoff: s.cutoff,
          phase: s.phase,
          days_to_event: s.kpis.days_to_event,
          event: { name: s.event.event_name, starts: s.event.event_starts_at, ends: s.event.event_ends_at },
          target: s.target,
          kpis: s.kpis,
          gaps: s.gaps,
          qualification_mix: s.qualification_mix,
          stages: s.stages,
          funnel: s.funnel.map((f) => ({ stage: f.label, brands: f.count, note: f.note, conv_from_prev: f.conv_from_prev })),
          cycle_time_days: s.cycle_time,
          diagnostics: s.diagnostics,
          cash_position: {
            reported_confirmed_cash_inr: s.kpis.confirmed_cash_inr,
            reported_in_kind_inr: s.kpis.confirmed_in_kind_inr,
            signed_partnerships: s.kpis.confirmed_partnerships,
            signed_cash_deals: s.kpis.confirmed_cash_count,
            cash_collected_inr: s.kpis.cash_collected_inr,
            outstanding_confirmed_cash_inr: s.opportunities
              .filter((o) => o.stage === "partner_confirmed" && o.support_type === "cash")
              .reduce((a, o) => a + Math.max(0, o.confirmed_value_inr - o.cash_collected_inr), 0),
            partial_payments: s.opportunities
              .filter((o) => o.stage === "partner_confirmed" && o.support_type === "cash" && o.cash_collected_inr > 0 && o.cash_collected_inr < o.confirmed_value_inr)
              .map((o) => ({
                id: o.opportunity_id,
                brand: o.brand_name,
                confirmed_inr: o.confirmed_value_inr,
                collected_inr: o.cash_collected_inr,
                outstanding_inr: o.confirmed_value_inr - o.cash_collected_inr,
              })),
            copy_exactly: "Quote these integers. Do not subtract or add them yourself.",
          },
          next_edition_plan: strategyPlan(),
          labels: {
            confirmed_cash_inr: "Reported confirmed value (source) — NOT bank receipt",
            cash_collected_inr: "Sum of payments logged by users in the app (source has no receipts)",
            outstanding_confirmed_cash_inr: "Signed cash still not logged as received. Finished total.",
            next_edition_plan: "Assumption. collected_inr is the deck target. Do not add collection_uplift on top of it.",
          },
          data_hygiene: `${s.hygiene.duplicates_removed} exact duplicate source rows removed on ingest`,
          note: outOfRange,
        },
      };
    }
    case "get_campaign_performance": {
      const s = computeSnapshot(state, asOf);
      const id = typeof args.campaign_id === "string" ? args.campaign_id.toUpperCase() : null;
      const cs = id ? s.campaigns.filter((c) => c.sponsor_campaign_id === id) : s.campaigns;
      return {
        result: {
          as_of: asOf,
          campaigns: cs,
          channel_groups: s.channel_groups,
          thresholds: s.thresholds,
          budget_note: "budget_inr / spent_inr are team-entered ASSUMPTIONS (not in source dataset).",
          attribution_note: "Campaign association is observational (originating campaign at opportunity creation); it does not prove the campaign caused the deal.",
          note: outOfRange,
        },
      };
    }
    case "get_pipeline_diagnostics": {
      const stalledDays = typeof args.stalled_days_threshold === "number" ? args.stalled_days_threshold : 7;
      const s = computeSnapshot(state, asOf, { stalledDays });
      let opps = s.opportunities;
      if (typeof args.stage_filter === "string") opps = opps.filter((o) => o.stage === args.stage_filter);
      if (typeof args.owner_name === "string") {
        const o = (args.owner_name as string).toLowerCase();
        opps = opps.filter((x) => (x.owner_name ?? "").toLowerCase().includes(o));
      }
      const open = opps.filter((o) => (OPEN_STAGES as readonly string[]).includes(o.stage));
      const finished = (rows: { proposed_value_inr: number; days_in_stage: number }[]) => {
        const days = rows.map((r) => r.days_in_stage);
        return {
          count: rows.length,
          proposed_value_inr: rows.reduce((a, r) => a + r.proposed_value_inr, 0),
          min_days_in_stage: days.length ? Math.min(...days) : null,
          max_days_in_stage: days.length ? Math.max(...days) : null,
        };
      };
      const negotiatingStalled = s.stalled.filter((o) => o.stage === "negotiating");
      const byOwner = new Map<string, typeof negotiatingStalled>();
      for (const o of negotiatingStalled) {
        const owner = o.owner_name ?? "Unassigned";
        byOwner.set(owner, [...(byOwner.get(owner) ?? []), o]);
      }
      return {
        result: {
          as_of: asOf,
          phase: s.phase,
          stalled_days_threshold: stalledDays,
          filters: { stage: args.stage_filter ?? null, owner: args.owner_name ?? null },
          totals_are_final: "Copy proposed_value_inr, min_days_in_stage and max_days_in_stage from negotiating_stalled_by_owner and filtered_negotiating_stalled. Do not add the opportunity rows and do not state a different day range.",
          negotiating_stalled_totals: finished(negotiatingStalled),
          negotiating_stalled_by_owner: [...byOwner.entries()]
            .map(([owner, rows]) => ({ owner, ...finished(rows) }))
            .sort((a, b) => b.proposed_value_inr - a.proposed_value_inr),
          filtered_negotiating_stalled: finished(opps.filter((o) => o.is_stalled && o.stage === "negotiating")),
          matching_opportunities: opps.length,
          open_count: open.length,
          open_value_inr: open.reduce((a, o) => a + o.proposed_value_inr, 0),
          stalled: s.stalled,
          stalled_value_inr: s.kpis.stalled_value_inr,
          owner_workload: s.owners,
          opportunities: opps.slice(0, 60).map((o) => ({
            id: o.opportunity_id,
            brand: o.brand_name,
            stage: o.stage,
            support_type: o.support_type,
            proposed_inr: o.proposed_value_inr,
            confirmed_inr: o.confirmed_value_inr,
            cash_collected_inr: o.cash_collected_inr,
            outstanding_inr: o.stage === "partner_confirmed" && o.support_type === "cash" ? Math.max(0, o.confirmed_value_inr - o.cash_collected_inr) : null,
            payment_status:
              o.stage !== "partner_confirmed" || o.support_type !== "cash"
                ? null
                : o.cash_collected_inr <= 0
                  ? "unpaid"
                  : o.cash_collected_inr < o.confirmed_value_inr
                    ? "partial"
                    : "paid",
            owner: o.owner_name,
            campaign: o.campaign_name,
            days_in_stage: o.days_in_stage,
            stalled: o.is_stalled,
            open_after_event: o.post_event_open,
          })),
          avg_days_to_confirm_for_won_deals: s.cycle_time.avg_days,
          note: outOfRange,
        },
      };
    }
    case "get_brand_and_activations": {
      const cutoff = cutoffFor(asOf);
      const qn = typeof args.brand_name === "string" ? args.brand_name.trim().toLowerCase() : "";
      const allLinks = state.activations
        .filter((a) => ms(a.linked_at) <= cutoff)
        .map((a) => ({
          ...a,
          brand_name: state.brands.find((b) => b.brand_id === a.brand_id)?.brand_name,
          causal_caveat: "Association only — does not establish incremental attendee impact (no attendee counts or control group in this dataset).",
        }));
      if (!qn) return { result: { as_of: asOf, activations: allLinks } };
      const matches = state.brands.filter((b) => b.brand_name.toLowerCase() === qn || b.brand_id.toLowerCase() === qn);
      const fuzzy = matches.length ? matches : state.brands.filter((b) => b.brand_name.toLowerCase().includes(qn));
      if (fuzzy.length === 0) return { result: { found: false, message: `No brand matching "${args.brand_name}".` } };
      if (fuzzy.length > 1 && !matches.length)
        return { result: { found: false, ambiguous: true, candidates: fuzzy.slice(0, 15).map((b) => `${b.brand_name} (${b.brand_id})`) } };
      const b = fuzzy[0];
      const s = computeSnapshot(state, asOf);
      const ix = state.interactions.filter((i) => i.brand_id === b.brand_id && ms(i.occurred_at) <= cutoff);
      const evCount: Record<string, number> = {};
      for (const i of ix) evCount[`${i.event_type}${i.outcome ? `:${i.outcome}` : ""}`] = (evCount[`${i.event_type}${i.outcome ? `:${i.outcome}` : ""}`] ?? 0) + 1;
      return {
        result: {
          as_of: asOf,
          brand: b,
          qualification_history: state.qualification
            .filter((q) => q.brand_id === b.brand_id && ms(q.effective_at) <= cutoff)
            .sort((x, y) => ms(x.effective_at) - ms(y.effective_at)),
          contacts: state.contacts.filter((c) => c.brand_id === b.brand_id),
          opportunities: s.opportunities
            .filter((o) => o.brand_id === b.brand_id)
            .map((o) => ({
              ...o,
              history: state.oppHistory
                .filter((h) => h.opportunity_id === o.opportunity_id && ms(h.effective_at) <= cutoff)
                .sort((x, y) => ms(x.effective_at) - ms(y.effective_at))
                .map((h) => ({ stage: h.stage, proposed: h.proposed_value_inr, confirmed: h.confirmed_value_inr, at: h.effective_at, source: h.source })),
            })),
          interaction_summary: evCount,
          campaigns_touching: [...new Set(ix.map((i) => i.sponsor_campaign_id))],
          activations: allLinks.filter((a) => a.brand_id === b.brand_id),
        },
      };
    }
    case "compare_snapshots": {
      const a = validDate(args.date_a, state.event.history_start);
      const b = validDate(args.date_b, asOf);
      const A = computeSnapshot(state, a);
      const B = computeSnapshot(state, b);
      const keys = ["qualified_brands", "confirmed_partnerships", "confirmed_cash_inr", "confirmed_in_kind_inr", "open_opportunities", "open_pipeline_inr", "stalled_opportunities", "cash_collected_inr", "total_opportunities"] as const;
      return {
        result: {
          date_a: a,
          date_b: b,
          target_a: A.target?.target_version,
          target_b: B.target?.target_version,
          kpi_changes: Object.fromEntries(keys.map((k) => [k, { a: A.kpis[k], b: B.kpis[k], delta: B.kpis[k] - A.kpis[k] }])),
          stage_changes: B.stages.map((x) => ({ stage: x.stage, a: A.stages.find((y) => y.stage === x.stage)?.count ?? 0, b: x.count })),
          confirmed_by_campaign: B.campaigns.map((c) => ({
            campaign: `${c.sponsor_campaign_id} ${c.campaign_name}`,
            a: A.campaigns.find((x) => x.sponsor_campaign_id === c.sponsor_campaign_id)?.confirmed ?? 0,
            b: c.confirmed,
            attempts_a: A.campaigns.find((x) => x.sponsor_campaign_id === c.sponsor_campaign_id)?.attempts ?? 0,
            attempts_b: c.attempts,
          })),
        },
      };
    }
    case "simulate_scenario": {
      const s = computeSnapshot(state, asOf);
      const target = Number(args.target_cash_inr);
      const rate = Math.min(1, Math.max(0, Number(args.assumed_collection_rate)));
      const extra = Math.max(0, Math.round(Number(args.extra_warm_deals ?? 0)));
      if (!Number.isFinite(target) || target <= 0) return { result: { error: "target_cash_inr must be a positive number" } };
      const warm = s.campaigns.filter((c) => c.channel_group === "warm");
      const warmCashDeals = s.opportunities.filter((o) => o.channel_group === "warm" && o.stage === "partner_confirmed" && o.support_type === "cash");
      const avgWarmCash = warmCashDeals.length ? Math.round(warmCashDeals.reduce((a, o) => a + o.confirmed_value_inr, 0) / warmCashDeals.length) : 0;
      const warmAttempts = warm.reduce((a, c) => a + c.attempts, 0);
      const warmConfirmed = warm.reduce((a, c) => a + c.confirmed, 0);
      const attemptsPerWarmDeal = warmConfirmed ? warmAttempts / warmConfirmed : null;
      const baseCash = s.kpis.confirmed_cash_inr;
      const alreadyCollected = s.kpis.cash_collected_inr;
      const projected = Math.round(baseCash * rate + extra * avgWarmCash * rate);
      const gap = target - projected;
      const dealsNeeded = gap > 0 && avgWarmCash > 0 && rate > 0 ? Math.ceil(gap / (avgWarmCash * rate)) : 0;
      return {
        result: {
          label: "PROJECTION — combines sourced facts with user-supplied assumptions",
          sourced_inputs: {
            confirmed_cash_reported_inr: baseCash,
            cash_logged_as_collected_inr: alreadyCollected,
            avg_warm_confirmed_cash_deal_inr: avgWarmCash,
            warm_cash_deals_in_sample: warmCashDeals.length,
            warm_attempts: warmAttempts,
            warm_confirmed: warmConfirmed,
            avg_days_to_confirm: s.cycle_time.avg_days,
          },
          assumptions: { assumed_collection_rate: rate, extra_warm_deals: extra, target_cash_inr: target },
          math: `projected = ${baseCash} × ${rate} + ${extra} × ${avgWarmCash} × ${rate} = ${projected}`,
          projected_collectible_cash_inr: projected,
          gap_to_target_inr: gap,
          additional_warm_deals_needed: dealsNeeded,
          warm_attempts_needed_at_historical_rate: attemptsPerWarmDeal ? Math.ceil(dealsNeeded * attemptsPerWarmDeal) : null,
          readable: `Projected ${lakh(projected)} vs target ${lakh(target)} → ${gap > 0 ? `short ${lakh(gap)}; ~${dealsNeeded} more warm cash deals` : `exceeds by ${lakh(-gap)}`}.`,
          caveats: [
            "Collection rate is an assumption — the source has no payment records.",
            `Average warm deal size comes from only ${warmCashDeals.length} deals; small sample.`,
            `Deals take ~${s.cycle_time.avg_days} days to confirm, so timing vs the fest date matters.`,
          ],
        },
      };
    }
    case "list_tasks": {
      const st = typeof args.status === "string" ? args.status : null;
      const ts = state.tasks.filter((t) => !st || t.status === st);
      return { result: { count: ts.length, tasks: ts } };
    }
    case "check_data_availability":
      return { result: checkAvailability(String(args.topic ?? "")) };
    case "calculate": {
      try {
        return { result: { expression: args.expression, value: calculate(String(args.expression ?? "")) } };
      } catch (e) {
        return { result: { error: (e as Error).message } };
      }
    }
    case "propose_action_task": {
      const oppId = typeof args.linked_opportunity_id === "string" && args.linked_opportunity_id ? args.linked_opportunity_id.toUpperCase() : null;
      const campId = typeof args.linked_campaign_id === "string" && args.linked_campaign_id ? args.linked_campaign_id.toUpperCase() : null;
      const pending: PendingAction = {
        kind: "create_task",
        title: String(args.title ?? "").slice(0, 200),
        description: String(args.description ?? ""),
        owner_name: typeof args.owner_name === "string" ? args.owner_name : null,
        priority: ["low", "medium", "high", "critical"].includes(String(args.priority)) ? String(args.priority) : "medium",
        due_date: typeof args.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) ? args.due_date : null,
        linked_opportunity_id: oppId && state.opportunities.some((o) => o.opportunity_id === oppId) ? oppId : null,
        linked_campaign_id: campId && state.campaigns.some((c) => c.sponsor_campaign_id === campId) ? campId : null,
        rationale: typeof args.rationale === "string" ? args.rationale : null,
      };
      return {
        result: {
          status: "pending_user_confirmation",
          message: "A confirmation card is now shown to the user. Nothing has been written. Tell the user to review and click 'Confirm & create task'.",
          proposal: pending,
        },
        pending_action: pending,
      };
    }
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}
