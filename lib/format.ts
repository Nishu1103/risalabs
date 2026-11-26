export const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;
export const lakh = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : `₹${(n / 100000).toFixed(d)}L`;
export const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(d)}%`);
export const stageLabel = (s: string) =>
  ({
    prospecting: "Prospecting",
    contacted: "Contacted",
    proposal_sent: "Proposal sent",
    negotiating: "Negotiating",
    partner_confirmed: "Confirmed",
    lost: "Lost",
    withdrawn: "Withdrawn",
  })[s] ?? s;
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};
