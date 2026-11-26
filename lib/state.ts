/** Loads the full (small) database state in one round of queries. Analytics run in pure TS on top. */
import { q } from "./db";

export interface EventRow {
  event_name: string;
  history_start: string;
  history_end: string;
  event_starts_at: string;
  event_ends_at: string;
  timezone: string;
  currency: string;
}
export interface TargetRow {
  target_version: string;
  effective_at: string;
  qualified_brands_goal: number;
  confirmed_partnerships_goal: number;
}
export interface BrandRow {
  brand_id: string;
  brand_name: string;
  industry: string;
  owner_name: string | null;
  created_at: string;
}
export interface ContactRow {
  contact_id: string;
  contact_name: string;
  job_title: string | null;
  brand_id: string;
  created_at: string;
}
export interface CampaignRow {
  sponsor_campaign_id: string;
  campaign_name: string;
  channel: string;
  objective: string | null;
  audience: string | null;
  owner_name: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  created_at: string;
  source: "dataset" | "app";
  status: string;
  target_contribution_inr: number;
  hypothesis: string | null;
  budget_inr: number | null;
  spent_inr: number | null;
  budget_basis: string | null;
}
export interface InteractionRow {
  interaction_id: string;
  attempt_id: string;
  origin_interaction_id: string | null;
  brand_id: string;
  contact_id: string | null;
  sponsor_campaign_id: string | null;
  channel: string | null;
  event_type: string;
  outcome: string | null;
  summary: string | null;
  occurred_at: string;
  source: string;
}
export interface QualRow {
  history_id: string;
  brand_id: string;
  qualification_status: string;
  reason: string | null;
  sponsor_campaign_id: string | null;
  effective_at: string;
  source: string;
}
export interface OppRow {
  opportunity_id: string;
  opportunity_name: string;
  brand_id: string;
  primary_contact_id: string | null;
  sponsor_campaign_id: string | null;
  support_type: "cash" | "in_kind";
  created_at: string;
  source: string;
}
export interface OppHistRow {
  history_id: string;
  opportunity_id: string;
  stage: string;
  proposed_value_inr: number;
  confirmed_value_inr: number;
  support_type: "cash" | "in_kind" | null;
  owner_name: string | null;
  effective_at: string;
  note: string | null;
  source: string;
  recorded_at: string;
}
export interface ActivationRow {
  activation_id: string;
  brand_id: string;
  opportunity_id: string;
  attendee_campaign_id: string;
  attendee_campaign_name: string;
  activation_note: string | null;
  linked_at: string;
}
export interface PaymentRow {
  payment_id: number;
  opportunity_id: string;
  amount_inr: number;
  received_at: string;
  reference: string | null;
}
export interface HygieneRow {
  source_sheet: string;
  source_id: string;
  raw_rows: number;
  kept_rows: number;
  action: string;
}
export interface TaskRow {
  task_id: number;
  title: string;
  description: string | null;
  owner_name: string | null;
  linked_opportunity_id: string | null;
  linked_campaign_id: string | null;
  priority: string;
  due_date: string | null;
  status: string;
  created_by: string;
  rationale: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbState {
  event: EventRow;
  targets: TargetRow[];
  brands: BrandRow[];
  contacts: ContactRow[];
  campaigns: CampaignRow[];
  interactions: InteractionRow[];
  qualification: QualRow[];
  opportunities: OppRow[];
  oppHistory: OppHistRow[];
  activations: ActivationRow[];
  payments: PaymentRow[];
  hygiene: HygieneRow[];
  tasks: TaskRow[];
}

const iso = `to_char(%s at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"')`;
const t = (col: string, as = col) => `${iso.replace("%s", col)} as ${as}`;

export async function loadState(): Promise<DbState> {
  const [event, targets, brands, contacts, campaigns, interactions, qualification, opportunities, oppHistory, activations, payments, hygiene, tasks] =
    await Promise.all([
      q<EventRow>(
        `select event_name, history_start::text, history_end::text, ${t("event_starts_at")}, ${t("event_ends_at")}, timezone, currency from event limit 1`,
      ),
      q<TargetRow>(`select target_version, ${t("effective_at")}, qualified_brands_goal, confirmed_partnerships_goal from targets`),
      q<BrandRow>(`select brand_id, brand_name, industry, owner_name, ${t("created_at")} from brands`),
      q<ContactRow>(`select contact_id, contact_name, job_title, brand_id, ${t("created_at")} from contacts`),
      q<CampaignRow>(
        `select c.sponsor_campaign_id, c.campaign_name, c.channel, c.objective, c.audience, c.owner_name,
          ${t("c.planned_start_at", "planned_start_at")}, ${t("c.planned_end_at", "planned_end_at")}, ${t("c.created_at", "created_at")},
          c.source, c.status, c.target_contribution_inr::float8 as target_contribution_inr, c.hypothesis,
          b.budget_inr::float8 as budget_inr, b.spent_inr::float8 as spent_inr, b.basis as budget_basis
         from sponsor_campaigns c left join campaign_budgets b using (sponsor_campaign_id) order by c.sponsor_campaign_id`,
      ),
      q<InteractionRow>(
        `select interaction_id, attempt_id, origin_interaction_id, brand_id, contact_id, sponsor_campaign_id, channel, event_type, outcome, summary, ${t(
          "occurred_at",
        )}, source from sponsor_interactions`,
      ),
      q<QualRow>(
        `select history_id, brand_id, qualification_status, reason, sponsor_campaign_id, ${t("effective_at")}, source from brand_qualification`,
      ),
      q<OppRow>(
        `select opportunity_id, opportunity_name, brand_id, primary_contact_id, sponsor_campaign_id, support_type, ${t("created_at")}, source from opportunities`,
      ),
      q<OppHistRow>(
        `select history_id, opportunity_id, stage, proposed_value_inr::float8 as proposed_value_inr, confirmed_value_inr::float8 as confirmed_value_inr,
          support_type, owner_name, ${t("effective_at")}, note, source, ${t("recorded_at")} from opportunity_history`,
      ),
      q<ActivationRow>(
        `select activation_id, brand_id, opportunity_id, attendee_campaign_id, attendee_campaign_name, activation_note, ${t("linked_at")} from sponsor_activations`,
      ),
      q<PaymentRow>(`select payment_id, opportunity_id, amount_inr::float8 as amount_inr, ${t("received_at")}, reference from payments`),
      q<HygieneRow>(`select source_sheet, source_id, raw_rows, kept_rows, action from data_hygiene_logs order by id`),
      q<TaskRow>(
        `select task_id, title, description, owner_name, linked_opportunity_id, linked_campaign_id, priority, due_date::text, status, created_by, rationale,
          ${t("created_at")}, ${t("updated_at")} from tasks order by task_id desc`,
      ),
    ]);
  if (!event[0]) throw new Error("Database is empty. Run `npm run seed` or press 'Reset to original dataset'.");
  return {
    event: event[0],
    targets,
    brands,
    contacts,
    campaigns,
    interactions,
    qualification,
    opportunities,
    oppHistory,
    activations,
    payments,
    hygiene,
    tasks,
  };
}
