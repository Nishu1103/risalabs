"""Sponsorship growth model for CampusFest (next edition). Run: python3 strategy/model.py
Every SOURCED number below is reproduced by `npm run verify` from the 2025 dataset.
Every ASSUMPTION is labelled and can be changed here."""
import json

# ---------------- SOURCED (CampusFest 2025 dataset, as of 2025-04-20)
S = dict(
    warm_attempts=48, warm_confirmed=24, warm_opps=25,          # SC02+SC04+SC05
    cold_attempts=322, cold_confirmed=0, cold_opps=33,          # SC01+SC03+SC06
    sc02_attempts=9, sc02_conf=8, sc04_attempts=18, sc04_conf=7, sc05_attempts=21, sc05_conf=9,
    confirmed_cash=2_000_000, cash_deals=20, in_kind_deals=4, in_kind_value=240_000,
    avg_cash_deal=100_000, cycle_days=10.2, open_pipeline=1_440_000, open_opps=26,
    brands=180, qualified=60, target_confirmed=28,
)
S["warm_conv"] = S["warm_confirmed"] / S["warm_attempts"]        # 0.50
S["cash_share"] = S["cash_deals"] / (S["cash_deals"] + S["in_kind_deals"])  # 0.833

# ---------------- BETS: attempts (A = assumption), conversion (haircut vs sourced), deal size
def bet(name, attempts, conv, avg_cash, note):
    deals = attempts * conv
    cash_deals = deals * S["cash_share"]
    return dict(name=name, attempts=attempts, conv=conv, deals=round(deals, 1), cash_deals=round(cash_deals, 1),
                avg_cash=avg_cash, confirmed_cash=round(cash_deals * avg_cash), note=note)

def scenario(label, collect_rate, bets):
    conf = sum(b["confirmed_cash"] for b in bets)
    return dict(label=label, collect_rate=collect_rate, bets=bets,
                deals=round(sum(b["deals"] for b in bets), 1),
                confirmed_cash=conf, collected=round(conf * collect_rate),
                attempts=sum(b["attempts"] for b in bets))

base = scenario("Base", 0.80, [
    bet("1 Partner-gets-partner referrals", 24, 0.45, 100_000, "24 confirmed partners x 1 intro each (A); conv 45% = sourced warm 50% minus 5pt haircut"),
    bet("2 Alumni & creator intro sprint", 40, 0.40, 100_000, "2025 intros: 30 -> 17 confirmed (57%); scaled to 40, haircut to 40% (A)"),
    bet("3 Inbound sponsor page + deck", 30, 0.35, 90_000, "2025 inbound: 18 -> 7 (39%); 30 inbound (A) at 35%"),
    bet("4 Warm re-route of stalled cold opps", 26, 0.15, 55_000, "26 stalled opps (sourced); 15% close once a warm path is found (A); avg proposed ~₹55k"),
])
stretch = scenario("Stretch", 0.90, [
    bet("1 Partner-gets-partner referrals", 48, 0.45, 110_000, "2 intros per partner (A); +10% deal size via tiered packages (A)"),
    bet("2 Alumni & creator intro sprint", 60, 0.40, 110_000, "60 intros (A)"),
    bet("3 Inbound sponsor page + deck", 45, 0.35, 100_000, "45 inbound (A)"),
    bet("4 Warm re-route of stalled cold opps", 26, 0.25, 55_000, "25% close (A)"),
])
# Bet 5 = cash-collection discipline: lifts collection rate (base 80%, stretch 90%) vs ~65% no-policy assumption
no_policy_rate = 0.65
for sc in (base, stretch):
    sc["collection_bet_uplift"] = round(sc["confirmed_cash"] * (sc["collect_rate"] - no_policy_rate))

# Sensitivity: warm conversion halves
def sens(sc, factor):
    return round(sum(b["confirmed_cash"] * factor for b in sc["bets"]) * sc["collect_rate"])
out = dict(sourced=S, base=base, stretch=stretch,
           sensitivity=dict(base_if_conv_halves=sens(base, 0.5), stretch_if_conv_halves=sens(stretch, 0.5)),
           capacity=dict(owners=4, weeks=12, base_deals_per_owner_week=round(base["deals"] / 48, 2), stretch_deals_per_owner_week=round(stretch["deals"] / 48, 2)))
print(json.dumps(out, indent=1, ensure_ascii=False))
