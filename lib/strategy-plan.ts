/**
 * Next-edition plan. Same arithmetic as strategy/model.py.
 * Collected totals are the deck targets. The collection uplift is the gap versus a 65%
 * no-policy rate and is already inside those totals. It is not new sponsorship revenue.
 */
const CASH_SHARE = 20 / 24;
const NO_POLICY_RATE = 0.65;

function confirmedCash(attempts: number, conv: number, avgTicket: number) {
  return Math.round(attempts * conv * CASH_SHARE * avgTicket);
}

type VolumeBet = {
  id: "alumni" | "referrals" | "inbound" | "reroute";
  name: string;
  kind: "new_sponsorship";
  confidence: "qualitative";
  effort: "qualitative";
  base_confirmed_inr: number;
  stretch_confirmed_inr: number;
  base_collected_inr: number;
  stretch_collected_inr: number;
};

function volume(
  id: VolumeBet["id"],
  name: string,
  base: [number, number, number],
  stretch: [number, number, number],
): VolumeBet {
  const baseConfirmed = confirmedCash(...base);
  const stretchConfirmed = confirmedCash(...stretch);
  return {
    id,
    name,
    kind: "new_sponsorship",
    confidence: "qualitative",
    effort: "qualitative",
    base_confirmed_inr: baseConfirmed,
    stretch_confirmed_inr: stretchConfirmed,
    base_collected_inr: Math.round(baseConfirmed * 0.8),
    stretch_collected_inr: Math.round(stretchConfirmed * 0.9),
  };
}

export function strategyPlan() {
  const bets = [
    volume("alumni", "Alumni and creator intro sprint", [40, 0.4, 100_000], [60, 0.4, 110_000]),
    volume("referrals", "Partner-gets-partner referrals", [24, 0.45, 100_000], [48, 0.45, 110_000]),
    volume("inbound", "Inbound sponsor page and deck", [30, 0.35, 90_000], [45, 0.35, 100_000]),
    volume("reroute", "Warm re-route of stalled cold opps", [26, 0.15, 55_000], [26, 0.25, 55_000]),
  ];
  const baseConfirmed = bets.reduce((a, b) => a + b.base_confirmed_inr, 0);
  const stretchConfirmed = bets.reduce((a, b) => a + b.stretch_confirmed_inr, 0);
  const baseCollected = Math.round(baseConfirmed * 0.8);
  const stretchCollected = Math.round(stretchConfirmed * 0.9);
  const downside = (confirmed: number, rate: number) => Math.round(confirmed * 0.5 * rate);
  return {
    label: "ASSUMPTION for the next edition. Not a 2025 actual.",
    do_not_add_uplift_to_collected: true,
    base: {
      collection_rate: 0.8,
      confirmed_cash_inr: baseConfirmed,
      collected_inr: baseCollected,
      deck_label: "₹25.6L",
      collection_uplift_vs_65pct_inr: Math.round(baseConfirmed * (0.8 - NO_POLICY_RATE)),
    },
    stretch: {
      collection_rate: 0.9,
      confirmed_cash_inr: stretchConfirmed,
      collected_inr: stretchCollected,
      deck_label: "₹52.1L",
      collection_uplift_vs_65pct_inr: Math.round(stretchConfirmed * (0.9 - NO_POLICY_RATE)),
    },
    downside_if_conversion_halves: {
      base_collected_inr: downside(baseConfirmed, 0.8),
      stretch_collected_inr: downside(stretchConfirmed, 0.9),
      deck_label_base: "₹12.8L",
    },
    bets,
    note: "Sum of the four new-sponsorship collected amounts is the base/stretch target. collection_uplift_vs_65pct_inr is already inside collected_inr. Confidence and effort are qualitative; there is no numeric Impact × Confidence ÷ Effort score.",
  };
}
