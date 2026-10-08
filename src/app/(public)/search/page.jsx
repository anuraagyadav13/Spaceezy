import SearchClient from "./SearchClient";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const metadata = {
    title: "Property Search | Spaceezy",
    description:
        "Search live real estate projects and properties by keyword, location, project, configuration and budget — results straight from the Spaceezy CRM.",
    alternates: { canonical: "/search" },
    openGraph: {
        title: "Property Search | Spaceezy",
        description:
            "Search live real estate projects and properties by keyword, location, project, configuration and budget.",
        url: "/search",
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

export default async function SearchPage({ searchParams }) {
    const sp = (await searchParams) || {};
    const filters = {
        q: first(sp.q),
        stateId: first(sp.stateId),
        projectSlug: first(sp.projectSlug),
        configuration: first(sp.configuration),
        minPrice: first(sp.minPrice),
        maxPrice: first(sp.maxPrice),
    };

    const [projects, properties] = await Promise.all([
        getJson("/public/projects", {
            q: filters.q,
            stateId: filters.stateId,
            configuration: filters.configuration,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            limit: 50,
        }),
        getJson("/public/properties", { ...filters, limit: 50 }),
    ]);

    return (
        <SearchClient
            initialProjects={
                projects || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
            }
            initialProperties={
                properties || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
            }
            initialFilters={filters}
        />
    );
}
