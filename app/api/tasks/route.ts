import { bad, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
const PRI = ["low", "medium", "high", "critical"];

export const GET = handle(async () =>
  ok(
    await q(
      `select task_id, title, description, owner_name, linked_opportunity_id, linked_campaign_id, priority, due_date::text as due_date, status, created_by, rationale, created_at, updated_at
       from tasks t order by case t.status when 'done' then 1 else 0 end, t.due_date nulls last, t.task_id desc`,
    ),
  ),
);

export const POST = handle(async (req: Request) => {
  const b = await req.json();
  if (!b.title?.trim()) return bad("title required");
  const [row] = await q(
    `insert into tasks (title, description, owner_name, linked_opportunity_id, linked_campaign_id, priority, due_date, status, created_by, rationale)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning task_id`,
    [
      b.title.trim().slice(0, 200), b.description || null, b.owner_name || null, b.linked_opportunity_id || null, b.linked_campaign_id || null,
      PRI.includes(b.priority) ? b.priority : "medium", isDate(b.due_date) ? b.due_date : null,
      ["todo", "in_progress", "done"].includes(b.status) ? b.status : "todo",
      b.created_by === "ai_copilot" ? "ai_copilot" : "user", b.rationale || null,
    ],
  );
  return ok({ ok: true, task_id: row.task_id }, 201);
});
