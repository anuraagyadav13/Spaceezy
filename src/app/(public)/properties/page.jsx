import PropertiesClient from "./PropertiesClient";
import { JsonLd } from "../../../components/seo/JsonLd";
import { breadcrumbSchema, itemListSchema } from "../../../lib/seo/schema";
import { canonicalUrl } from "../../../lib/seo/site";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const FILTER_KEYS = [
    "q",
    "availability",
    "configuration",
    "bhk",
    "propertyType",
    "minPrice",
    "maxPrice",
    "page",
    "sort",
];

const first = (value) => (Array.isArray(value) ? value[0] : value) || "";

export async function generateMetadata({ searchParams }) {
    const base = staticPageMetadata("/properties");
    const sp = (await searchParams) || {};
    const filtered = FILTER_KEYS.some((key) => first(sp[key]));
    if (!filtered) return base;
    // Filter permutations are the same content as /properties: noindex, one canonical.
    return { ...base, robots: { index: false, follow: true }, alternates: { canonical: canonicalUrl("/properties") } };
}

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

export default async function PropertiesPage({ searchParams }) {
    const sp = (await searchParams) || {};
    const filters = {
        q: first(sp.q),
        availability: first(sp.availability),
        configuration: first(sp.configuration),
        minPrice: first(sp.minPrice),
        maxPrice: first(sp.maxPrice),
    };

    const data = await getJson("/public/properties", { ...filters, limit: 50 });
    const items = (data && data.items) || [];

    return (
        <>
            <PropertiesClient
                initialData={
                    data || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
                }
                initialFilters={filters}
            />
            <JsonLd
                data={breadcrumbSchema([
                    { name: "Home", href: "/" },
                    { name: "Properties" },
                ], "/properties")}
            />
            <JsonLd
                data={itemListSchema({
                    name: "Properties listed on Spaceezy",
                    url: "/properties",
                    items: items.map((unit) => ({
                        name: unit.title,
                        url: `/properties/${unit.token}`,
                        type: "RealEstateListing",
                        price: unit.price,
                    })),
                })}
            />
        </>
    );
}
