import { LANDING_PAGES } from "./landingPages";
import { getInventory, filterLanding } from "./inventory";
import { SITE_NAME } from "./site";

export async function getLandingData(slug) {
    const page = LANDING_PAGES[slug];
    if (!page) return null;
    const inv = await getInventory();
    const { projects, properties } = filterLanding(page, inv);
    return {
        slug,
        page,
        projects,
        properties,
        count: projects.length + properties.length,
        indexable: projects.length + properties.length > 0,
    };
}

// Unique, self-canonical metadata per landing page. Pages with zero live
// inventory are noindexed so we never serve thin/empty pages to Google.
export async function landingMetadata(slug) {
    const data = await getLandingData(slug);
    if (!data) return { title: SITE_NAME };
    const { page, count, indexable } = data;
    const description = `${page.description}${count > 0 ? ` ${count} live ${count === 1 ? "listing" : "listings"} right now.` : ""}`.slice(0, 160);

    return {
        title: page.title,
        description,
        alternates: { canonical: `/${slug}` },
        openGraph: {
            title: page.title,
            description,
            url: `/${slug}`,
            type: "website",
            images: [{ url: "/images/og-default.jpg" }],
        },
        twitter: { card: "summary_large_image", title: page.title, description },
        ...(indexable ? {} : { robots: { index: false, follow: false } }),
    };
}
