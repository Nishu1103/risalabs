/**
 * Loads the original xlsx into Postgres. Shared by `npm run seed` and `POST /api/reset`.
 * Reset = truncate every table, then reload source rows + labelled operational seed data.
 */
import type { PoolClient } from "pg";
import { loadDataset } from "./dataset";
import { tx } from "./db";

async function bulk(c: PoolClient, table: string, rows: object[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const list = cols.map((k) => `"${k}"`).join(",");
  await c.query(
    `insert into ${table} (${list}) select ${list} from json_populate_recordset(null::${table}, $1::json)`,
    [JSON.stringify(rows)],
  );
}

/**
 * Planning budgets are NOT in the source dataset. These are explicit, editable
 * assumptions so the "budget vs outcome" view has something to work with. Every
 * screen and the copilot label them as assumptions.
 */
export const ASSUMED_BUDGETS: Record<string, { budget: number; spent: number; basis: string }> = {
  SC01: { budget: 30000, spent: 30000, basis: "Assumption: email tool + list enrichment for ~3 months" },
  SC02: { budget: 15000, spent: 15000, basis: "Assumption: alumni/partner intro meetups & travel" },
  SC03: { budget: 25000, spent: 25000, basis: "Assumption: LinkedIn Sales Navigator seats ~3 months" },
  SC04: { budget: 10000, spent: 10000, basis: "Assumption: landing page, deck and form tooling" },
  SC05: { budget: 30000, spent: 30000, basis: "Assumption: creator referral thank-you fees" },
  SC06: { budget: 5000, spent: 5000, basis: "Assumption: email sequences reusing existing tooling" },
};

const SEED_TASKS = [
  {
    title: "Invoice & collect cash from the 20 confirmed cash partners",
    description:
      "Reported confirmed cash is ₹20.00L but the source has no bank receipts. Send invoices, log each receipt in Pipeline → Payments so 'Cash collected' becomes real.",
    owner_name: "Riya Kapoor",
    linked_opportunity_id: null,
    linked_campaign_id: null,
    priority: "critical",
    due_date: "2025-04-05",
    status: "in_progress",
  },
  {
    title: "Force a decision on 8 negotiating deals (₹7.20L)",
    description: "Each negotiating deal has been idle 3+ weeks. Get a signed yes or mark lost before the fest.",
    owner_name: "Meera Iyer",
    linked_opportunity_id: null,
    linked_campaign_id: null,
    priority: "high",
    due_date: "2025-04-08",
    status: "todo",
  },
  {
    title: "Pause Brand Discovery Email (SC01) and move hours to warm intros",
    description: "224 attempts, 0 confirmed partnerships. Redeploy the owner's time to SC02/SC05 intro asks.",
    owner_name: "Kabir Shah",
    linked_opportunity_id: null,
    linked_campaign_id: "SC01",
    priority: "high",
    due_date: "2025-03-20",
    status: "todo",
  },
  {
    title: "Ask each confirmed partner for 2 warm introductions",
    description: "Warm channels produced 24/24 confirmed deals. Turn every closed partner into a referral source.",
    owner_name: "Nisha Rao",
    linked_opportunity_id: null,
    linked_campaign_id: "SC05",
    priority: "medium",
    due_date: "2025-03-25",
    status: "todo",
  },
];

export async function resetDatabase() {
  const d = await loadDataset();
  await tx(async (c) => {
    await c.query(`truncate copilot_log, tasks, payments, campaign_budgets, data_hygiene_logs, sponsor_activations,
      opportunity_history, opportunities, brand_qualification, sponsor_interactions, sponsor_campaigns,
      contacts, brands, targets, event restart identity cascade`);
    await bulk(c, "event", [d.event]);
    await bulk(c, "targets", d.targets);
    await bulk(c, "brands", d.brands);
    await bulk(c, "contacts", d.contacts);
    await bulk(
      c,
      "sponsor_campaigns",
      d.campaigns.map((x) => ({ ...x, source: "dataset", status: "active", target_contribution_inr: 0, hypothesis: null })),
    );
    await bulk(c, "sponsor_interactions", d.interactions.map((x) => ({ ...x, source: "dataset" })));
    await bulk(c, "brand_qualification", d.qualification.map((x) => ({ ...x, source: "dataset" })));
    await bulk(c, "opportunities", d.opportunities.map((x) => ({ ...x, source: "dataset" })));
    await bulk(
      c,
      "opportunity_history",
      d.oppHistory.map((x) => ({ ...x, support_type: null, note: null, source: "dataset" })),
    );
    await bulk(c, "sponsor_activations", d.activations);
    await bulk(c, "data_hygiene_logs", d.hygiene);
    await bulk(
      c,
      "campaign_budgets",
      Object.entries(ASSUMED_BUDGETS).map(([id, b]) => ({
        sponsor_campaign_id: id,
        budget_inr: b.budget,
        spent_inr: b.spent,
        basis: b.basis,
      })),
    );
    await bulk(c, "tasks", SEED_TASKS.map((t) => ({ ...t, created_by: "user", rationale: null })));
  });
  return {
    raw: d.rawCounts,
    duplicatesRemoved: d.hygiene.reduce((a, h) => a + h.raw_rows - h.kept_rows, 0),
    rows: {
      brands: d.brands.length,
      contacts: d.contacts.length,
      campaigns: d.campaigns.length,
      interactions: d.interactions.length,
      qualification: d.qualification.length,
      opportunities: d.opportunities.length,
      oppHistory: d.oppHistory.length,
      activations: d.activations.length,
    },
  };
}
