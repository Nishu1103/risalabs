# CampusFest 2025 — Sponsorship Growth Center

**Author: Nishant Kumawat**

**RISA Labs Growth APM Assignment · Challenge B: Sponsorship Growth (maximise sponsorship cash collected before the festival)**

A working command center for a college-fest sponsorship team. It has snapshot-accurate funnel analytics, a pipeline and campaign manager with persistent edits, an execution task tracker, and an embedded **AI Growth Analyst & Copilot**. The copilot answers only from live database state through deterministic tools, and it turns insights into tasks after the user confirms.

<!-- TODO: paste final URLs before submitting -->

| | |
|---|---|
| Live Demo (Vercel) | `<your Vercel URL>` |
| 3-Slide Strategy Deck (PDF) | `<link / PDF>` |
| Stack | Next.js 15 (App Router, TS strict) · Tailwind 4 · Recharts · Postgres (Supabase) via `pg` · Google Gemini function calling (`@google/genai`) |
| Tests | `npm run verify` (55 ground-truth assertions) · `npm run test:copilot` (tool-calling loop against a mocked Gemini) · `npm run build` (0 TS / ESLint errors) |

---

## Overview

The 2025 book already qualified enough brands (60 vs a revised goal of 55). It missed confirmed partnerships (24 vs 28) because 87% of attempts went to cold outbound that closed nothing, and because the source file has no bank receipts: reported confirmed cash is ₹20,00,000 and cash collected is ₹0 until someone logs a payment. The next-edition plan in `strategy/model.py` puts the next 120–179 attempts into the motions that already converted, then collects 80–90% of that cash before the fest.

## 2-Minute Reviewer Test Guide

Start at http://localhost:3000 (or the Vercel URL) on snapshot **20 Apr 2025**.

1. **Time-travel check.** Click **Feb 28**. The target chip switches to **Sponsor launch plan (40 qualified / 20 confirmed)**. Confirmed partnerships read **8**. March and April stage changes do not appear. (15 Mar is the first day on **Sponsor revised plan, 55 / 28**.)
2. **Data hygiene check.** Click **Data hygiene · 6 dupes removed**. The modal lists six identical import-retry copies, each raw 2 / kept 1: interactions `SI00110`, `SI00019`, `SI00001`; qualification `BQ0003`; opportunity history `OH00015`, `OH00001`. Sheet totals: interactions 953 → 950, qualification 434 → 433, opportunity history 230 → 228.
3. **Live mutation and persistence.** Open **Pipeline**, open **Beardo (O001)**, and log a **₹1,00,000** payment. Refresh. Overview **cash collected** moves from ₹0 to ₹1,00,000. Reported confirmed cash stays ₹20,00,000. Scrub to 19 Apr and the payment is not in that snapshot.
4. **AI Copilot epistemic honesty.** Open **Ask Copilot** and ask, one at a time: *"How much cash is in the bank?"*, *"Did Beardo's activation increase attendees?"*, and *"What is our CAC?"*. Open **Evidence** on each answer. Bank cash is user-logged receipts (₹0 until step 3), separate from ₹20.00L reported cash and ₹2.40L in-kind. Beardo is an observational link to Creator Partners, not an attendance effect. CAC is refused: spend is not in the dataset.
5. **Closed-loop action and reset.** Ask the copilot to create a task for **Riya Kapoor**. Nothing is written until you click **Confirm & create task**. The task then appears on `/tasks` with an AI badge. Click **Reset to original dataset** and enter reset token `nishant`. Cash collected returns to ₹0, confirmed partnerships to 24, opportunities to 58, and the extra task is gone. The four seed tasks come back.

---

## 1. What the data says (the diagnosis that drives everything)

All numbers are computed by `lib/analytics.ts` and asserted in `scripts/verify.ts`. They were cross-checked independently in pandas.

| Finding (snapshot 2025-04-20) | Number |
|---|---|
| Duplicate source rows removed (import retries) | **6** (interactions 953→950, qualification 434→433, opp history 230→228) |
| Qualified brands vs revised target | **60 / 55** (qualification is not the bottleneck) |
| Confirmed partnerships vs revised target | **24 / 28** |
| Reported confirmed value | **₹20,00,000 cash** (20 deals) + **₹2,40,000 in-kind** (4 deals) |
| Cash actually proven in the bank | **₹0**: the source has no receipts |
| Warm / inbound channels (SC02, SC04, SC05) | 48 attempts (13%) → **24 of 24 confirmed deals** |
| Cold outbound (SC01, SC03, SC06) | 322 attempts (87%) → **0 confirmed**, holding **all 26 open opps (₹14.40L)** |
| Avg time from opp created to confirmed | **10.2 days** (min 5.0, max 13.1) |
| Last stage change in the source | **2025-04-03**. The fest ran 12–13 Apr, so on 20 Apr the open pipeline is effectively dead |

