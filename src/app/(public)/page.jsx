import HomeContent from "./HomeClient";
import { JsonLd } from "../../components/seo/JsonLd";
import { realEstateAgentJsonLd } from "../../lib/seo/site";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const HOME_TITLE = "SpaceEzy – Real Estate Properties in Ghaziabad | Buy & Sell Property";
const HOME_DESCRIPTION =
    "SpaceEzy lists real estate properties in Ghaziabad — flats, plots, homes and commercial spaces across Wave City and top localities. Browse live inventory with zero brokerage.";

// Regenerate with live CRM data at most every 60s.
export const revalidate = 60;

export const metadata = {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    alternates: { canonical: "/" },
    openGraph: {
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
        url: "/",
        type: "website",
        images: [{ url: "/images/og-default.jpg" }],
    },
    twitter: {
        card: "summary_large_image",
        title: HOME_TITLE,
        description: HOME_DESCRIPTION,
    },
};

async function getJson(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    const qs = query.toString();
    try {
        const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
            next: { revalidate: 60 },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        return payload && payload.success ? payload.data : null;
    } catch {
        return null;
    }
}

export default async function PublicHomePage() {
    const [projects, properties, locations] = await Promise.all([
        getJson("/public/projects", { limit: 6 }),
        getJson("/public/properties", { limit: 6, availability: "Available" }),
        getJson("/public/locations"),
    ]);

    return (
        <>
            <HomeContent
                projects={(projects && projects.items) || []}
                properties={(properties && properties.items) || []}
                locations={Array.isArray(locations) ? locations : []}
            />
            <JsonLd data={realEstateAgentJsonLd} />
        </>
    );
}
