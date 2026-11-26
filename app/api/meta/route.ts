import { handle, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const [brands, campaigns, owners, contacts] = await Promise.all([
    q(`select brand_id, brand_name, industry from brands order by brand_name`),
    q(`select sponsor_campaign_id, campaign_name, channel, source from sponsor_campaigns order by sponsor_campaign_id`),
    q(`select distinct owner_name from (
         select owner_name from brands union select owner_name from sponsor_campaigns union select owner_name from opportunity_history
       ) x where owner_name is not null order by 1`),
    q(`select contact_id, contact_name, job_title, brand_id from contacts order by contact_name`),
  ]);
  return ok({
    brands,
    campaigns,
    owners: owners.map((o) => o.owner_name),
    contacts,
    industries: [...new Set(brands.map((b) => b.industry as string))].sort(),
  });
});