Per-campaign cash confirmed, asserted in `verify.ts`: SC05 ₹7,25,000 (9 deals), SC02 ₹6,40,000 (8), SC04 ₹6,35,000 (7). Those three sum to the ₹20,00,000 cash book. Including in-kind, the same three campaigns are ₹7,85,000 / ₹7,85,000 / ₹6,70,000, which sums to the ₹22,40,000 total confirmed book (₹20,00,000 cash + ₹2,40,000 in-kind). The app shows both.

Campaign decisions on the default thresholds in `lib/analytics.ts` (`Scale` if confirmed ≥ 3 and win rate ≥ 50%; `Kill` if attempts ≥ 40, 0 confirmed, and meeting rate < 15%; `Pivot` if attempts ≥ 20 and 0 confirmed): **SC01 Kill, SC03 Pivot, SC06 Pivot, SC02 / SC04 / SC05 Scale**.

## 2. Sourced facts vs assumptions

| Item | Type | Where it lives |
|---|---|---|
| Brands, contacts, campaigns, interactions, qualification and stage histories, targets, activations | **Sourced** | `data/Sponsor Dataset.xlsx` → source tables (`source='dataset'`) |
| `confirmed_value_inr` | Sourced, **reported value, not a bank receipt** | Labelled as such in every KPI and in copilot answers |
| Cash collected | **User-logged** | `payments` table (Pipeline → deal → Log payment). Starts at ₹0 |
| Stage edits, new opps, new interactions, qualification changes | **User-logged**, append-only | Same tables, `source='app'`, new versions only |
| Campaign budgets / spend | **Assumption** (no spend data in source) | `campaign_budgets` with a `basis` column. Editable. Purple "Assumption" tag |
| Scale / Pivot / Kill thresholds | **Assumption** (policy) | Editable on the Campaigns page. Defaults in `lib/analytics.ts` |
| Strategy model rates (collection %, haircuts, volumes) | **Assumption** | `strategy/model.py`, every input labelled `(A)` in the bet note |
| City research (Inc42, Techfest, Mood Indigo) | **Directional context, not a model input** | Linked in section 6. None of those rupee or CAGR figures enter `model.py` |
| Activation → attendee impact | **Not knowable** | Copilot refuses to claim causality |

## 3. Data rules implemented

- **Deduplication on ingest** (`lib/dataset.ts`): identical rows with the same stable ID are dropped and logged to `data_hygiene_logs`. If the same ID arrives with a *different* payload, the import aborts instead of silently picking one. The UI's "Data hygiene" badge lists every removed ID.
- **Snapshot = end of the selected day in IST** (`D 23:59:59+05:30`). Excel stores naive IST wall-clock times, so the parser reads them as IST explicitly.
- **Full-state histories** (targets, qualification, opportunity stage): latest version per entity with `effective_at ≤ cutoff`. Versions are never summed and never read from the future. Events (interactions, payments, activations) are filtered by timestamp. Static entities exist from `created_at`.
- **Populations kept distinct**: the funnel counts *brands* at each stage. Opportunities (58 across 57 brands), contacts and attempts are separate populations and labelled as such.
- **Edits are append-only**: changing a stage *inserts* a new `opportunity_history` version stamped at the end of the selected snapshot day. That way the change shows at that date and later, and earlier snapshots stay untouched. Editing behind a later version is rejected with an explanation.

## 4. Product tour

