import { bad, editStamp, handle, isDate, ok } from "@/lib/api";
import { q, tx } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Create a new opportunity (optionally a brand-new brand) + its first history version. */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const date = isDate(b.effective_date) ? b.effective_date : null;
  if (!date) return bad("effective_date (YYYY-MM-DD) is required");
  if (!b.brand_id && !b.new_brand_name) return bad("Choose a brand or enter a new brand name");
  if (!["cash", "in_kind"].includes(b.support_type)) return bad("support_type must be cash or in_kind");
  const stage = b.stage ?? "prospecting";
  const proposed = Math.max(0, Math.round(Number(b.proposed_value_inr) || 0));
  const stamp = editStamp(date);

  const id = await tx(async (c) => {
    let brandId: string = b.brand_id;
    if (!brandId) {
      const r = await c.query(`select 'A' || lpad((coalesce(max(substring(brand_id from 2)::int), 0) + 1)::text, 3, '0') as id from brands where brand_id ~ '^A[0-9]+$'`);
      brandId = r.rows[0].id;
      await c.query(`insert into brands (brand_id, brand_name, industry, owner_name, created_at) values ($1,$2,$3,$4,$5)`, [
        brandId, String(b.new_brand_name).trim(), b.industry || "Consumer products", b.owner_name || null, stamp,
      ]);
      await c.query(
        `insert into brand_qualification (history_id, brand_id, qualification_status, reason, sponsor_campaign_id, effective_at, source)
         values ($1,$2,'unreviewed','Brand added in app; fit not yet assessed.',$3,$4,'app')`,
        [`BQ-APP-${Date.now().toString(36).toUpperCase()}`, brandId, b.sponsor_campaign_id || null, stamp],
      );
    }
    const r = await c.query(`select 'O' || lpad((coalesce(max(substring(opportunity_id from 2)::int), 0) + 1)::text, 3, '0') as id from opportunities where opportunity_id ~ '^O[0-9]+$'`);
    const oppId: string = r.rows[0].id;
    const brand = await c.query(`select brand_name from brands where brand_id = $1`, [brandId]);
    if (!brand.rows[0]) throw new Error(`Unknown brand ${brandId}`);
    await c.query(
      `insert into opportunities (opportunity_id, opportunity_name, brand_id, primary_contact_id, sponsor_campaign_id, support_type, created_at, source)
       values ($1,$2,$3,$4,$5,$6,$7,'app')`,
      [oppId, b.opportunity_name || `${brand.rows[0].brand_name} festival partnership`, brandId, b.primary_contact_id || null, b.sponsor_campaign_id || null, b.support_type, stamp],
    );
    await c.query(
      `insert into opportunity_history (history_id, opportunity_id, stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at, note, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'app')`,
      [`OH-APP-${Date.now().toString(36).toUpperCase()}`, oppId, stage, proposed, stage === "partner_confirmed" ? Math.round(Number(b.confirmed_value_inr) || proposed) : 0, b.owner_name || null, stamp, b.note || "Created in app"],
    );
    return oppId;
  });
  return ok({ ok: true, opportunity_id: id }, 201);
});

export const GET = handle(async () => ok(await q(`select * from opportunities order by opportunity_id`)));
