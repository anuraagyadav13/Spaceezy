import ProjectsClient from "./ProjectsClient";
import { JsonLd } from "../../../components/seo/JsonLd";
import { breadcrumbSchema, itemListSchema } from "../../../lib/seo/schema";
import { canonicalUrl } from "../../../lib/seo/site";
import { staticPageMetadata } from "../../../lib/seo/staticPages";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const FILTER_KEYS = ["q", "stateId", "districtId", "regionId", "propertyType", "minPrice", "maxPrice", "page", "sort"];

const first = (value) => (Array.isArray(value) ? value[0] : value) || "";

export async function generateMetadata({ searchParams }) {
    const base = staticPageMetadata("/projects");
    const sp = (await searchParams) || {};
    const filtered = FILTER_KEYS.some((key) => first(sp[key]));
    if (!filtered) return base;
    // Filter permutations are the same content as /projects: noindex, one canonical.
    return { ...base, robots: { index: false, follow: true }, alternates: { canonical: canonicalUrl("/projects") } };
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
    const items = (data && data.items) || [];

    return (
        <>
            <ProjectsClient
                initialData={
                    data || { items: [], page: 1, limit: 50, total: 0, totalPages: 0 }
                }
                initialFilters={filters}
            />
            <JsonLd
                data={breadcrumbSchema([
                    { name: "Home", href: "/" },
                    { name: "Projects" },
                ], "/projects")}
            />
            <JsonLd
                data={itemListSchema({
                    name: "Real estate projects on Spaceezy",
                    url: "/projects",
                    items: items.map((project) => ({
                        name: project.name,
                        url: `/projects/${project.slug}`,
                        type: "ApartmentComplex",
                        price: project.startingPrice,
                    })),
                })}
            />
        </>
    );
}
