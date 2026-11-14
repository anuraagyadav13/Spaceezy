# Meta Ads — Phase 6: Analytics & Optimization

Status: **implemented and tested locally — NOT committed, NOT pushed, NOT deployed.** No
production change has been made. Every metric definition and Meta contract used here was
verified against Facebook's published `.md` reference docs, and **all tests use mocked Graph
responses only** — no live Meta credentials exist in this workspace, so nothing has been
verified against a real ad account.

Scope of this document: exactly what was built for Phase 6 (backend + frontend), the endpoints,
every calculation and its inputs, the CRM attribution model, the advisory recommendation engine,
test results, and what remains unverified.

---

## 1. What was delivered

### Backend

| Change | File |
| --- | --- |
| New analytics service: insights collection, metric computation, CRM funnel join, attribution-gap reporting, recommendation engine | `backend/src/services/metaAnalyticsService.js` (new, ~756 lines) |
| New controllers (4 handlers: overview, conversions, performance, recommendations) | `backend/src/controllers/metaAnalytics.js` (new) |
| Range/datePreset validation, performance level enum (`account`/`campaign`/`adset`/`ad`) | `backend/src/validators/metaAds.js` (extended) |
| 4 routes under RBAC `marketing:view` | `backend/src/routes/metaAds.js` (extended) |
| Audit/read logging for analytics access | `backend/src/utils/audit.js` |

**No new Prisma tables were added in Phase 6.** All CRM data is read live from existing models
(`Lead`, `SiteVisit`, `Quotation`, `Booking`) — see §5.

### Frontend

| Change | File |
| --- | --- |
| Date presets + formatters (`formatMoney`, `formatMetricNumber`, `formatPercent`, `isoDay`), recommendation labels, performance labels | `src/lib/metaAdsEnums.js` (extended) |
| API client: 4 analytics functions | `src/lib/api/metaAds.js` (extended) |
| **Business dashboard** — 10 StatCards, attribution-gap notice, campaign table, quick actions, honest disconnected state | `.../meta-ads/page.jsx` (rewritten) |
| **Analytics screen** — preset/custom range, KPI grid, 6-step funnel, attribution check, campaign comparison, advisory recommendations + benchmarks | `.../meta-ads/analytics/page.jsx` (new) |
| Sidebar: Ads Overview + Performance | `src/components/layouts/AppSidebar.jsx` |

## 2. Endpoints

All under `/api/v1/meta-ads`, all require `marketing:view`, all zod-validated.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/analytics/overview` | Date range + totals + per-campaign rows + CRM rollup + notes |
| GET | `/analytics/conversions` | Funnel, costs, attribution gap, by-campaign breakdown |
| GET | `/analytics/performance` | Insights at `level` = `account` \| `campaign` \| `adset` \| `ad` (+ creative performance) |
| GET | `/analytics/recommendations` | Advisory recommendations + benchmarks + disclaimer |

Common query: `datePreset` (`last_7d` / `last_14d` / `last_30d` / `last_90d`) **or** explicit
`since`/`until` (ISO dates, UTC). `datePreset → range` is converted locally and this is
documented as an approximation (a preset boundary is not identical to Meta's own boundary).

## 3. Calculations

All money is computed in **major units for display** and returned alongside Meta's
`account_currency`. A metric with a **zero denominator returns `null`** — never `0`, never a
guessed value.

| Metric | Formula |
| --- | --- |
| Spend | Σ `spend` (Meta, account currency) |
| Impressions / Reach / Clicks | Σ of the Meta fields |
| Frequency | `reach > 0 ? impressions / reach : null` |
| CTR | `impressions > 0 ? clicks / impressions × 100 : null` |
| CPC | `clicks > 0 ? spend / clicks : null` |
| CPM | `impressions > 0 ? spend / impressions × 1000 : null` |
| Leads (Meta) | Σ `actions.leadgen` |
| Cost per lead (CRM) | `attributedLeads > 0 ? spend / attributedLeads : null` |
| Cost per qualified lead | `qualified > 0 ? spend / qualified : null` |
| Cost per site visit / booking | `count > 0 ? spend / count : null` |
| ROAS | `spend > 0 ? actionValue / spend : null` |
| Net return | `actionValue − spend` |

**Creative-level caveats (honest by design):** reach, frequency, CTR, CPC and CPM are **not
summable** across creatives, so creative-group rows return `null` for those metrics rather than
a misleading sum. Creative performance is produced by joining **one bounded ads page (100) and
one creatives page (100)** to ad-level insight rows; unmatched rows report `creativeId: null`
plus a `creativeJoin` coverage report instead of being silently dropped.

## 4. Attribution model (gaps reported, never invented)

- **Attributed lead** = `Lead.metaCampaignId != null` within the requested period.
- **Contacted** = status ≠ `NEW`.
- **Qualified** ∈ {`QUALIFIED`, `SITE_VISIT`, `QUOTATION`, `NEGOTIATION`, `BOOKED`, `CLOSED`}.
- Downstream funnel stages (site visit, quotation, booking) are joined **cohort-based** to those
  attributed leads via `SiteVisit.leadId` / `Quotation.leadId` / `Booking.leadId`.
- CRM date boundaries are UTC with an **exclusive upper bound** (no double counting across days).
- **Attribution gap** = Meta `actions.leadgen` total vs. CRM attributed count. Reported as
  counts, never reconciled silently:
  `metaReportedLeads`, `crmAttributedLeads`, `unattributedLeads` (Meta leads with no CRM
  record), `crmBeyondMeta` (CRM leads Meta did not report), `missingMetaAdId`,
  `missingMetaAdsetId`.
- Every response carries a `notes[]` array stating the assumptions in plain language.

## 5. Database changes

**None.** Phase 6 introduces no tables, no columns and no migrations. The join is performed
live:

```
Meta insights (campaign/adset/ad rows)
   └── matched by Lead.metaCampaignId / metaAdsetId / metaAdId
         └── cohort-joined to SiteVisit / Quotation / Booking via leadId