| View | What it does |
|---|---|
| **Top bar** | Snapshot date picker + scrubber + jump chips (launch, Feb 28, target revision, eve of fest, final), data-hygiene modal, Reset to original dataset |
| **Overview** | Ranked automated diagnostics (channel mix, stuck deals, post-event open pipeline, uncollected cash, target gaps) · KPI strip with Sourced / User-logged tags · brand-level funnel with stage conversions · targets-vs-actuals weekly chart · warm-vs-cold channel matrix · industry and stage breakdowns |
| **Pipeline** | Table/Kanban of all opportunities · filters · configurable stuck-deal threshold · drawer to append a new version (stage, values, support type, owner, effective date) · log payments · change brand qualification · full version history (future versions greyed) · new opportunity (incl. new brand) · log interaction |
| **Campaigns & Bets** | Per-campaign attempts → confirmed with win rate, meeting rate, assumed budget and cost/deal · **Scale / Pivot / Kill** decisions with the rule that fired (thresholds editable live) · add and track new strategic bets |
| **Execution & Tasks** | Kanban CRUD with owners, due dates (overdue vs snapshot), priority, links to deals/campaigns · AI-generated badge |
| **Copilot drawer** | Available on every page; see below |

## 5. AI Copilot architecture

`POST /api/copilot` runs a Gemini function-calling loop (up to 8 steps). The model sees **tool results only**, never raw tables, and every tool is deterministic TypeScript on top of the same `computeSnapshot()` the dashboard uses (`lib/copilot-tools.ts`):

| Tool | Purpose |
|---|---|
| `get_executive_summary(as_of_date)` | KPIs, funnel, targets, gaps, cash vs in-kind, cash collected, diagnostics |
| `get_campaign_performance(as_of_date, campaign_id?)` | Per-campaign metrics, warm/cold groups, decisions + thresholds, budget-assumption note |
| `get_pipeline_diagnostics(as_of_date, stage_filter?, owner_name?, stalled_days_threshold?)` | Open/stalled deals, owner workload, value at risk, post-event open deals |
| `get_brand_and_activations(brand_name?, as_of_date?)` | Fuzzy brand lookup: qualification history, contacts, opps with history, outreach summary, activation links with causal caveat |
| `compare_snapshots(date_a, date_b)` | What changed between two dates (trend questions) |
| `simulate_scenario(target_cash_inr, assumed_collection_rate, extra_warm_deals)` | Deterministic projection; shows its math and labels its assumptions |
| `list_tasks(status?)` | Execution state |
| `check_data_availability(topic)` | Catalogue of what exists and what doesn't (CAC, spend, open rates, venue cost, bank receipts, attendee uplift…) with closest proxies |
| `calculate(expression)` | Safe exact arithmetic (no `eval`) |
| `propose_action_task(...)` | **Writes nothing.** Returns a pending card. The user edits it if needed and clicks **Confirm & create task** → `POST /api/tasks` with `created_by='ai_copilot'` |

The system prompt enforces: numbers only from tool results in the current turn; arithmetic only via `calculate`; `check_data_availability` before any unseen metric; an Answer → Evidence → Assumptions → Next step structure; no causal claims; budgets always labelled as assumptions. Each answer shows an expandable **Evidence** panel with every tool call and its JSON result. Follow-ups work because conversation history is replayed, but numbers are re-fetched every turn, so the copilot reflects edits immediately.

**Model**: `gemini-3.1-flash-lite` by default, with automatic fallback to `gemini-3-flash-preview` on API `v1beta`. A live call with this project's key returns 404 for `gemini-2.5-flash` and `gemini-2.0-flash` ("no longer available"). The preview model is limited to 5 free-tier requests per minute, so a 429 or a 504 falls through to the next model, or returns that HTTP status instead of 500. Override with `GEMINI_MODEL` (comma-separated preference list).

### Tested edge cases

| Prompt | Expected behaviour |
|---|---|
| "How much cash is actually in our bank?" | ₹20.00L is *reported* confirmed cash. User-logged receipts = ₹0 (or the logged sum). The source has no bank receipts |
| "Did Beardo's activation increase attendance?" | Shows the observational link (Beardo → Creator Partners, 2025-03-10). No attendee counts or control group, so causality can't be established |
| "What's our CAC / ad spend / email open rate / venue cost?" | Not in the dataset, so it refuses to estimate. Offers proxies (attempts per deal; budgets are assumptions) |
| "Which stalled deals first? Make a task" | Ranks by value × days idle and proposes a task; nothing is written until the user confirms |
| Change a deal in Pipeline, then ask again | The answer reflects the edit (state is reloaded on every request) |
| Scrub to 2025-02-28 and ask about targets | Launch plan (40/20), 8 confirmed; nothing from March/April |

`npm run test:copilot` runs the real route and the real SDK against a mocked Gemini endpoint. It verifies multi-step tool calls, matching `functionResponse` IDs, grounded tool output (SC01 = 224 attempts, 0 confirmed, Kill), no task written without confirmation, the default model (`gemini-3.1-flash-lite`), and fallback to `gemini-3-flash-preview` on a 404.

