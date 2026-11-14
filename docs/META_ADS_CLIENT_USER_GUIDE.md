# SpaceEzy Meta Ads — Client User Guide

This guide is written for **business owners, marketing managers and sales teams** — no
technical knowledge needed. It explains how to connect Meta, run campaigns, and read your
results.

> **Where things live:** every Meta Ads screen is under **MARKETING** in the left sidebar.
> Administrators see two extra items (Meta Connection, plus technical details inside screens)
> that non-administrators won't see — that's intentional.

---

## 1. First-time setup (administrator, once)

1. Go to **MARKETING → Meta Connection**.
2. Click **Connect Meta** and sign in to Meta when prompted. You'll be returned to the CRM
   automatically.
3. On the same page, choose:
   - **Ad account** — where your money is spent,
   - **Facebook Page** — the Page your ads appear from,
   - **Instagram account** (optional) — where Instagram ads appear from.
4. Click **Save selection**, then **Sync** to refresh the lists.

**How to tell you're connected:** the top of the page shows a green *Connected* status with the
ad account name. If it says *"Meta account not connected — configure Meta App credentials to
enable live integration."*, the connection hasn't been set up yet.

> App credentials, webhook settings and connection tests are technical and are shown to
> administrators only. Everyone else sees a note that administrators manage them.

## 2. Everyday navigation

| Sidebar item | What it's for |
| --- | --- |
| **Ads Overview** | Your business dashboard — spend, leads, cost per lead, bookings, ROI |
| **Ad Campaigns** | Create and manage campaigns and ad sets |
| **Creative Studio** | Upload photos/videos and build ad creatives |
| **Advertisements** | Pause, activate, rename, duplicate or delete individual ads |
| **Audiences** | Save groups of people to target (or exclude) |
| **Lead Forms & Sync** | Connect Meta lead forms to your CRM leads |
| **Performance** | Detailed analytics, funnel and suggestions |

**Permissions:** *Ads Overview, Ad Campaigns, Creative Studio, Advertisements, Audiences,
Lead Forms & Sync* and *Performance* are visible to anyone with marketing access. Creating,
editing, activating or deleting anything additionally needs marketing management access — if a
button is missing, ask an administrator.

## 3. Creating your first campaign

**Step 1 — Campaign** (`Ad Campaigns → New campaign`)

