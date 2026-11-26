import { bad, handle, ok } from "@/lib/api";
import { resetDatabase } from "@/lib/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const token = process.env.RESET_TOKEN;
  if (token && req.headers.get("x-reset-token") !== token) return bad("Invalid reset token", 401);
  const result = await resetDatabase();
  return ok({ ok: true, ...result });
});