## 6. Detailed calculations and prioritization

`python3 strategy/model.py` is the only source of the deck math. Every sourced input below is the 2025-04-20 figure asserted by `npm run verify`. Every `(A)` input is an assumption inside that file. Figures below are the script's JSON, not rounded lakhs.

### Funnel identity

```
warm_conv   = warm_confirmed / warm_attempts                         = 24 / 48 = 0.50
cash_share  = cash_deals / (cash_deals + in_kind_deals)              = 20 / 24 = 0.8333333333333334

deals            = attempts × conv
cash_deals       = deals × cash_share
confirmed_cash   = round(cash_deals × avg_ticket)
collected        = round(sum(confirmed_cash) × pre_fest_collection_rate)
```

`round` is Python 3 `round`. Bet 5 does not add attempts. It changes the collection rate versus a labelled no-policy rate of **0.65**:

```
collection_uplift = round(sum(confirmed_cash) × (collect_rate − 0.65))
```

Downside multiplies every bet's confirmed cash by 0.5, then applies that scenario's collection rate:

```
collected_if_conv_halves = round(sum(confirmed_cash × 0.5) × collect_rate)
```

| Scenario | Attempts | Deals | Confirmed cash | Collection rate | Collected before the fest |
|---|---:|---:|---:|---:|---:|
| 2025 (sourced) | 370 | 24 | ₹20,00,000 | unknown | **₹0 proven** |
| Base | 120 | 41.2 | ₹31,99,583 | 80% | **₹25,59,666** |
| Stretch | 179 | 67.8 | ₹57,90,417 | 90% | **₹52,11,375** |
| Downside, base (conversion × 0.5) | | | | 80% | **₹12,79,833** |
| Downside, stretch (conversion × 0.5) | | | | 90% | **₹26,05,688** |

Capacity in the same file: 4 owners × 12 weeks. Base is **0.86** deals per owner-week (41.2 / 48). Stretch is **1.41** (67.8 / 48).

### Five bets, ranked by ₹ impact

Framework: **₹ impact × confidence ÷ effort**. `model.py` does not store numeric confidence or effort weights, so it does not emit a composite score. Rank below is by the only rupee term the file computes (base confirmed cash). Confidence and effort are the bet note in that file. Collection discipline is ranked on its own unit, incremental cash versus the 65% no-policy rate, so it is not sorted against confirmed-cash bets.

| Rank | Bet | Prioritization (₹ impact × confidence ÷ effort) | Decision | Expected cash, base vs stretch | Primary risk / threshold |
|---|---|---|---|---|---|
| 1 | Alumni and creator intro sprint | Impact ₹13,33,333. Confidence: 2025 intros 17/30 (SC02 8/9 + SC05 9/21), noted as 57%, haircut to 40% (A). Effort: 40 intros base, 60 stretch (A). | Double down | ₹13,33,333 → ₹22,00,000 confirmed | Haircut from 17/30 to 40%. Stretch also assumes a ₹1,10,000 ticket. |
| 2 | Partner-gets-partner referrals | Impact ₹9,00,000. Confidence: sourced warm conversion 50% minus a 5pt haircut = 45% (A). Effort: 24 intros (1 per 2025 partner); stretch 48 (2 per partner, A). | Double down | ₹9,00,000 → ₹19,80,000 confirmed | Depends on partners actually introducing someone. Ticket ₹1,00,000 base, ₹1,10,000 stretch (A). |
| 3 | Inbound sponsor page + deck | Impact ₹7,87,500. Confidence: 2025 inbound 7/18 (SC04), noted as 39%, run at 35% (A). Effort: 30 inbound base, 45 stretch (A). | Double down | ₹7,87,500 → ₹13,12,500 confirmed | Base ticket is ₹90,000, below the ₹1,00,000 sourced average. Volume is assumed. |
| 4 | Cash-collection discipline | Impact is incremental collected cash, not new deals: ₹4,79,937 base, ₹14,47,604 stretch. Confidence: 2025 collection is unobserved (₹0 receipts). Effort: invoice chase on the book above, not more attempts. | Double down | +₹4,79,937 at 80% vs +₹14,47,604 at 90%, both versus a 65% no-policy rate (A) | If nobody chases invoices, collected cash stays at the 65% case. This bet adds ₹0 of confirmed value. |
| 5 | Warm re-route of stalled cold opps | Impact ₹1,78,750. Confidence: 15% close once a warm path exists (A); no 2025 cold deal closed. Effort: the 26 sourced open opps, same count in stretch. | Pivot | ₹1,78,750 → ₹2,97,917 confirmed | 15% base / 25% stretch are assumptions. Average ticket ₹55,000. Fails if no warm path is found. |

