# AEO / GEO audit and content plan

This document records the answer-engine (AEO) and generative-engine (GEO) work for the public Spaceezy website. It does not replace the technical SEO system in `docs/SEO_SYSTEM.md`.

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

Implemented four original, evidence-based public pages:

| URL | Primary question answered |
| --- | --- |
| `/real-estate-crm` | What is a real estate CRM? Which CRM suits real estate businesses? What features should it provide? |
| `/real-estate-crm/lead-management` | How do real estate companies manage leads? How are builder enquiries tracked? How is a sales pipeline managed? |
| `/real-estate-crm/site-visits` | How can real estate teams manage site visits? |
| `/real-estate-crm/inventory` | How are property inventory and availability managed in a sales workflow? |

Each page uses descriptive H2/H3 headings, direct answers, practical examples grounded in the verified workflows, visible FAQs, and internal links to relevant public pages. FAQPage JSON-LD is generated from the exact visible questions and answers. A Service JSON-LD block describes the CRM as a service provided by Spaceezy; no rich-result eligibility is claimed.

All copy is data-driven from `src/lib/aeo/crmContent.js`, so the visible text and schema stay in sync.

## Phase 3 — GEO implementation

- **Brand entity:** "Spaceezy" is used consistently. Organization/WebSite schema already provides the canonical entity reference from every public page.
- **Product entity:** the CRM is described with verified capabilities, role-based users and real use cases. Placeholders and unimplemented features are explicitly excluded from public copy.
- **Authority and trust:** leadership names already published on `/about` are retained. No testimonials, ratings, case studies or external citations were created because none were verified. Genuine case studies require customer consent and real outcomes.
- **AI discoverability:** new pages are server-rendered, self-canonical, in the sitemap and linked from header/footer plus the CRM hub. `robots.txt` was not opened beyond existing public routes.

### Claims deliberately excluded

Bulk lead import from spreadsheets, commission calculation, customer self-service portal, payment gateway, multi-tenancy, automated retention scheduler, telephony presence, and any ranking, pricing or conversion-rate promise. These are absent, partial or unverified in the codebase.

## Phase 4 — AI discovery files

`public/llms.txt` now includes a Real Estate CRM section with verified features, target users, use cases and the four new canonical URLs. `public/llms-full.txt` expands each capability and repeats the exclusions. `scripts/llms-validate.mjs` checks structure, canonical HTTPS links, private-path exclusion and live 200/canonical responses.

`llms.txt` is an emerging convention, not a guaranteed AI ranking or indexing factor.

## Phase 5 — content strategy

| Target question | Asset | Status |
| --- | --- | --- |
| What is a real estate CRM? | `/real-estate-crm` | Implemented |
| Which CRM is suitable for real estate businesses? | `/real-estate-crm` checklist section | Implemented |
| What features should a real estate CRM provide? | `/real-estate-crm` capability section | Implemented |
| How do real estate companies manage leads? | `/real-estate-crm/lead-management` | Implemented |
| How can builders track property enquiries? | Lead-management guide + `/enquiry` | Implemented |
| How can property dealers manage their sales pipeline? | Lead-management guide | Implemented |
| How can real estate teams manage site visits? | `/real-estate-crm/site-visits` | Implemented |
| How is property inventory and availability tracked? | `/real-estate-crm/inventory` | Implemented |
| How can real estate businesses improve lead conversion? | CRM FAQ (process only, no promised rate) | Implemented |
| Genuine customer case studies | Requires consent, real numbers and named reviewer | Planned — blocked on real data |
| Genuine client testimonials | Requires approval to publish | Planned — blocked on consent |
| Comparison pages | Requires verified differentiators and legal review | Planned — no claims published yet |
| Author/expert bylines | Requires a real named reviewer | Planned |

### Governance

- Every new claim must map to a verified public page or verified implementation file.
- Update `src/lib/aeo/crmContent.js`, the metadata entries, sitemap paths and both llms files together.
- Re-run `npm run seo:llms` and the crawl after each content change.
- Do not add thin, keyword-stuffed or duplicated FAQ pages; extend existing guides instead.
