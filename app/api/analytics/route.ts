import { computeSnapshot } from "@/lib/analytics";
import { bad, handle, isDate, ok } from "@/lib/api";
import { loadState } from "@/lib/state";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const asOf = u.searchParams.get("asOf") ?? "2025-04-20";
  if (!isDate(asOf)) return bad("asOf must be YYYY-MM-DD");
  const stalledRaw = u.searchParams.get("stalledDays");
  const stalledNum = stalledRaw == null || stalledRaw === "" ? 7 : Number(stalledRaw);
  const stalledDays = Number.isFinite(stalledNum) && stalledNum >= 0 ? stalledNum : 7;
  const t = (k: string) => {
    const raw = u.searchParams.get(k);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const state = await loadState();
  const snap = computeSnapshot(state, asOf, {
    stalledDays: Number.isFinite(stalledDays) ? stalledDays : 7,
    includeSeries: u.searchParams.get("series") === "1",
    thresholds: {
      scaleMinConfirmed: t("scaleMinConfirmed"),
      scaleMinWinRate: t("scaleMinWinRate"),
      killMinAttempts: t("killMinAttempts"),
      killMaxMeetingRate: t("killMaxMeetingRate"),
      pivotMinAttempts: t("pivotMinAttempts"),
    } as never,
  });
  return ok({ ...snap, tasks: state.tasks });
});
