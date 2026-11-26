/**
 * Reads `data/Sponsor Dataset.xlsx` directly and returns typed, deduplicated rows.
 * Used by both `scripts/seed.ts` and `POST /api/reset`, so the reset is always a
 * faithful reload of the original source file.
 */
import ExcelJS from "exceljs";
import path from "node:path";

export const DATASET_PATH = path.join(process.cwd(), "data", "Sponsor Dataset.xlsx");

type Cell = string | number | boolean | Date | null;
type Row = Record<string, Cell>;

/**
 * Excel stores naive wall-clock datetimes. The source guide says every timestamp is
 * Asia/Kolkata (+05:30). ExcelJS materialises them as if they were UTC, so we read the
 * UTC components as IST wall-clock and shift to a true instant.
 */
export function excelIstToIso(v: Cell): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}T${p(v.getUTCHours())}:${p(
      v.getUTCMinutes(),
    )}:${p(v.getUTCSeconds())}+05:30`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+05:30`;
  if (/[+-]\d{2}:\d{2}$|Z$/.test(s)) return s;
  return `${s.replace(" ", "T")}+05:30`;
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "result" in v) return (v.result as Cell) ?? null; // formula
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  return String(v);
}

async function readSheets(file = DATASET_PATH): Promise<Record<string, Row[]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, Row[]> = {};
  wb.eachSheet((ws) => {
    const rows: Row[] = [];
    let headers: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row, idx) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
      if (idx === 1) {
        headers = values.map((h) => String(h ?? "").trim());
        return;
      }
      if (values.every((x) => x === null || x === "")) return;
      const r: Row = {};
      headers.forEach((h, i) => {
        if (h) r[h] = values[i] ?? null;
      });
      rows.push(r);
    });
    out[ws.name] = rows;
  });
  return out;
}

export interface HygieneEntry {
  source_sheet: string;
  source_id: string;
  raw_rows: number;
  kept_rows: number;
  action: string;
}

/** Remove exact repeats of a stable ID (import retries). Throws if same ID has a different payload. */
function dedupe(sheet: string, rows: Row[], idField: string, log: HygieneEntry[]): Row[] {
  const seen = new Map<string, string>();
  const counts = new Map<string, number>();
  const kept: Row[] = [];
  for (const r of rows) {
    const id = String(r[idField]);
    const payload = JSON.stringify(r, (_k, v) => (v instanceof Date ? v.toISOString() : v));
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (seen.has(id)) {
      if (seen.get(id) !== payload) throw new Error(`${sheet}: ${id} repeats with a different payload`);
      continue;
    }
    seen.set(id, payload);
    kept.push(r);
  }
  for (const [id, n] of counts) {
    if (n > 1)
      log.push({
        source_sheet: sheet,
        source_id: id,
        raw_rows: n,
        kept_rows: 1,
        action: "Removed identical import-retry copy (same stable ID, identical payload)",
      });
  }
  return kept;
}

const s = (v: Cell) => (v === null || v === undefined || v === "" ? null : String(v).trim());
const n = (v: Cell) => (v === null || v === undefined || v === "" ? 0 : Math.round(Number(v)));

