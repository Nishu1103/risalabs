import { appId, bad, editStamp, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
const STATUSES = ["unreviewed", "engaged", "qualified", "unqualified", "dormant"];

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const [brand] = await q(`select brand_id, brand_name, industry, owner_name, created_at from brands where brand_id = $1`, [id]);
  if (!brand) return bad("Not found", 404);
  const [contacts, qualification, opportunities] = await Promise.all([
    q(`select contact_id, contact_name, job_title from contacts where brand_id = $1 order by contact_name`, [id]),
    q(
      `select history_id, qualification_status, reason, source, to_char(effective_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') as effective_at
       from brand_qualification where brand_id = $1 order by effective_at`,
      [id],
    ),
    q(`select opportunity_id, opportunity_name, support_type, sponsor_campaign_id from opportunities where brand_id = $1 order by opportunity_id`, [id]),
  ]);
  return ok({ brand, contacts, qualification, opportunities });
});

/** Append a brand qualification version. Body: { qualification_status, reason?, effective_date } */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json();
  if (!STATUSES.includes(b.qualification_status)) return bad("Invalid qualification_status");
  if (!isDate(b.effective_date)) return bad("effective_date required");
  const [last] = await q(`select max(effective_at) as m from brand_qualification where brand_id = $1`, [id]);
  const stamp = editStamp(b.effective_date);
  if (last?.m && Date.parse(stamp) < new Date(last.m).getTime())
    return bad("This brand has a later qualification version; move the snapshot date forward to edit.");
  const [prev] = await q(`select sponsor_campaign_id from brand_qualification where brand_id = $1 order by effective_at desc limit 1`, [id]);
  await q(
    `insert into brand_qualification (history_id, brand_id, qualification_status, reason, sponsor_campaign_id, effective_at, source) values ($1,$2,$3,$4,$5,$6,'app')`,
    [appId("BQ"), id, b.qualification_status, b.reason || "Updated in app", prev?.sponsor_campaign_id ?? null, stamp],
  );
  return ok({ ok: true });
});
