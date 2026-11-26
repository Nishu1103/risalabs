import { bad, handle, ok } from "@/lib/api";
import { q, tx } from "@/lib/db";

export const dynamic = "force-dynamic";
const CHANNELS = ["email", "linkedin", "introduction", "web_inbound", "event", "referral", "other"];

export const GET = handle(async () =>
  ok(
    await q(
      `select c.sponsor_campaign_id, c.campaign_name, c.channel, c.objective, c.audience, c.owner_name,
              c.status, c.source, c.target_contribution_inr::float8 as target_contribution_inr, c.hypothesis,
              b.budget_inr::float8 as budget_inr, b.spent_inr::float8 as spent_inr, b.basis
       from sponsor_campaigns c
       left join campaign_budgets b using (sponsor_campaign_id)
       order by c.sponsor_campaign_id`,
    ),
  ),
);

/** Add a new strategic bet (campaign). Marked source='app' — never confused with dataset campaigns. */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (!b.campaign_name?.trim()) return bad("campaign_name required");
  if (!CHANNELS.includes(b.channel)) return bad(`channel must be one of ${CHANNELS.join(", ")}`);
  const id = await tx(async (c) => {
    const r = await c.query(`select 'SC' || lpad((coalesce(max(substring(sponsor_campaign_id from 3)::int), 0) + 1)::text, 2, '0') as id from sponsor_campaigns where sponsor_campaign_id ~ '^SC[0-9]+$'`);
    const id: string = r.rows[0].id;
    await c.query(
      `insert into sponsor_campaigns (sponsor_campaign_id, campaign_name, channel, objective, audience, owner_name, planned_start_at, planned_end_at, created_at, source, status, target_contribution_inr, hypothesis)
       values ($1,$2,$3,$4,$5,$6,$7,$8,now(),'app',$9,$10,$11)`,
      [id, b.campaign_name.trim(), b.channel, b.objective || null, b.audience || null, b.owner_name || null,
       b.planned_start ? `${b.planned_start}T09:00:00+05:30` : null, b.planned_end ? `${b.planned_end}T18:00:00+05:30` : null,
       b.status || "planned", Math.max(0, Math.round(Number(b.target_contribution_inr) || 0)), b.hypothesis || null],
    );
    await c.query(`insert into campaign_budgets (sponsor_campaign_id, budget_inr, spent_inr, basis) values ($1,$2,$3,'Team-entered plan')`, [
      id, Math.max(0, Math.round(Number(b.budget_inr) || 0)), 0,
    ]);
    return id;
  });
  return ok({ ok: true, sponsor_campaign_id: id }, 201);
});