export async function loadDataset(file = DATASET_PATH) {
  const sh = await readSheets(file);
  const need = [
    "Event",
    "Targets",
    "Brands",
    "Sponsor contacts",
    "Sponsor campaigns",
    "Sponsor interactions",
    "Brand qualification",
    "Partner opportunities",
    "Opportunity history",
    "Sponsor activations",
  ];
  for (const k of need) if (!sh[k]) throw new Error(`Missing sheet: ${k}`);

  const hygiene: HygieneEntry[] = [];
  const rawCounts = {
    interactions: sh["Sponsor interactions"].length,
    qualification: sh["Brand qualification"].length,
    oppHistory: sh["Opportunity history"].length,
  };
  const interactions = dedupe("Sponsor interactions", sh["Sponsor interactions"], "interaction_id", hygiene);
  const qualification = dedupe("Brand qualification", sh["Brand qualification"], "history_id", hygiene);
  const oppHistory = dedupe("Opportunity history", sh["Opportunity history"], "history_id", hygiene);

  const ev = sh["Event"][0];
  return {
    rawCounts,
    hygiene,
    event: {
      event_name: s(ev.event_name)!,
      history_start: excelIstToIso(ev.history_start)!.slice(0, 10),
      history_end: excelIstToIso(ev.history_end)!.slice(0, 10),
      event_starts_at: excelIstToIso(ev.event_starts_at)!,
      event_ends_at: excelIstToIso(ev.event_ends_at)!,
      timezone: s(ev.timezone)!,
      currency: s(ev.currency)!,
    },
    targets: sh["Targets"].map((r) => ({
      target_version: s(r.target_version)!,
      effective_at: excelIstToIso(r.effective_at)!,
      qualified_brands_goal: n(r.qualified_brands_goal),
      confirmed_partnerships_goal: n(r.confirmed_partnerships_goal),
    })),
    brands: sh["Brands"].map((r) => ({
      brand_id: s(r.brand_id)!,
      brand_name: s(r.brand_name)!,
      industry: s(r.industry)!,
      owner_id: s(r.owner_id),
      owner_name: s(r.owner_name),
      created_at: excelIstToIso(r.created_at)!,
    })),
    contacts: sh["Sponsor contacts"].map((r) => ({
      contact_id: s(r.contact_id)!,
      contact_name: s(r.contact_name)!,
      job_title: s(r.job_title),
      brand_id: s(r.brand_id)!,
      created_at: excelIstToIso(r.created_at)!,
    })),
    campaigns: sh["Sponsor campaigns"].map((r) => ({
      sponsor_campaign_id: s(r.sponsor_campaign_id)!,
      campaign_name: s(r.campaign_name)!,
      channel: s(r.channel)!,
      objective: s(r.objective),
      audience: s(r.audience),
      owner_id: s(r.owner_id),
      owner_name: s(r.owner_name),
      planned_start_at: excelIstToIso(r.planned_start_at),
      planned_end_at: excelIstToIso(r.planned_end_at),
      created_at: excelIstToIso(r.created_at)!,
    })),
    interactions: interactions.map((r) => ({
      interaction_id: s(r.interaction_id)!,
      attempt_id: s(r.attempt_id)!,
      origin_interaction_id: s(r.origin_interaction_id),
      brand_id: s(r.brand_id)!,
      contact_id: s(r.contact_id),
      sponsor_campaign_id: s(r.sponsor_campaign_id),
      channel: s(r.channel),
      event_type: s(r.event_type)!,
      outcome: s(r.outcome),
      summary: s(r.summary),
      occurred_at: excelIstToIso(r.occurred_at)!,
      owner_id: s(r.owner_id),
    })),
    qualification: qualification.map((r) => ({
      history_id: s(r.history_id)!,
      brand_id: s(r.brand_id)!,
      qualification_status: s(r.qualification_status)!,
      reason: s(r.reason),
      sponsor_campaign_id: s(r.sponsor_campaign_id),
      effective_at: excelIstToIso(r.effective_at)!,
    })),
    opportunities: sh["Partner opportunities"].map((r) => ({
      opportunity_id: s(r.opportunity_id)!,
      opportunity_name: s(r.opportunity_name)!,
      brand_id: s(r.brand_id)!,
      primary_contact_id: s(r.primary_contact_id),
      sponsor_campaign_id: s(r.sponsor_campaign_id),
      support_type: s(r.support_type)!,
      created_at: excelIstToIso(r.created_at)!,
    })),
    oppHistory: oppHistory.map((r) => ({
      history_id: s(r.history_id)!,
      opportunity_id: s(r.opportunity_id)!,
      stage: s(r.stage)!,
      proposed_value_inr: n(r.proposed_value_inr),
      confirmed_value_inr: n(r.confirmed_value_inr),
      owner_id: s(r.owner_id),
      owner_name: s(r.owner_name),
      effective_at: excelIstToIso(r.effective_at)!,
    })),
    activations: sh["Sponsor activations"].map((r) => ({
      activation_id: s(r.activation_id)!,
      brand_id: s(r.brand_id)!,
      opportunity_id: s(r.opportunity_id)!,
      attendee_campaign_id: s(r.attendee_campaign_id)!,
      attendee_campaign_name: s(r.attendee_campaign_name)!,
      activation_note: s(r.activation_note),
      linked_at: excelIstToIso(r.linked_at)!,
    })),
  };
}

export type Dataset = Awaited<ReturnType<typeof loadDataset>>;