- Give it a name (anything you'll recognise later).
- Pick an **objective** in plain words, e.g. *Leads*.
- Choose your **project** the campaign promotes.
- Set a **daily or lifetime budget in rupees** (e.g. `5000`).
- Optionally set start/end dates.

**Step 2 — Ad set** (who sees it) — a 4-step guided wizard:

1. **Budget & delivery** — name, budget, schedule, how you're charged, what to optimise for.
   For lead ads, pick your **Facebook Page** from the dropdown.
2. **Targeting** — countries (e.g. `IN, AE`), age range, gender, where ads appear (Facebook,
   Instagram, feeds, stories, reels).
3. **Audiences** — include or exclude saved audiences.
4. **Review** — a plain-language summary of everything, then **Validate** (Meta checks it
   without saving anything) and **Create**.

**Step 3 — Creative** (`Creative Studio`)

1. Upload a photo or video (the app tells you immediately if the file type or size isn't
   supported).
2. Write your **primary text**, **headline** and **description**, pick a **button** (e.g.
   *Learn More*, *Sign Up*) and a destination link.
3. Watch the **draft preview** update as you type.
4. **Validate with Meta**, then save.

**Step 4 — Advertisement** (`Advertisements → New advertisement`)

1. Choose the campaign and ad set.
2. Choose the creative.
3. Name it → **Validate with Meta** → **Create paused advertisement**.

## 4. The golden safety rules

These are deliberate design choices — they protect your budget:

- ✅ **Every new campaign, ad set and ad is created PAUSED.** Nothing starts running by itself.
- ✅ **Activating always asks for confirmation** with a checkbox: *"I understand this ad will
  start delivering and may spend money."*
- ✅ **Deleting always asks for confirmation** and warns that it can't be undone.
- ✅ **Duplicating always creates a paused copy** — a copy never starts on its own.
- ✅ **Nothing is ever published, activated or re-budgeted automatically** by the system.
- ✅ **Suggestions on the Performance screen are advice only** — the system never changes your
  budgets, targeting, bids or status.

**To stop spending immediately:** open the ad (or find it in *Advertisements*) and click
**Pause**. It takes effect right away.

## 5. Reading your results

### Ads Overview (the business dashboard)

| Metric | Plain meaning |
| --- | --- |
| **Spend** | Total money spent in the period |
| **Leads** | Leads attributed to your ads |
| **Cost per lead** | Spend ÷ leads |
| **Qualified leads** | Leads your team marked as qualified |
| **Site visits / Quotations / Bookings** | How far leads progressed |
| **Cost per booking** | Spend ÷ bookings |
| **Booking value / ROI** | Value of bookings vs. what you spent |

If a metric shows **—**, there's no data for it yet (for example, no attributed leads) — it is
never filled in with an invented number. If Meta isn't connected, the screen says so plainly
and shows what to do.

### Performance (analytics)

- Pick a period (**Last 7/14/30/90 days** or custom dates).
- **KPI cards** show spend, impressions, clicks, leads and the ratios between them.
- The **funnel** shows: leads → contacted → qualified → site visits → quotations → bookings.
- **Campaign comparison** ranks your campaigns so you can see what's working.
- **Suggestions** are written as sentences you can act on, clearly labelled as advice, with an
  explanation of the benchmark used.

### Understanding the attribution notice

Sometimes Meta reports more leads than the CRM can match to a campaign. The dashboard shows
this as an **attribution gap** with real counts (e.g. *"Meta reported 12 leads; 9 are linked to
a campaign"*). This is reported honestly — leads are never guessed into a campaign.

## 6. Lead forms & sync

1. Open **Lead Forms & Sync**.
2. Pick your **Instant Form** from the dropdown.
3. **Map** each form question to the right CRM field (drag-free: choose from a list).
4. Run a **sync** to pull in older leads, or **retry** the ones that failed.
5. Check **history** to see what happened on each run.

Leads then appear in your normal **Leads** pipeline — follow up as usual.

> Enabling/disabling forms and saving field mappings is done by administrators; everyone else
> can view everything in plain language.

## 7. Troubleshooting

| You see | What it means | What to do |
| --- | --- | --- |
| *"Meta account not connected — configure Meta App credentials to enable live integration."* | Not connected yet | Administrator: **MARKETING → Meta Connection → Connect Meta** |
| *"Some required Meta permissions are missing"* | Meta access is incomplete | Administrator reviews the connection |
| *"No Pages are visible to this connection"* | Page access not granted | Administrator selects Pages in connection settings / Meta Business Manager |
| *"No Instant Forms found"* | No lead forms on your Pages yet, or Page access missing | Check the form exists in Meta; administrator checks Page access |
| A metric shows **—** | No data in that period | Widen the date range or check the campaign has leads |
| An ad says **In review** | Meta is reviewing it | Wait — Meta approves or rejects; the status shown is Meta's own |
| An ad says **Not approved** | Meta rejected it | Open the ad to see Meta's reason and edit the creative |
| A button is missing | Your role doesn't allow that action | Ask an administrator for marketing management access |

## 8. What this guide does not cover (administrators only)

App credentials, access tokens, webhook configuration, connection/token/permission tests,
credential rotation, raw Meta IDs and error codes, and config-source details are all
**administrator-only**. Client users never see secrets — the system only ever reports whether a
credential *exists*, never its value.

## 9. Good to know

- Statuses shown are **Meta's live delivery state** — the source of truth is Meta.
- Ad previews are **rendered by Meta** and expire after **24 hours**; the separate *draft
  preview* is a local composition and is labelled as such.
- Data in reports can lag by a few hours because that's how Meta reports it.
- Nothing here has been verified against a live Meta account in this environment — once real
  credentials are connected, these screens operate on live data.
