/**
 * Pure, deterministic snapshot analytics. Every number on the dashboard, every copilot
 * tool result and every verification test goes through `computeSnapshot`.
 *
 * Snapshot rule (from the dataset's Read me):
 *   selected date D  ->  cutoff = D 23:59:59 Asia/Kolkata (+05:30)
 *   - event rows (interactions, payments, activations): include occurred_at <= cutoff
 *   - full-state histories (targets, qualification, opportunity stage): latest version
 *     per entity with effective_at <= cutoff. Never sum versions; never peek ahead.
 *   - static entities (brands, contacts, opportunities): exist once created_at <= cutoff
 */
import type { DbState, OppHistRow, QualRow, TargetRow } from "./state";

export const OPEN_STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating"] as const;
export const STAGE_ORDER = [
  "prospecting",
  "contacted",
  "proposal_sent",
  "negotiating",
  "partner_confirmed",
  "lost",
  "withdrawn",
] as const;
export const STALL_STAGES = ["proposal_sent", "negotiating"];
export const WARM_CHANNELS = ["introduction", "web_inbound"];
export const COLD_CHANNELS = ["email", "linkedin"];
const ROOT_TOUCH = ["outreach_sent", "introduction_received", "web_inbound"];
const DAY = 86_400_000;

export interface DecisionThresholds {
  scaleMinConfirmed: number; // Scale if >= this many confirmed AND win rate >= scaleMinWinRate
  scaleMinWinRate: number;
  killMinAttempts: number; // Kill if >= attempts, 0 confirmed and meeting rate below killMaxMeetingRate
  killMaxMeetingRate: number;
  pivotMinAttempts: number; // Pivot if >= attempts and 0 confirmed (but not kill)
}
export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  scaleMinConfirmed: 3,
  scaleMinWinRate: 0.5,
  killMinAttempts: 40,
  killMaxMeetingRate: 0.15,
  pivotMinAttempts: 20,
};

export interface SnapshotOptions {
  stalledDays?: number;
  thresholds?: Partial<DecisionThresholds>;
  includeSeries?: boolean;
}

export const ms = (iso: string) => Date.parse(iso);
export function cutoffFor(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`as_of_date must be YYYY-MM-DD, got "${asOf}"`);
  const t = Date.parse(`${asOf}T23:59:59+05:30`);
  if (!Number.isFinite(t)) throw new Error(`as_of_date is not a real calendar date: "${asOf}"`);
  return t;
}
export function istDate(t: number) {
  return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);
}
const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? a / b : null);

/** Latest version per key with effective_at <= cutoff. */
function latestBy<T extends { effective_at: string }>(rows: T[], key: (r: T) => string, cutoff: number) {
  const out = new Map<string, T>();
  for (const r of rows) {
    const t = ms(r.effective_at);
    if (t > cutoff) continue;
    const k = key(r);
    const cur = out.get(k);
    // tie-break on recorded_at/history id so same-timestamp app edits resolve deterministically
    if (
      !cur ||
      t > ms(cur.effective_at) ||
      (t === ms(cur.effective_at) && tieKey(r) > tieKey(cur))
    )
      out.set(k, r);
  }
  return out;
}
function tieKey(r: object) {
  const x = r as Partial<OppHistRow & QualRow>;
  return `${x.recorded_at ?? ""}|${x.history_id ?? ""}`;
}

export function activeTarget(targets: TargetRow[], cutoff: number): TargetRow | null {
  return latestBy(targets, () => "t", cutoff).get("t") ?? null;
}

export interface OppView {
  opportunity_id: string;
  opportunity_name: string;
  brand_id: string;
  brand_name: string;
  industry: string;
  campaign_id: string | null;
  campaign_name: string | null;
  channel_group: "warm" | "cold" | "other";
  support_type: "cash" | "in_kind";
  stage: string;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  cash_collected_inr: number;
  owner_name: string | null;
  created_at: string;
  stage_since: string;
  days_in_stage: number;
  last_update: string;
  is_open: boolean;
  is_stalled: boolean;
  post_event_open: boolean;
  version_count: number;
  source: string;
}

function groupOfChannel(ch: string | null | undefined): "warm" | "cold" | "other" {
  if (!ch) return "other";
  if (WARM_CHANNELS.includes(ch)) return "warm";
  if (COLD_CHANNELS.includes(ch)) return "cold";
  return "other";
}

