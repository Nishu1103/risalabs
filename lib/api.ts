import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      const msg = (e as Error).message ?? "Unknown error";
      console.error(e);
      if (e instanceof SyntaxError || /JSON|Unexpected token|invalid json/i.test(msg))
        return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
      const status = /DATABASE_URL|empty/.test(msg) ? 503 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  };
}
export const isDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
/** App edits are stamped at the END of the chosen snapshot day (IST) so they appear in that day's snapshot and later. */
export const editStamp = (date: string) => `${date}T23:59:58+05:30`;
export const appId = (prefix: string) => `${prefix}-APP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
