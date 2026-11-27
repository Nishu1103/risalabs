import { bad, handle, ok } from "@/lib/api";
import { resetDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Published on the strategy deck so reviewers can restore the dataset. Env overrides it. */
const REVIEWER_RESET_TOKEN = "nishant";

export const POST = handle(async (req: Request) => {
  const token = process.env.RESET_TOKEN?.trim() || REVIEWER_RESET_TOKEN;
  if (req.headers.get("x-reset-token") !== token) return bad("Invalid reset token", 401);
  const result = await resetDatabase();
  return ok({ ok: true, ...result });
});