**Kill** is not a sixth bet. It is the live campaign rule on cold email: SC01 has 224 attempts and 0 confirmed, which fires Kill (attempts ≥ 40, 0 confirmed, meeting rate under 15%). Those attempts are not repeated in the model.

### Why Mumbai

Mumbai is the city choice because it is the media and distribution hub for consumer brands and already hosts a college-fest sponsor market. This paragraph is context for the deck. **None of these figures are inputs to `strategy/model.py`.**

- [Inc42, "Delhi NCR Emerges As India's Top D2C Hub"](https://inc42.com/buzz/delhi-ncr-emerges-as-indias-top-d2c-hub/) (13 May 2026), citing Inc42 Datalabs' [D2C 3.0 report](https://inc42.com/reports/d2c-3-0-the-next-big-wave-in-indian-ecommerce-report-2026/): among Delhi NCR, Mumbai, and Bengaluru, Mumbai's D2C funding CAGR was **27% during 2020–25**, the fastest of the three, and the article describes Mumbai as the media and distribution centre. Delhi NCR led total funding.
- [Business Standard, "IIT Bombay's Techfest to kick off tomorrow"](https://www.business-standard.com/article/current-affairs/iit-bombay-s-techfest-to-kick-off-tomorrow-115010100476_1.html) (1 Jan 2015): Techfest budget ₹2 crore that edition, ₹1.68 crore the year before, with a corporate title sponsor.
- [Indian Express, "Campus buzz: College fest sponsorship up, IIT tops with Rs 2.5 cr"](https://indianexpress.com/article/cities/mumbai/campus-buzz-college-fest-sponsorship-up-iit-tops-with-rs-2-5-cr/) (14 Jan 2016): Techfest sponsorship reported at ₹2.5 crore, from ₹2 crore the prior year.
- [DNA India, "Brands rule at IIT-Bombay fest"](https://www.dnaindia.com/mumbai/report-brands-rule-at-iit-bombay-fest-1140945): Mood Indigo described with corporate sponsorship of more than ₹1 crore, and the piece notes an alumni / reference-sponsorship pattern.

## 7. Setup

```bash
npm install
cp .env.example .env.local        # add DATABASE_URL and GEMINI_API_KEY
npm run seed                      # applies supabase/schema.sql and loads the xlsx
npm run verify                    # 55 ground-truth checks
npm run test:copilot              # copilot loop checks (no API key needed)
npm run dev                       # http://localhost:3000
```

**Supabase**: create a free project → Project → Connect → copy the **Transaction pooler** URI (port 6543) into `DATABASE_URL`. Then run `npm run seed` from your machine, or paste `supabase/schema.sql` into the SQL editor and press "Reset to original dataset" in the app.

**Gemini**: free key at https://aistudio.google.com/apikey → `GEMINI_API_KEY`. Leave `GEMINI_MODEL` at `gemini-3.1-flash-lite,gemini-3-flash-preview`.

**Vercel**: import the repo → add `DATABASE_URL`, `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` and `RESET_TOKEN` → deploy. `next.config.ts` sets `outputFileTracingRoot` and traces `data/Sponsor Dataset.xlsx` into `/api/reset`, so reset works on serverless.

**Reset token**: the local demo sets `RESET_TOKEN=nishant`. The reset dialog asks for it and sends `x-reset-token`. Leave the env var empty only if the demo should reset with no token.

## 8. Tools, plans, and what was reused, modified, and verified

RISA's ask: name the tools and plans, link the sources, and say what was reused, modified, and verified.

| Tool / platform | Plan used | Role | What was reused / modified / verified |
|---|---|---|---|
| Next.js 15.5, React 19, Tailwind 4, Recharts | Open source | App shell, pages, charts | **Reused** the framework, Tailwind, and Recharts. **Modified** into the snapshot UI, pipeline, campaigns, and tasks. **Verified** with `npx tsc --noEmit`, `npm run lint`, and `npm run build` (exit 0) plus the reviewer clicks in the 2-minute guide. |
| Supabase Postgres + `pg` | Free tier, transaction pooler port 6543 | System of record | **Reused** Supabase and `node-postgres`. **Modified** `supabase/schema.sql` for append-only histories, payments, tasks, and hygiene logs. **Verified** by `npm run seed` and `npm run verify` against the live database (180 brands, 270 contacts, 58 opportunities, 6 hygiene rows). |
| Vercel | Hobby / free tier | Hosting | **Reused** the Next.js deploy path. **Modified** `next.config.ts` so the tracing root is this repo and the xlsx is included in the reset function. **Verified** by a production `next build` whose reset trace contains `Sponsor Dataset.xlsx`. |
| Google AI Studio / Gemini API (`@google/genai`) | Free tier | Copilot function calling | **Reused** the SDK. **Modified** the client to API `v1beta`, default model `gemini-3.1-flash-lite`, fallback `gemini-3-flash-preview`. **Verified live**: `gemini-2.5-flash` and `gemini-2.0-flash` return 404 ("no longer available"); preview is 5 requests/minute, so 429 and 504 fall through or return that status. Six live questions (bank receipts, Beardo causality, missing CAC, task proposal, cash after a ₹1,50,000 payment, reset back to baseline) were answered from tool traces. |
| Claude and Cursor | AI pair-programming | Code, tests, and this README | **Reused** as a drafting partner only. **Modified** by hand: business logic, SQL, and dataset math are in `lib/analytics.ts`, `lib/dataset.ts`, and `strategy/model.py`. **Verified** independently by `scripts/verify.ts` (55/55), a pandas cross-check of the same xlsx, `npm run test:copilot`, and 60 live HTTP checks (CRUD, history versioning, as-of isolation, bad dates → 400, reset without token → 401). |
| ExcelJS | Open source | Read `Sponsor Dataset.xlsx` | **Reused** to parse the workbook. **Modified** so naive Excel times are read as IST. **Verified** by the dedupe counts in `verify.ts` (953/950, 434/433, 230/228). |

## 9. Verification and live QA

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npm run lint`, `npm run build` | Exit 0. Production build traces `data/Sponsor Dataset.xlsx` into `/api/reset`. |
| `npm run verify` | **55/55**. Ground truth on 20 Apr 2025, Feb 28 launch plan with 8 confirmed and zero March/April leakage, 14 Mar launch vs 15 Mar revised, in-memory mutation that does not leak into 19 Apr, and copilot tools (`calculate`, CAC unavailable). |
| `npm run test:copilot` | Pass. Mocked multi-step tool loop, matching function-response IDs, SC01 = 224 attempts / 0 confirmed / Kill, no task written, default `gemini-3.1-flash-lite`, fallback to `gemini-3-flash-preview` on 404. |
| Live QA | **60** HTTP checks: opportunity history appends and stays invisible on the day before `effective_date`; a ₹1,00,000 payment on O001 persists in cash collected; campaigns, interactions, brands, and tasks CRUD; invalid JSON and impossible dates return 400; reset without the token returns 401 and with the token restores cash ₹0, 24 confirmed, 58 opportunities, 60 qualified. **6** live Gemini calls on `gemini-3.1-flash-lite` covered the channel gap (24/28, cold = 0 deals and 87% of attempts), bank receipts (₹0 vs ₹20.00L reported cash and ₹2.40L in-kind), Beardo with no causal attendee claim, CAC refusal, a Riya Kapoor task that stayed pending until confirm, and ₹1,50,000 collected after that payment was logged. |

## 10. Known limitations

- Single-tenant demo: no auth, so anyone with the link can edit. Set `RESET_TOKEN` so reset requires the token. The UI sends it from the reset dialog.
- Campaign attribution is the originating campaign recorded on the opportunity, which is an association, not causation.
- The funnel stages are independent brand populations, not a strictly nested cohort, as the source guide warns.
- Budgets and the strategy's collection rates, haircuts, and attempt volumes are assumptions. The source contains no spend or payment data. City articles in section 6 are not model inputs.
- `strategy/model.py` ranks bets by rupee impact. It does not multiply numeric confidence and effort into a second score.
- Analytics load the full (small) dataset per request, which is fine for thousands of rows. Larger data would move into SQL views.
- Copilot quality depends on the Gemini model. Grounding is enforced by tools and the prompt, but an LLM can still mis-add a total. The Evidence panel is the check, and the prompt forbids a total that did not come back from a tool or from `calculate`.
