import HomeContent from "./HomeClient";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const metadata = {
    title: "Spaceezy — Find your next property",
    description:
        "Discover premium real estate projects and ready-to-move properties curated by Spaceezy. Search by location, configuration and budget with zero brokerage.",
    alternates: { canonical: "/" },
    openGraph: {
        title: "Spaceezy — Find your next property",
        description:
            "Discover premium real estate projects and ready-to-move properties curated by Spaceezy.",
        url: "/",
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

export default async function PublicHomePage() {
    const [projects, properties, locations] = await Promise.all([
        getJson("/public/projects", { limit: 6 }),
        getJson("/public/properties", { limit: 6, availability: "Available" }),
        getJson("/public/locations"),
    ]);

    return (
        <HomeContent
            projects={(projects && projects.items) || []}
            properties={(properties && properties.items) || []}
            locations={Array.isArray(locations) ? locations : []}
        />
    );
}
