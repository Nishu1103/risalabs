import { appId, bad, editStamp, handle, isDate, ok } from "@/lib/api";
import { q, tx } from "@/lib/db";

export const dynamic = "force-dynamic";
const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];
const ist = (col: string) => `to_char(${col} at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as ${col.split(".").pop()}`;

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const [opp] = await q(
    `select o.*, b.brand_name, b.industry, c.campaign_name, ct.contact_name, ct.job_title
     from opportunities o join brands b using (brand_id)
     left join sponsor_campaigns c using (sponsor_campaign_id)
     left join contacts ct on ct.contact_id = o.primary_contact_id where o.opportunity_id = $1`,
    [id],
  );
  if (!opp) return bad("Not found", 404);
  const [history, payments, interactions, qualification, tasks] = await Promise.all([
    q(`select history_id, stage, proposed_value_inr::float8 as proposed_value_inr, confirmed_value_inr::float8 as confirmed_value_inr, support_type, owner_name, note, source, ${ist("effective_at")}, ${ist("recorded_at")}
       from opportunity_history where opportunity_id = $1 order by effective_at, recorded_at`, [id]),
    q(`select payment_id, amount_inr::float8 as amount_inr, reference, ${ist("received_at")} from payments where opportunity_id = $1 order by received_at`, [id]),
    q(`select i.interaction_id, i.event_type, i.outcome, i.summary, i.channel, i.source, c.campaign_name, ct.contact_name, ${ist("i.occurred_at")}
       from sponsor_interactions i left join sponsor_campaigns c using (sponsor_campaign_id) left join contacts ct using (contact_id)
       where i.brand_id = $1 order by i.occurred_at desc limit 60`, [opp.brand_id]),
    q(`select history_id, qualification_status, reason, source, ${ist("effective_at")} from brand_qualification where brand_id = $1 order by effective_at`, [opp.brand_id]),
    q(`select task_id, title, status, owner_name, due_date::text from tasks where linked_opportunity_id = $1 order by task_id desc`, [id]),
  ]);
  return ok({ opportunity: opp, history, payments, interactions, qualification, tasks });
});

/**
 * Edit = append a new full-state version (never overwrite history).
 * Body: { effective_date, stage?, proposed_value_inr?, confirmed_value_inr?, support_type?, owner_name?, note? }
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json();
  if (!isDate(b.effective_date)) return bad("effective_date (YYYY-MM-DD) is required");
  const stamp = editStamp(b.effective_date);
  const out = await tx(async (c) => {
    const cur = (
      await c.query(
        `select h.*, to_char(h.effective_at at time zone 'Asia/Kolkata','YYYY-MM-DD') as eff_date, o.support_type as base_support
         from opportunity_history h join opportunities o using (opportunity_id)
         where h.opportunity_id = $1 order by h.effective_at desc, h.recorded_at desc limit 1`,
        [id],
      )
    ).rows[0];
    if (!cur) throw new Error(`Unknown opportunity ${id}`);
    if (Date.parse(stamp) < new Date(cur.effective_at).getTime())
      throw new Error(`This opportunity already has a later version dated ${cur.eff_date}. Move the snapshot date to ${cur.eff_date} or later to edit it (history is append-only).`);
    const stage = b.stage ?? cur.stage;
    if (!STAGES.includes(stage)) throw new Error(`Invalid stage ${stage}`);
    const proposed = b.proposed_value_inr !== undefined ? Math.max(0, Math.round(Number(b.proposed_value_inr))) : Number(cur.proposed_value_inr);
    let confirmed = b.confirmed_value_inr !== undefined ? Math.max(0, Math.round(Number(b.confirmed_value_inr))) : Number(cur.confirmed_value_inr);
    if (stage === "partner_confirmed" && confirmed === 0) confirmed = proposed; // sensible default
    if (stage !== "partner_confirmed") confirmed = 0; // field guide: zero unless confirmed
    const support = b.support_type && ["cash", "in_kind"].includes(b.support_type) ? b.support_type : cur.support_type;
    const hid = appId("OH");
    await c.query(
      `insert into opportunity_history (history_id, opportunity_id, stage, proposed_value_inr, confirmed_value_inr, support_type, owner_name, effective_at, note, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'app')`,
      [hid, id, stage, proposed, confirmed, support, b.owner_name ?? cur.owner_name, stamp, b.note ?? null],
    );
    return { history_id: hid, stage, proposed, confirmed };
  });
  return ok({ ok: true, ...out });
});