```

This was the explicit design choice over materialising an attribution table: it avoids a new
source of truth drifting from Meta (the required source of truth) and avoids any destructive or
duplicative schema work. Existing Phase 1–4 models are untouched.

## 6. Recommendation engine (advisory only)

`buildRecommendations` is a **pure function** — it never calls Meta and never mutates anything.

- **Median-based** thresholds across the campaigns in range; **minimum sample of 2** before any
  recommendation is emitted (otherwise `insufficientData: true`).
- Rules:
  - `SPEND_WITHOUT_LEADS` — spend > 0 and zero attributed leads (absolute; short-circuits).
  - `ABOVE_MEDIAN_COST_PER_LEAD` — CPL > 1.5 × median.
  - `LOW_ENGAGEMENT` — CTR < 0.5 × median.
  - `BUDGET_INCREASE_CANDIDATE` — CPL ≤ 0.7 × median **and** CTR ≥ 1.5 × median **and**
    spend < median.
  - `HIGH_PERFORMING_CREATIVE` / `LOW_PERFORMING_CREATIVE` — from creative join.
- Warnings sort before opportunities; the payload always contains
  `"automated": false` and an `ADVISORY_DISCLAIMER`.
- **The engine can never change budgets, targeting, bids, status or spend.** There is no write
  path from `/analytics/recommendations` to any management endpoint, and no UI control on the
  analytics screen performs a mutation. Every recommendation is a sentence a human can act on.

## 7. RBAC

`marketing:view` for all four endpoints (SUPER_ADMIN, ADMIN, SALES_MANAGER). SALES_EXECUTIVE and
CHANNEL_PARTNER have no marketing permission and see a restricted state. Recommendations are
**not** gated separately — viewing advice is safe for all viewers because acting on it always
requires `marketing:manage` on the management screens.

## 8. Test results

| Suite | Tests | Status |
| --- | --- | --- |
| `backend/tests/meta-analytics.test.js` | 19 | ✅ passing |
| Full backend suite (44 suites) | 892 | ✅ passing (baseline 42/841) |
| Frontend | 44 | ✅ passing |
| ESLint / tsc / prisma / build / secret scan | clean | ✅ |

Covered: metric maths with zero denominators (`null` not `0`), frequency/CTR/CPC/CPM, CRM funnel
stage definitions, attribution-gap counts, UTC date boundaries, creative-join coverage and
non-summable metrics, recommendation rules incl. the minimum-sample gate and the absolute
`SPEND_WITHOUT_LEADS` short-circuit, `automated:false` invariant, and RBAC denials. All Graph
and Prisma calls mocked.

## 9. Limitations & what a live connection must verify

- **No live Meta credentials** — all insights and CRM joins are exercised with mocked data.
  Live currency handling, action-value availability and time-zone boundaries are **unverified**.
- Insights are **not real-time**; Meta typically lags by hours and may revise recent days.
- `datePreset → range` conversion is a local approximation (documented in `notes[]`).
- Attribution is only as good as `Lead.metaCampaignId/metaAdsetId/metaAdId` being populated —
  leads synced without campaign context appear as `unattributedLeads`, which is reported, not
  hidden.
- CRM-side bookings that never had a Meta lead are counted in `crmBeyondMeta`, not attributed
  back to ads.
- The recommendation engine needs ≥ 2 campaigns in range; a single-campaign account returns
  `insufficientData` rather than a bogus comparison.
- **Nothing in this phase is auto-optimised.** No budget, bid, targeting, status or spend is
  ever changed by the system.
