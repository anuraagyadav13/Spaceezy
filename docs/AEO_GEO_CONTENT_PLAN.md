# AEO / GEO audit and content plan

This document records the answer-engine (AEO) and generative-engine (GEO) work for the public Spaceezy website. It does not replace the technical SEO system in `docs/SEO_SYSTEM.md`.

## Strategic correction — real-estate firm, not a CRM product

Spaceezy is a real-estate firm. Its CRM is an internal operational tool for managing enquiries, inventory, follow-ups and site visits; it is not a publicly marketed software product. The earlier CRM-focused AEO pages have therefore been redirected to buyer-facing real-estate pages, removed from navigation and the sitemap, and removed from the discovery files. The AEO/GEO strategy now describes Spaceezy as a property business serving buyers in Wave City, Ghaziabad, Uttar Pradesh. No resale, seller, testimonial, award or ranking claims are published without evidence.

## Phase 1 — audit findings

Audited: public routes, metadata and canonical tags, `robots.txt`, `sitemap.xml`, JSON-LD, `llms.txt` / `llms-full.txt`, crawlable HTML, and documented/public product information. A code-first capability inventory was used to verify product claims.

### Foundation already in place

- Every public page uses the central metadata builder: absolute HTTPS canonical, unique title/description, OG/Twitter mirrors and robots driven by the indexability rules.
- `sitemap.xml` is generated from indexable, canonical URLs with real `lastmod`; `robots.txt` disallows only private routes and filter parameters.
- Organization and WebSite JSON-LD are emitted for the whole public area; project/unit/hub pages emit BreadcrumbList, ItemList, WebPage, ApartmentComplex, RealEstateListing and FAQPage where the underlying facts are visible.
- Before this work, `llms.txt` and `llms-full.txt` existed but did not describe the CRM product at all.
- Public HTML is server-rendered and crawlable without authentication; no private dashboard route is linked from the public area.

### AEO / GEO gaps identified

1. No public page answered common questions such as "What is a real estate CRM?" or "How do real estate teams manage leads and site visits?".
2. No product-entity description of Spaceezy CRM existed on the public site, so AI systems had no crawlable source for its actual capabilities.
3. FAQs existed only as project-detail facts; there were no educational FAQs tied to real product workflows.
4. `llms.txt` listed public inventory pages but omitted verified CRM features, target users and use cases.
5. No genuine third-party mentions, testimonials or case studies were available. These were **not** invented.

## Phase 2 — AEO implementation

Implemented three original, evidence-based real-estate pages, with the earlier CRM explainers redirected to them:

| URL | Primary question answered | Replaces |
| --- | --- | --- |
| `/property-buying-assistance` | What does Spaceezy do? Which properties and locations does it serve? Why buy with Spaceezy? | `/real-estate-crm` |
| `/property-enquiries` | How do I enquire about a property, and what happens next? | `/real-estate-crm/lead-management` |
| `/site-visits` | How do I arrange a site visit, and where? | `/real-estate-crm/site-visits` |

`/real-estate-crm/inventory` is redirected to the existing `/properties` page; no separate inventory article is published. All four old URLs use single-hop permanent redirects defined in `seo-content-redirects.json`.

Each new page uses descriptive H2/H3 headings, direct answers, verified examples and visible FAQs. FAQPage JSON-LD is generated from the exact visible Q&A. A Service JSON-LD block describes the real-estate assistance offered by Spaceezy; no rich-result eligibility is claimed. Copy is data-driven from `src/lib/aeo/realEstateContent.js`.

## Phase 3 — GEO implementation

- **Brand entity:** "Spaceezy" is used consistently. Organization schema uses `name: Spaceezy`, `legalName: Spaceezy Real Estate`, service area and contact details. RealEstateAgent schema is now emitted across the public area, not only the homepage.
- **Business entity:** Service schema describes property buying assistance, enquiries and site visits — not CRM software. The CRM is mentioned only as an internal operational tool in the discovery files.
- **Authority and trust:** leadership names on `/about` are retained. No testimonials, ratings, case studies or external citations were created because none were verified.
- **AI discoverability:** pages are server-rendered, self-canonical, in the sitemap and linked from header/footer. `robots.txt` was not opened beyond existing public routes.

### Claims deliberately excluded

Resale or seller services (no published inventory or service page), testimonials, case studies, awards, rankings, transaction counts, and CRM software positioning. Placeholder CRM features are not marketed publicly.

## Phase 4 — AI discovery files

`public/llms.txt` and `public/llms-full.txt` now describe Spaceezy as a real-estate firm with verified service categories, served locations, published projects/properties and buyer resources. The CRM URLs are removed and the CRM is referenced only as internal operations. `scripts/llms-validate.mjs` checks structure, canonical HTTPS links, private-path exclusion and live 200/canonical responses.

`llms.txt` is an emerging convention, not a guaranteed AI ranking or indexing factor.

## Phase 5 — content strategy

| Target question | Asset | Status |
| --- | --- | --- |
| What does Spaceezy do? | `/property-buying-assistance` | Implemented |
| Which properties and locations does Spaceezy serve? | `/property-buying-assistance`, `/projects`, `/properties` | Implemented |
| Why buy with Spaceezy? | `/property-buying-assistance` FAQ | Implemented |
| How do I enquire about a property? | `/property-enquiries` | Implemented |
| How do I arrange a site visit? | `/site-visits` | Implemented |
| Are prices and availability current? | `/property-enquiries` FAQ | Implemented |
| Resale properties and seller services | Requires published inventory or a verified service | Planned — no public evidence yet |
| Genuine customer case studies | Requires consent, real numbers and named reviewer | Planned — blocked on real data |
| Genuine client testimonials | Requires approval to publish | Planned — blocked on consent |
| Comparison pages | Requires verified differentiators and legal review | Planned — no claims published yet |
| Author/expert bylines | Requires a real named reviewer | Planned |

### Governance

- Every new claim must map to a verified public page or verified implementation file.
- Update `src/lib/aeo/crmContent.js`, the metadata entries, sitemap paths and both llms files together.
- Re-run `npm run seo:llms` and the crawl after each content change.
- Do not add thin, keyword-stuffed or duplicated FAQ pages; extend existing guides instead.
