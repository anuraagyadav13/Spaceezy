import HomeContent from "./HomeClient";
import { JsonLd } from "../../components/seo/JsonLd";
import { realEstateAgentSchema } from "../../lib/seo/schema";
import { homeMetadata } from "../../lib/seo/metadata";
import { getNavHubs } from "../../lib/seo/hubs";
import { BUSINESS } from "../../config/business";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Regenerate with live CRM data at most every 60s.
export const revalidate = 60;

export const metadata = homeMetadata();

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
    const [projects, properties, locations, nav] = await Promise.all([
        getJson("/public/projects", { limit: 6 }),
        getJson("/public/properties", { limit: 6, availability: "Available" }),
        getJson("/public/locations"),
        getNavHubs(),
    ]);

    return (
        <>
            <HomeContent
                projects={(projects && projects.items) || []}
                properties={(properties && properties.items) || []}
                locations={Array.isArray(locations) ? locations : []}
                hubs={nav}
                areaLabel={BUSINESS.areaServed.city}
            />
            <JsonLd data={realEstateAgentSchema()} />
        </>
    );
}
