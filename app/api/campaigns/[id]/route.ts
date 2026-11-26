import { bad, handle, ok } from "@/lib/api";
import { tx } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Update operational fields: status, owner, target contribution, hypothesis, budget, spend. Source fields stay untouched. */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = await req.json();
  if (b.status && !["planned", "active", "paused", "stopped"].includes(b.status)) return bad("Invalid status");
  await tx(async (c) => {
    const r = await c.query(
      `update sponsor_campaigns set
         status = coalesce($2, status),
         owner_name = case when source = 'app' then coalesce($3, owner_name) else owner_name end,
         target_contribution_inr = coalesce($4, target_contribution_inr),
         hypothesis = coalesce($5, hypothesis)
       where sponsor_campaign_id = $1`,
      [id, b.status ?? null, b.owner_name ?? null, b.target_contribution_inr != null ? Math.round(Number(b.target_contribution_inr)) : null, b.hypothesis ?? null],
    );
    if (!r.rowCount) throw new Error(`Unknown campaign ${id}`);
    if (b.budget_inr != null || b.spent_inr != null) {
      await c.query(
        `insert into campaign_budgets (sponsor_campaign_id, budget_inr, spent_inr, basis) values ($1, coalesce($2,0), coalesce($3,0), 'Team-entered')
         on conflict (sponsor_campaign_id) do update set
           budget_inr = coalesce($2, campaign_budgets.budget_inr), spent_inr = coalesce($3, campaign_budgets.spent_inr), basis = 'Team-entered (edited in app)'`,
        [id, b.budget_inr != null ? Math.round(Number(b.budget_inr)) : null, b.spent_inr != null ? Math.round(Number(b.spent_inr)) : null],
      );
    }
  });
  return ok({ ok: true });
});
