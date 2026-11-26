import { appId, bad, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
const TYPES: Record<string, string[]> = {
  outreach_sent: ["sent"],
  delivered: ["delivered"],
  replied: ["positive", "neutral", "not_interested", "wrong_contact"],
  meeting_booked: ["scheduled"],
  meeting_held: ["attended"],
  opt_out: ["do_not_contact"],
  introduction_received: ["introduced"],
  web_inbound: ["interest_submitted"],
};

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (!b.brand_id) return bad("brand_id required");
  if (!TYPES[b.event_type]) return bad(`event_type must be one of ${Object.keys(TYPES).join(", ")}`);
  const outcome = b.outcome && TYPES[b.event_type].includes(b.outcome) ? b.outcome : TYPES[b.event_type][0];
  if (!isDate(b.occurred_date)) return bad("occurred_date (YYYY-MM-DD) required");
  const [camp] = b.sponsor_campaign_id ? await q(`select channel from sponsor_campaigns where sponsor_campaign_id = $1`, [b.sponsor_campaign_id]) : [];
  const id = appId("SI");
  await q(
    `insert into sponsor_interactions (interaction_id, attempt_id, origin_interaction_id, brand_id, contact_id, sponsor_campaign_id, channel, event_type, outcome, summary, occurred_at, source)
     values ($1,$2,null,$3,$4,$5,$6,$7,$8,$9,$10,'app')`,
    [id, appId("SA"), b.brand_id, b.contact_id || null, b.sponsor_campaign_id || null, camp?.channel ?? null, b.event_type, outcome, b.summary || null, `${b.occurred_date}T12:00:00+05:30`],
  );
  return ok({ ok: true, interaction_id: id }, 201);
});
