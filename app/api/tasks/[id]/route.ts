import { bad, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json();
  if (b.status && !["todo", "in_progress", "done"].includes(b.status)) return bad("Invalid status");
  if (b.priority && !["low", "medium", "high", "critical"].includes(b.priority)) return bad("Invalid priority");
  const r = await q(
    `update tasks set title = coalesce($2,title), description = coalesce($3,description), owner_name = coalesce($4,owner_name),
       priority = coalesce($5,priority), due_date = coalesce($6::date,due_date), status = coalesce($7,status),
       linked_opportunity_id = case when $8::boolean then nullif($9,'') else linked_opportunity_id end,
       linked_campaign_id = case when $10::boolean then nullif($11,'') else linked_campaign_id end,
       updated_at = now() where task_id = $1 returning task_id`,
    [Number(id), b.title ?? null, b.description ?? null, b.owner_name ?? null, b.priority ?? null, isDate(b.due_date) ? b.due_date : null, b.status ?? null,
     "linked_opportunity_id" in b, b.linked_opportunity_id ?? "", "linked_campaign_id" in b, b.linked_campaign_id ?? ""],
  );
  if (!r.length) return bad("Not found", 404);
  return ok({ ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await q(`delete from tasks where task_id = $1`, [Number(id)]);
  return ok({ ok: true });
});