export function computeSnapshot(state: DbState, asOf: string, opts: SnapshotOptions = {}) {
  const cutoff = cutoffFor(asOf);
  const stalledDays = opts.stalledDays ?? 7;
  const th: DecisionThresholds = { ...DEFAULT_THRESHOLDS };
  for (const [k, v] of Object.entries(opts.thresholds ?? {}))
    if (typeof v === "number" && Number.isFinite(v)) th[k as keyof DecisionThresholds] = v;
  const ev = state.event;
  const eventStart = ms(ev.event_starts_at);
  const eventEnd = ms(ev.event_ends_at);
  const phase = cutoff < eventStart ? "pre_event" : cutoff <= eventEnd + DAY ? "event_window" : "post_event";

  const brandById = new Map(state.brands.map((b) => [b.brand_id, b]));
  const campById = new Map(state.campaigns.map((c) => [c.sponsor_campaign_id, c]));

  // ---- static populations as of cutoff
  const brands = state.brands.filter((b) => ms(b.created_at) <= cutoff);
  const opps = state.opportunities.filter((o) => ms(o.created_at) <= cutoff);
  const interactions = state.interactions.filter((i) => ms(i.occurred_at) <= cutoff);
  const payments = state.payments.filter((p) => ms(p.received_at) <= cutoff);
  const activations = state.activations.filter((a) => ms(a.linked_at) <= cutoff);
  const target = activeTarget(state.targets, cutoff);

  // ---- latest qualification per brand
  const latestQual = latestBy(state.qualification, (r) => r.brand_id, cutoff);
  const qualificationMix: Record<string, number> = {
    qualified: 0,
    engaged: 0,
    dormant: 0,
    unqualified: 0,
    unreviewed: 0,
  };
  for (const r of latestQual.values()) qualificationMix[r.qualification_status] = (qualificationMix[r.qualification_status] ?? 0) + 1;
  const qualifiedBrandIds = new Set([...latestQual.values()].filter((r) => r.qualification_status === "qualified").map((r) => r.brand_id));

  // ---- latest opportunity version per opp (only for opps that exist by cutoff)
  const oppIds = new Set(opps.map((o) => o.opportunity_id));
  const histByOpp = new Map<string, OppHistRow[]>();
  for (const h of state.oppHistory) {
    if (!oppIds.has(h.opportunity_id) || ms(h.effective_at) > cutoff) continue;
    const arr = histByOpp.get(h.opportunity_id) ?? [];
    arr.push(h);
    histByOpp.set(h.opportunity_id, arr);
  }
  const cashByOpp = new Map<string, number>();
  const cashBeforeEventByOpp = new Map<string, number>();
  for (const p of payments) {
    cashByOpp.set(p.opportunity_id, (cashByOpp.get(p.opportunity_id) ?? 0) + p.amount_inr);
    if (ms(p.received_at) < eventStart)
      cashBeforeEventByOpp.set(p.opportunity_id, (cashBeforeEventByOpp.get(p.opportunity_id) ?? 0) + p.amount_inr);
  }

  const oppViews: OppView[] = [];
  for (const o of opps) {
    const hist = (histByOpp.get(o.opportunity_id) ?? []).sort(
      (a, b) => ms(a.effective_at) - ms(b.effective_at) || tieKey(a).localeCompare(tieKey(b)),
    );
    if (!hist.length) continue; // opportunity exists but has no state yet at this cutoff
    const cur = hist[hist.length - 1];
    let since = cur.effective_at;
    for (let i = hist.length - 1; i >= 0 && hist[i].stage === cur.stage; i--) since = hist[i].effective_at;
    let support: "cash" | "in_kind" = o.support_type;
    for (const h of hist) if (h.support_type) support = h.support_type;
    const camp = o.sponsor_campaign_id ? campById.get(o.sponsor_campaign_id) : undefined;
    const brand = brandById.get(o.brand_id);
    const isOpen = (OPEN_STAGES as readonly string[]).includes(cur.stage);
    const daysInStage = Math.max(0, Math.floor((cutoff - ms(since)) / DAY));
    oppViews.push({
      opportunity_id: o.opportunity_id,
      opportunity_name: o.opportunity_name,
      brand_id: o.brand_id,
      brand_name: brand?.brand_name ?? o.brand_id,
      industry: brand?.industry ?? "Unknown",
      campaign_id: o.sponsor_campaign_id,
      campaign_name: camp?.campaign_name ?? null,
      channel_group: groupOfChannel(camp?.channel),
      support_type: support,
      stage: cur.stage,
      proposed_value_inr: cur.proposed_value_inr,
      confirmed_value_inr: cur.stage === "partner_confirmed" ? cur.confirmed_value_inr : 0,
      cash_collected_inr: cashByOpp.get(o.opportunity_id) ?? 0,
      owner_name: cur.owner_name,
      created_at: o.created_at,
      stage_since: since,
      days_in_stage: daysInStage,
      last_update: cur.effective_at,
      is_open: isOpen,
      is_stalled: isOpen && STALL_STAGES.includes(cur.stage) && daysInStage > stalledDays,
      post_event_open: isOpen && cutoff > eventEnd,
      version_count: hist.length,
      source: o.source,
    });
  }
  oppViews.sort((a, b) => a.opportunity_id.localeCompare(b.opportunity_id, undefined, { numeric: true }));

  // ---- stages
  const stages = STAGE_ORDER.map((stage) => {
    const xs = oppViews.filter((o) => o.stage === stage);
    return {
      stage,
      count: xs.length,
      proposed_value_inr: xs.reduce((a, o) => a + o.proposed_value_inr, 0),
      confirmed_value_inr: xs.reduce((a, o) => a + o.confirmed_value_inr, 0),
    };
  });
  const confirmed = oppViews.filter((o) => o.stage === "partner_confirmed");
  const confirmedCash = confirmed.filter((o) => o.support_type === "cash");
  const confirmedInKind = confirmed.filter((o) => o.support_type === "in_kind");
  const open = oppViews.filter((o) => o.is_open);
  const stalled = oppViews.filter((o) => o.is_stalled).sort((a, b) => b.days_in_stage - a.days_in_stage);
  const sum = (xs: OppView[], f: (o: OppView) => number) => xs.reduce((a, o) => a + f(o), 0);

  const cashCollected = payments.reduce((a, p) => a + p.amount_inr, 0);
  const cashCollectedBeforeEvent = payments.filter((p) => ms(p.received_at) < eventStart).reduce((a, p) => a + p.amount_inr, 0);

  // ---- funnel (brand-level populations; not strictly nested — see README)
  const touched = new Set(interactions.filter((i) => ROOT_TOUCH.includes(i.event_type)).map((i) => i.brand_id));
  const positive = new Set(
    interactions.filter((i) => i.event_type === "replied" && i.outcome === "positive").map((i) => i.brand_id),
  );
  const meetings = new Set(
    interactions.filter((i) => i.event_type === "meeting_held" && i.outcome === "attended").map((i) => i.brand_id),
  );
  const oppBrands = new Set(oppViews.map((o) => o.brand_id));
  const confirmedBrands = new Set(confirmed.map((o) => o.brand_id));
  const funnelRaw = [
    { key: "researched", label: "Brands researched", count: brands.length, note: "Brand records created" },
    { key: "touched", label: "Brands touched", count: touched.size, note: "Outreach, intro or inbound received" },
    { key: "positive", label: "Positive reply", count: positive.size, note: "≥1 reply classified positive" },
    { key: "meeting", label: "Meeting held", count: meetings.size, note: "Meeting attended" },
    { key: "qualified", label: "Qualified", count: qualifiedBrandIds.size, note: "Latest qualification = qualified" },
    {
      key: "opportunity",
      label: "Has opportunity",
      count: oppBrands.size,
      note: `${oppViews.length} opportunities across ${oppBrands.size} brands`,
    },
    {
      key: "confirmed",
      label: "Confirmed partner",
      count: confirmedBrands.size,
      note: `${confirmed.length} confirmed opportunities`,
    },
  ];
  const funnel = funnelRaw.map((f, i) => ({
    ...f,
    conv_from_prev: i === 0 ? null : pct(f.count, funnelRaw[i - 1].count),
    conv_from_top: pct(f.count, funnelRaw[0].count),
  }));

  // ---- attempts & campaign metrics
  const totalAttempts = new Set(interactions.filter((i) => ROOT_TOUCH.includes(i.event_type)).map((i) => i.attempt_id)).size;
  const campaigns = state.campaigns.map((c) => {
    const ix = interactions.filter((i) => i.sponsor_campaign_id === c.sponsor_campaign_id);
    const roots = ix.filter((i) => ROOT_TOUCH.includes(i.event_type));
    const attempts = new Set(roots.map((i) => i.attempt_id)).size;
    const brandsTouched = new Set(roots.map((i) => i.brand_id)).size;
    const replies = ix.filter((i) => i.event_type === "replied").length;
    const posBrands = new Set(ix.filter((i) => i.event_type === "replied" && i.outcome === "positive").map((i) => i.brand_id)).size;
    const mtgBrands = new Set(ix.filter((i) => i.event_type === "meeting_held").map((i) => i.brand_id)).size;
    const optOuts = ix.filter((i) => i.event_type === "opt_out").length;
    const qualified = [...latestQual.values()].filter(
      (r) => r.qualification_status === "qualified" && r.sponsor_campaign_id === c.sponsor_campaign_id,
    ).length;
    const co = oppViews.filter((o) => o.campaign_id === c.sponsor_campaign_id);
    const cConf = co.filter((o) => o.stage === "partner_confirmed");
    const cOpen = co.filter((o) => o.is_open);
    const cLost = co.filter((o) => o.stage === "lost" || o.stage === "withdrawn");
    const closed = cConf.length + cLost.length;
    const confirmedCashInr = sum(cConf.filter((o) => o.support_type === "cash"), (o) => o.confirmed_value_inr);
    const confirmedInKindInr = sum(cConf.filter((o) => o.support_type === "in_kind"), (o) => o.confirmed_value_inr);
    const meetingRate = pct(mtgBrands, brandsTouched);
    const winRate = pct(cConf.length, co.length);

    let decision: { label: "Scale" | "Pivot" | "Kill" | "Test"; reason: string };
    if (cConf.length >= th.scaleMinConfirmed && (winRate ?? 0) >= th.scaleMinWinRate)
      decision = {
        label: "Scale",
        reason: `${cConf.length} confirmed, ${Math.round((winRate ?? 0) * 100)}% opp→confirmed (≥${th.scaleMinConfirmed} & ≥${Math.round(
          th.scaleMinWinRate * 100,
        )}%)`,
      };
    else if (attempts >= th.killMinAttempts && cConf.length === 0 && (meetingRate ?? 0) < th.killMaxMeetingRate)
      decision = {
        label: "Kill",
        reason: `${attempts} attempts, 0 confirmed, ${Math.round((meetingRate ?? 0) * 100)}% of touched brands reached a meeting (<${Math.round(
          th.killMaxMeetingRate * 100,
        )}%)`,
      };
    else if (attempts >= th.pivotMinAttempts && cConf.length === 0)
      decision = {
        label: "Pivot",
        reason: `${attempts} attempts and ${co.length} opps but 0 confirmed; meetings happen (${Math.round(
          (meetingRate ?? 0) * 100,
        )}%) yet deals stall — change the close motion`,
      };
    else decision = { label: "Test", reason: `Not enough evidence yet (${attempts} attempts, ${cConf.length} confirmed)` };

    const spent = c.spent_inr ?? 0;
    return {
      sponsor_campaign_id: c.sponsor_campaign_id,
      campaign_name: c.campaign_name,
      channel: c.channel,
      channel_group: groupOfChannel(c.channel),
      owner_name: c.owner_name,
      source: c.source,
      status: c.status,
      objective: c.objective,
      hypothesis: c.hypothesis,
      target_contribution_inr: c.target_contribution_inr,
      attempts,
      attempt_share: pct(attempts, totalAttempts),
      brands_touched: brandsTouched,
      replies,
      positive_reply_brands: posBrands,
      meeting_brands: mtgBrands,
      meeting_rate: meetingRate,
      opt_outs: optOuts,
      qualified_brands: qualified,
      opportunities: co.length,
      open_opportunities: cOpen.length,
      open_pipeline_inr: sum(cOpen, (o) => o.proposed_value_inr),
      confirmed: cConf.length,
      confirmed_cash_inr: confirmedCashInr,
      confirmed_in_kind_inr: confirmedInKindInr,
      lost_or_withdrawn: cLost.length,
      win_rate: winRate,
      close_rate_of_closed: pct(cConf.length, closed),
      attempts_per_confirmed: cConf.length ? round1(attempts / cConf.length) : null,
      budget_inr: c.budget_inr,
      spent_inr: c.spent_inr,
      budget_basis: c.budget_basis,
      cost_per_confirmed_inr: cConf.length && spent ? Math.round(spent / cConf.length) : null,
      cash_per_rupee_spent: spent ? round1(confirmedCashInr / spent) : null,
      decision,
    };
  });

  const groupSummary = (["warm", "cold"] as const).map((g) => {
    const cs = campaigns.filter((c) => c.channel_group === g);
    const s = <K extends keyof (typeof cs)[number]>(k: K) => cs.reduce((a, c) => a + (Number(c[k]) || 0), 0);
    return {
      group: g,
      campaigns: cs.map((c) => c.sponsor_campaign_id),
      attempts: s("attempts"),
      attempt_share: pct(s("attempts"), totalAttempts),
      opportunities: s("opportunities"),
      open_opportunities: s("open_opportunities"),
      open_pipeline_inr: s("open_pipeline_inr"),
      confirmed: s("confirmed"),
      confirmed_share: pct(s("confirmed"), confirmed.length),
      confirmed_cash_inr: s("confirmed_cash_inr"),
      confirmed_in_kind_inr: s("confirmed_in_kind_inr"),
      spent_inr: s("spent_inr"),
    };
  });

  // ---- industries
  const industries = [...new Set(state.brands.map((b) => b.industry))].sort().map((ind) => {
    const bs = brands.filter((b) => b.industry === ind);
    const os = oppViews.filter((o) => o.industry === ind);
    const cs = os.filter((o) => o.stage === "partner_confirmed");
    return {
      industry: ind,
      brands: bs.length,
      qualified: bs.filter((b) => qualifiedBrandIds.has(b.brand_id)).length,
      opportunities: os.length,
      confirmed: cs.length,
      confirmed_inr: sum(cs, (o) => o.confirmed_value_inr),
      confirmed_cash_inr: sum(cs.filter((o) => o.support_type === "cash"), (o) => o.confirmed_value_inr),
      open_pipeline_inr: sum(os.filter((o) => o.is_open), (o) => o.proposed_value_inr),
    };
  });

  // ---- owners
  const owners = [...new Set(oppViews.map((o) => o.owner_name ?? "Unassigned"))].sort().map((name) => {
    const os = oppViews.filter((o) => (o.owner_name ?? "Unassigned") === name);
    return {
      owner_name: name,
      open: os.filter((o) => o.is_open).length,
      open_pipeline_inr: sum(os.filter((o) => o.is_open), (o) => o.proposed_value_inr),
      stalled: os.filter((o) => o.is_stalled).length,
      stalled_inr: sum(os.filter((o) => o.is_stalled), (o) => o.proposed_value_inr),
      confirmed: os.filter((o) => o.stage === "partner_confirmed").length,
      confirmed_inr: sum(os.filter((o) => o.stage === "partner_confirmed"), (o) => o.confirmed_value_inr),
    };
  });

  // ---- cycle time: opportunity created -> first partner_confirmed version (<= cutoff)
  const cycles: number[] = [];
  for (const o of confirmed) {
    const first = (histByOpp.get(o.opportunity_id) ?? [])
      .filter((h) => h.stage === "partner_confirmed")
      .sort((a, b) => ms(a.effective_at) - ms(b.effective_at))[0];
    if (first) cycles.push((ms(first.effective_at) - ms(o.created_at)) / DAY);
  }
  const cycleTime = cycles.length
    ? {
        avg_days: round1(cycles.reduce((a, b) => a + b, 0) / cycles.length),
        min_days: round1(Math.min(...cycles)),
        max_days: round1(Math.max(...cycles)),
        n: cycles.length,
      }
    : { avg_days: null, min_days: null, max_days: null, n: 0 };

  const qualifiedNoOpp = [...qualifiedBrandIds].filter((b) => !oppBrands.has(b)).length;
  const lastStageChange = state.oppHistory
    .filter((h) => ms(h.effective_at) <= cutoff)
    .reduce((a, h) => Math.max(a, ms(h.effective_at)), 0);

  const kpis = {
    qualified_brands: qualifiedBrandIds.size,
    qualified_goal: target?.qualified_brands_goal ?? null,
    confirmed_partnerships: confirmed.length,
    confirmed_goal: target?.confirmed_partnerships_goal ?? null,
    confirmed_brands: confirmedBrands.size,
    confirmed_cash_inr: sum(confirmedCash, (o) => o.confirmed_value_inr),
    confirmed_cash_count: confirmedCash.length,
    confirmed_in_kind_inr: sum(confirmedInKind, (o) => o.confirmed_value_inr),
    confirmed_in_kind_count: confirmedInKind.length,
    confirmed_total_inr: sum(confirmed, (o) => o.confirmed_value_inr),
    cash_collected_inr: cashCollected,
    cash_collected_before_event_inr: cashCollectedBeforeEvent,
    cash_uncollected_inr: Math.max(0, sum(confirmedCash, (o) => o.confirmed_value_inr) - cashCollected),
    open_opportunities: open.length,
    open_pipeline_inr: sum(open, (o) => o.proposed_value_inr),
    stalled_opportunities: stalled.length,
    stalled_value_inr: sum(stalled, (o) => o.proposed_value_inr),
    lost_inr: sum(oppViews.filter((o) => o.stage === "lost"), (o) => o.proposed_value_inr),
    total_opportunities: oppViews.length,
    total_attempts: totalAttempts,
    avg_confirmed_deal_inr: confirmed.length ? Math.round(sum(confirmed, (o) => o.confirmed_value_inr) / confirmed.length) : null,
    avg_confirmed_cash_deal_inr: confirmedCash.length
      ? Math.round(sum(confirmedCash, (o) => o.confirmed_value_inr) / confirmedCash.length)
      : null,
    qualified_brands_without_opportunity: qualifiedNoOpp,
    days_to_event: Math.ceil((eventStart - cutoff) / DAY),
    last_stage_change_at: lastStageChange ? istDate(lastStageChange) : null,
  };
  const gaps = {
    qualified_gap: kpis.qualified_goal === null ? null : kpis.qualified_goal - kpis.qualified_brands,
    confirmed_gap: kpis.confirmed_goal === null ? null : kpis.confirmed_goal - kpis.confirmed_partnerships,
  };

  // ---- automated diagnostics (ranked)
  type Diag = { id: string; severity: "critical" | "warning" | "ok"; title: string; detail: string };
  const diags: Diag[] = [];
  const warm = groupSummary[0];
  const cold = groupSummary[1];
  if (cold.attempts > 0 && (cold.attempt_share ?? 0) >= 0.5 && cold.confirmed === 0)
    diags.push({
      id: "channel_mix",
      severity: "critical",
      title: `Cold outbound used ${Math.round((cold.attempt_share ?? 0) * 100)}% of attempts and closed 0 deals`,
      detail: `Email/LinkedIn: ${cold.attempts} attempts → ${cold.opportunities} opps → 0 confirmed, holding ${cold.open_opportunities} open opps (₹${fmtL(
        cold.open_pipeline_inr,
      )}). Warm/inbound: ${warm.attempts} attempts → ${warm.confirmed} of ${confirmed.length} confirmed deals.`,
    });
  const neg = stalled.filter((o) => o.stage === "negotiating");
  if (stalled.length)
    diags.push({
      id: "stalled",
      severity: stalled.length >= 5 ? "critical" : "warning",
      title: `${stalled.length} deals stuck in proposal/negotiation > ${stalledDays} days (₹${fmtL(sum(stalled, (o) => o.proposed_value_inr))})`,
      detail: `${neg.length} negotiating worth ₹${fmtL(sum(neg, (o) => o.proposed_value_inr))}; oldest idle ${stalled[0].days_in_stage} days (${stalled[0].brand_name}). Avg time to confirm for won deals is ${
        cycleTime.avg_days ?? "n/a"
      } days, so these are well past the normal window.`,
    });
  if (phase === "post_event" && open.length)
    diags.push({
      id: "post_event",
      severity: "critical",
      title: `Festival is over but ${open.length} opportunities (₹${fmtL(kpis.open_pipeline_inr)}) are still marked open`,
      detail: `No stage change since ${kpis.last_stage_change_at}. This is not collectible pipeline for CampusFest 2025 — close as lost or roll into next year's list.`,
    });
  if (kpis.confirmed_cash_inr > 0 && kpis.cash_collected_inr < kpis.confirmed_cash_inr)
    diags.push({
      id: "collection",
      severity: kpis.cash_collected_inr === 0 ? "critical" : "warning",
      title: `₹${fmtL(kpis.cash_collected_inr)} of ₹${fmtL(kpis.confirmed_cash_inr)} confirmed cash is logged as received`,
      detail:
        "Source confirmed values are reported deal values, not bank receipts. Log payments on each confirmed opportunity to track real cash before the fest.",
    });
  if (gaps.confirmed_gap !== null && gaps.confirmed_gap > 0)
    diags.push({
      id: "target_confirmed",
      severity: phase === "pre_event" ? "warning" : "critical",
      title: `${gaps.confirmed_gap} confirmed partnership${gaps.confirmed_gap === 1 ? "" : "s"} short of target (${kpis.confirmed_partnerships}/${kpis.confirmed_goal}, ${target?.target_version})`,
      detail:
        phase === "pre_event"
          ? `${kpis.days_to_event} days to the fest. With a ${cycleTime.avg_days ?? "?"}-day average close cycle, only deals already in late stages can still land.`
          : "Target window has closed.",
    });
  if (gaps.qualified_gap !== null && gaps.qualified_gap <= 0)
    diags.push({
      id: "target_qualified",
      severity: "ok",
      title: `Qualified brands target met (${kpis.qualified_brands}/${kpis.qualified_goal})`,
      detail: `${qualifiedNoOpp} qualified brands have no opportunity yet — top-of-funnel is not the constraint; conversion is.`,
    });
  else if (gaps.qualified_gap !== null)
    diags.push({
      id: "target_qualified",
      severity: "warning",
      title: `${gaps.qualified_gap} qualified brand${gaps.qualified_gap === 1 ? "" : "s"} short of target (${kpis.qualified_brands}/${kpis.qualified_goal})`,
      detail: `Latest qualification states: ${Object.entries(qualificationMix)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")}.`,
    });
  const order = { critical: 0, warning: 1, ok: 2 };
  diags.sort((a, b) => order[a.severity] - order[b.severity]);

  const snapshot = {
    as_of: asOf,
    cutoff: `${asOf}T23:59:59+05:30`,
    phase,
    event: ev,
    target,
    targets_all: state.targets,
    kpis,
    gaps,
    qualification_mix: qualificationMix,
    stages,
    funnel,
    campaigns,
    channel_groups: groupSummary,
    industries,
    owners,
    opportunities: oppViews,
    stalled: stalled.map((o) => ({
      opportunity_id: o.opportunity_id,
      brand_name: o.brand_name,
      stage: o.stage,
      days_in_stage: o.days_in_stage,
      proposed_value_inr: o.proposed_value_inr,
      owner_name: o.owner_name,
      campaign_name: o.campaign_name,
    })),
    cycle_time: cycleTime,
    diagnostics: diags,
    activations_count: activations.length,
    thresholds: th,
    stalled_days: stalledDays,
    hygiene: {
      duplicates_removed: state.hygiene.reduce((a, h) => a + h.raw_rows - h.kept_rows, 0),
      rows: state.hygiene,
    },
    series: [] as { date: string; qualified: number; confirmed: number; confirmed_inr: number; qualified_goal: number | null; confirmed_goal: number | null }[],
  };

  if (opts.includeSeries) {
    const start = cutoffFor(ev.history_start);
    for (let t = start; t <= cutoff; t += 7 * DAY) snapshot.series.push(seriesPoint(state, istDate(t)));
    if (snapshot.series.at(-1)?.date !== asOf) snapshot.series.push(seriesPoint(state, asOf));
  }
  return snapshot;
}

function seriesPoint(state: DbState, asOf: string) {
  const c = cutoffFor(asOf);
  const lq = latestBy(state.qualification, (r) => r.brand_id, c);
  const exists = new Set(state.opportunities.filter((o) => ms(o.created_at) <= c).map((o) => o.opportunity_id));
  const lo = latestBy(
    state.oppHistory.filter((h) => exists.has(h.opportunity_id)),
    (r) => r.opportunity_id,
    c,
  );
  const conf = [...lo.values()].filter((h) => h.stage === "partner_confirmed");
  const t = activeTarget(state.targets, c);
  return {
    date: asOf,
    qualified: [...lq.values()].filter((r) => r.qualification_status === "qualified").length,
    confirmed: conf.length,
    confirmed_inr: conf.reduce((a, h) => a + h.confirmed_value_inr, 0),
    qualified_goal: t?.qualified_brands_goal ?? null,
    confirmed_goal: t?.confirmed_partnerships_goal ?? null,
  };
}

export function fmtL(inr: number) {
  return `${(inr / 100000).toFixed(2)}L`;
}

export type Snapshot = ReturnType<typeof computeSnapshot>;
export type CampaignMetrics = Snapshot["campaigns"][number];
