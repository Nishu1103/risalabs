import { bad, handle, isDate, ok } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Log a bank receipt against an opportunity. This is the ONLY source of "cash collected". */
export const POST = handle(async (req: Request) => {
  const b = await req.json();
  const amt = Math.round(Number(b.amount_inr));
  if (!b.opportunity_id) return bad("opportunity_id required");
  if (!Number.isFinite(amt) || amt <= 0) return bad("amount_inr must be > 0");
  if (!isDate(b.received_date)) return bad("received_date (YYYY-MM-DD) required");
  const [row] = await q(
    `insert into payments (opportunity_id, amount_inr, received_at, reference) values ($1,$2,$3,$4) returning payment_id`,
    [b.opportunity_id, amt, `${b.received_date}T12:00:00+05:30`, b.reference || null],
  );
  return ok({ ok: true, payment_id: row.payment_id }, 201);
});

export const DELETE = handle(async (req: Request) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return bad("id required");
  await q(`delete from payments where payment_id = $1`, [id]);
  return ok({ ok: true });
});
