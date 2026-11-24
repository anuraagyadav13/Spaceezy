# Adding a project, unit or new location (for non-developers)

You do **not** edit website code to add a property. Everything on the public
site is generated from what is saved in the CRM. Once a record is published,
the website picks it up within about a minute.

## Before you publish: fill these fields

A project page is only shown to search engines when the important facts are
present. If something is missing, the page still works for visitors, but it is
marked "noindex" and left out of the sitemap until the data is complete. The
CRM shows a warning listing exactly what is missing.

For a **project**, fill in:

1. Project name and a public URL slug (the CRM creates one automatically).
2. Location — region/locality, district or city, and state. Adding a location
   that has never been used before automatically creates its
   `/properties-in-{place}`, `/flats-in-{place}` and BHK listing pages.
3. At least one configuration (for example a 2 BHK or 3 BHK option).
4. A starting price (and maximum price if there is a range).
5. Possession date and RERA registration number/authority.
6. At least one amenity, at least three gallery photos, and a project
   description of at least 300 characters. Write about the actual project —
   never copy/paste or invent claims to reach the word count.

For a **unit / listing**, fill in: a title, price, configuration or BHK, area,
location, at least one photo, and the correct availability status.

Rules that keep the site trustworthy:

- A unit's price cannot be lower than the project's minimum configuration
  price — the CRM will reject it.
- Configuration labels are normalised (for example spacing and capitalisation)
  so the same configuration does not appear as several different options.
- Use only facts you have. Do not add keywords, fake reviews, invented
  landmarks or "best/no. 1" claims to descriptions.

## What happens automatically

- New location → new location hub pages, added to navigation and the sitemap
  once there is enough real inventory.
- New configuration/BHK → a `{n}-bhk-flats-in-{place}` page only when that BHK
  genuinely exists in the data.
- Project/unit pages get a title, description, canonical link, structured data,
  breadcrumbs and links to related pages automatically.
- Empty categories are never indexed and never shown in the navigation.

## Lifecycle

- **Mark a unit as reserved** — it stays online with its status.
- **Mark a unit as sold** — its page permanently redirects to the parent
  project and drops out of the sitemap.
- **Delete a project** — ask a developer to add one line to
  `seo-retired-projects.json` so the old project URL permanently redirects to
  its location hub. Do this on the same day the project is removed.
- **Retire an old-style URL** (for example `flats-for-sale-in-...`) — no action
  needed; it already redirects to the current hub.

## Checking your work

After publishing, open the public project or unit page and check that the
photos, price, configurations and location are correct. If the CRM still shows
a "not indexable" warning, fill the remaining fields listed there. A developer
can run `npm run seo:audit` to see the full list of published records waiting
for data.
