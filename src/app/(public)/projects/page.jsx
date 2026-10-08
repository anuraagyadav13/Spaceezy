import ProjectsClient from "./ProjectsClient";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const metadata = {
    title: "Discover Projects | Spaceezy",
    description:
        "Browse premium real estate projects with live pricing, configurations and availability. Filter by location, property type and budget.",
    alternates: { canonical: "/projects" },
    openGraph: {
        title: "Discover Projects | Spaceezy",
        description:
            "Browse premium real estate projects with live pricing, configurations and availability.",
        url: "/projects",
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

export default async function ProjectsPage({ searchParams }) {
    const sp = (await searchParams) || {};
    const filters = {
        q: first(sp.q),
        stateId: first(sp.stateId),
        districtId: first(sp.districtId),
        propertyType: first(sp.propertyType),
        minPrice: first(sp.minPrice),
        maxPrice: first(sp.maxPrice),
    };

    const data = await getJson("/public/projects", { ...filters, limit: 50 });

    return (
        <ProjectsClient
            initialData={
                data || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
            }
            initialFilters={filters}
        />
    );
}
