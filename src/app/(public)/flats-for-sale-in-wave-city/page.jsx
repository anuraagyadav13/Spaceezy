import { notFound } from "next/navigation";
import { LandingPage } from "../../../components/seo/LandingPage";
import { getLandingData, landingMetadata } from "../../../lib/seo/landing";

const SLUG = "flats-for-sale-in-wave-city";

export async function generateMetadata() {
    return landingMetadata(SLUG);
}

export default async function Page() {
    const data = await getLandingData(SLUG);
    if (!data) notFound();
    return <LandingPage data={data} />;
}

// Regenerate with live CRM data at most every 60s.
export const revalidate = 60;
