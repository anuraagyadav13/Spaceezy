import PropertiesClient from "./PropertiesClient";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const metadata = {
    title: "Available Properties | Spaceezy",
    description:
        "Discover ready-to-move and available properties with live pricing, area and availability status. Filter by configuration, budget and unit availability.",
    alternates: { canonical: "/properties" },
    openGraph: {
        title: "Available Properties | Spaceezy",
        description:
            "Discover ready-to-move and available properties with live pricing, area and availability status.",
        url: "/properties",
        type: "website",
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

const first = (value) => (Array.isArray(value) ? value[0] : value) || "";

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

    return (
        <PropertiesClient
            initialData={
                data || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
            }
            initialFilters={filters}
        />
    );
}
