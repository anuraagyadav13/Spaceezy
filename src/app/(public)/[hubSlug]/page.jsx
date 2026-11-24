import { notFound, permanentRedirect } from "next/navigation";

import { LandingPage } from "../../../components/seo/LandingPage";
import { getHub } from "../../../lib/seo/hubs";
import { hubMetadata } from "../../../lib/seo/metadata";

/**
 * One route, every landing page.
 *
 * Slugs are resolved against the hub registry generated from live inventory
 * (location × type × BHK × category). Adding a project in a new locality
 * therefore creates its hub with no code change, and retiring a synonym URL
 * resolves it to the canonical hub with a permanent redirect.
 *
 * Static routes (/projects, /about, …) always win over this segment.
 */
export const revalidate = 60;

export async function generateMetadata({ params }) {
    const { hubSlug } = await params;
    const { hub, redirectTo } = await getHub(hubSlug);

    if (!hub || redirectTo) return {};
    return hubMetadata(hub);
}

export default async function HubPage({ params }) {
    const { hubSlug } = await params;
    const { hub, redirectTo } = await getHub(hubSlug);

    if (redirectTo) permanentRedirect(redirectTo);
    if (!hub) notFound();

    return <LandingPage hub={hub} />;
}
