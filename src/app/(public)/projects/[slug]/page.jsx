import { notFound } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "../../../../utils/format";
import {
    MapPin, Building, CheckCircle2, FileText, Calendar, Home, LayoutGrid, ImageOff
} from "lucide-react";
import { JsonLd } from "../../../../components/seo/JsonLd";
import { Breadcrumbs, breadcrumbJsonLd } from "../../../../components/seo/Breadcrumbs";
import { PropertyCard, ProjectCard } from "../../../../components/seo/Cards";
import { LANDING_BY_PLACE } from "../../../../lib/seo/landingPages";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

async function getJsonList(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    const qs = query.toString();
    try {
        const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, { next: { revalidate: 60 } });
        if (!res.ok) return null;
        const payload = await res.json();
        return payload && payload.success ? payload.data : null;
    } catch {
        return null;
    }
}

// Public project page by canonical slug (no internal IDs in URLs).
// ISR (60s): published marketing content can lag admin edits by at most a
// minute — keeps the public site fast without a separate cache layer.
async function getPublicProject(slug) {
    if (!slug) return null;
    try {
        const res = await fetch(
            `${API_BASE}/public/projects/${encodeURIComponent(slug)}`,
            { next: { revalidate: 60 } }
        );
        if (!res.ok) return null;
        const payload = await res.json();
        return payload && payload.success ? payload.data : null;
    } catch {
        return null;
    }
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export async function generateMetadata({ params }) {
    const { slug } = await params;
    const project = await getPublicProject(slug);
    if (!project) {
        return { title: "Project not found | Spaceezy" };
    }

    const locationText = project.locationLabel || [project.location?.city, project.location?.state].filter(Boolean).join(", ");
    const title = `${project.name}${project.projectType ? ` | ${project.projectType}` : ""}`;
    const description = project.shortDescription
        || [project.shortDescription, locationText, project.startingPrice != null && `Starting ${formatPrice(project.startingPrice)}`]
            .filter(Boolean).join(" · ")
        || `Explore ${project.name} — configurations, pricing, amenities and availability.`;

    return {
        title,
        description,
        alternates: { canonical: `/projects/${project.slug}` },
        openGraph: {
            title,
            description,
            url: `/projects/${project.slug}`,
            type: "website",
            ...(project.heroImage ? { images: [{ url: project.heroImage }] } : {})
        },
        twitter: {
            card: "summary_large_image",
            title,
            description
        }
    };
}

export default async function ProjectDetailPage({ params }) {
    const { slug } = await params;
    const project = await getPublicProject(slug);
    if (!project) notFound();

    const priceRange = project.startingPrice != null
        ? `${formatPrice(project.startingPrice)}${project.maximumPrice != null && project.maximumPrice !== project.startingPrice ? ` – ${formatPrice(project.maximumPrice)}` : ""}`
        : "On request";

    const [unitsData, allProjectsData] = await Promise.all([
        getJsonList("/public/properties", { projectSlug: slug, limit: 50 }),
        getJsonList("/public/projects", { limit: 50 }),
    ]);
    const units = (unitsData && unitsData.items) || [];
    const relatedProjects = ((allProjectsData && allProjectsData.items) || [])
        .filter((p) => p.slug !== project.slug && project.location?.district && p.location?.district === project.location.district)
        .slice(0, 3);

    const placeLinks = [];
    const addPlace = (name) => {
        const s = name && LANDING_BY_PLACE[name];
        if (s && !placeLinks.some((l) => l.slug === s)) placeLinks.push({ slug: s, name });
    };
    addPlace(project.location?.region);
    addPlace(project.location?.district);

    const faqs = [];
    if (project.configurations && project.configurations.length) {
        faqs.push({
            q: `What configurations are available at ${project.name}?`,
            a: `${project.name} offers ${project.configurations.map((c) => c.name).join(", ")}. Live unit availability is shown in the Available Units section.`,
        });
    }
    if (project.startingPrice != null) {
        faqs.push({
            q: `What is the price of ${project.name}?`,
            a: `${project.startingPrice != null ? `Prices start at ${priceRange}` : "Pricing is on request"}. Check live availability above or enquire for current quotes.`,
        });
    }
    if (project.locationLabel) {
        faqs.push({
            q: `Where is ${project.name} located?`,
            a: `${project.locationLabel}${project.address ? ` — ${project.address}` : ""}.`,
        });
    }
    if (project.rera && project.rera.number) {
        faqs.push({
            q: `Is ${project.name} RERA registered?`,
            a: `Yes — RERA registration ${project.rera.number}${project.rera.authority ? ` from ${project.rera.authority}` : ""}.`,
        });
    }

    const breadcrumbs = [
        { name: "Home", href: "/" },
        { name: "Projects", href: "/projects" },
        { name: project.name, href: null },
    ];

    return (
        <div className="bg-white min-h-screen pb-32">
            {/* HERO */}
            <div className="relative h-[60vh] md:h-[80vh] w-full bg-gray-900">
                {project.heroImage ? (
                    <img src={project.heroImage} alt={project.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <ImageOff size={48} />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 via-transparent to-gray-900/90"></div>
                <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 md:pb-16 container mx-auto">
                    <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 mb-4 inline-block">
                        {String(project.status || "").replace(/_/g, " ")}
                    </span>
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 tracking-tight">{project.name}</h1>
                    <p className="text-lg md:text-xl text-gray-200 flex items-center gap-2">
                        <MapPin size={20} /> {project.locationLabel || project.address}
                    </p>
                    {placeLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {placeLinks.map((l) => (
                                <Link
                                    key={l.slug}
                                    href={`/${l.slug}`}
                                    className="bg-white/15 hover:bg-white/30 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-full border border-white/25 transition-colors"
                                >
                                    Properties in {l.name}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="container mx-auto px-6 md:px-12 pt-8">
                <Breadcrumbs items={breadcrumbs} />
            </div>

            <div className="container mx-auto px-6 md:px-12 mt-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* LEFT CONTENT */}
                <div className="lg:col-span-2 flex flex-col gap-12">
                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Project Overview</h2>
                        <p className="text-gray-600 leading-relaxed text-lg">
                            {project.description || project.shortDescription || `${project.name} — explore configurations, pricing, amenities and live availability on this page.`}
                        </p>
                    </section>

                    <section className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8 border-y border-gray-100">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Price Range</p>
                            <p className="text-lg font-bold text-gray-900">{priceRange}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Available Units</p>
                            <p className="text-lg font-bold text-emerald-600">
                                {project.availability?.availableUnits ?? 0}
                                <span className="text-sm font-medium text-gray-400"> / {project.availability?.totalUnits ?? 0}</span>
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Possession</p>
                            <p className="text-lg font-bold text-gray-900">{formatDate(project.possessionDate || project.expectedCompletionDate)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold mb-1">Type</p>
                            <p className="text-lg font-bold text-gray-900">{project.projectType || "—"}</p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <LayoutGrid size={22} /> Unit Types &amp; Availability
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {(project.unitTypes || []).map((unitType) => (
                                <div key={unitType.type} className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                    <p className="text-gray-800 font-bold text-sm mb-1">{unitType.type}</p>
                                    <p className="text-xs text-gray-500">
                                        {unitType.available} available of {unitType.count}
                                    </p>
                                </div>
                            ))}
                            {(project.unitTypes || []).length === 0 && (
                                <p className="text-sm text-gray-400">Unit details will appear once inventory is published.</p>
                            )}
                        </div>
                    </section>

                    {units.length > 0 && (
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Units</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {units.slice(0, 12).map((unit) => (
                                    <PropertyCard key={unit.token} property={unit} />
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Premium Amenities</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {(project.amenities || []).map((amenity, i) => (
                                <div key={i} className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <CheckCircle2 className="text-purple-600 shrink-0" size={20} />
                                    <span className="text-gray-800 font-medium text-sm">{amenity}</span>
                                </div>
                            ))}
                            {(project.amenities || []).length === 0 && (
                                <p className="text-sm text-gray-400">Amenities will be listed here once added.</p>
                            )}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Gallery</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {(project.images || []).slice(1).map((img, i) => (
                                <div key={i} className="relative h-48 md:h-64 rounded-3xl overflow-hidden group bg-gray-100">
                                    <img src={img} alt={`${project.name} Gallery ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                </div>
                            ))}
                            {(project.images || []).length <= 1 && (
                                <p className="text-sm text-gray-400">More photos coming soon.</p>
                            )}
                        </div>
                    </section>

                    {relatedProjects.length > 0 && (
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">
                                More projects in {project.location?.district}
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {relatedProjects.map((p) => (
                                    <ProjectCard key={p.slug} project={p} />
                                ))}
                            </div>
                        </section>
                    )}

                    {faqs.length > 0 && (
                        <section>
                            <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently asked questions</h2>
                            <div className="flex flex-col gap-4">
                                {faqs.map((f) => (
                                    <div key={f.q} className="border border-gray-100 rounded-2xl p-6">
                                        <h3 className="font-bold text-gray-900 mb-2">{f.q}</h3>
                                        <p className="text-gray-600 leading-relaxed">{f.a}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* RIGHT SIDEBAR */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-100/50 sticky top-32">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 pb-6 border-b border-gray-100">Project Details</h3>

                        <div className="flex flex-col gap-6 mb-8">
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><Building size={16} /> Developer</p>
                                <p className="font-bold text-gray-900">{project.developer || "—"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><FileText size={16} /> RERA Number</p>
                                <p className="font-bold text-gray-900">{project.rera?.number || "—"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><Calendar size={16} /> Possession</p>
                                <p className="font-bold text-gray-900">{formatDate(project.possessionDate || project.expectedCompletionDate)}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Configurations</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {(project.configurations || []).map((conf) => (
                                        <span key={conf.name} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-medium">
                                            {conf.name}{conf.bhk ? ` · ${conf.areaSaleable ? `${conf.areaSaleable} sq.ft` : ""}` : ""}
                                        </span>
                                    ))}
                                    {(project.configurations || []).length === 0 && (
                                        <span className="text-sm text-gray-400">Coming soon</span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Starting Price</p>
                                <p className="text-3xl font-bold text-purple-600">
                                    {project.startingPrice != null ? formatPrice(project.startingPrice) : "On request"}
                                </p>
                            </div>
                        </div>

                        <Link href={`/enquiry?projectSlug=${encodeURIComponent(project.slug)}`} className="w-full flex justify-center items-center py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors mb-3">
                            Enquire Now
                        </Link>
                        <Link href={`/enquiry?projectSlug=${encodeURIComponent(project.slug)}&type=visit`} className="w-full flex justify-center items-center py-4 bg-purple-50 text-purple-700 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-100">
                            Schedule a Site Visit
                        </Link>
                        <p className="text-xs text-gray-400 text-center mt-4 flex items-center justify-center gap-1">
                            <Home size={12} /> {project.availability?.availableUnits ?? 0} units available now
                        </p>
                    </div>
                </div>
            </div>

            <JsonLd data={breadcrumbJsonLd(breadcrumbs)} />
            {faqs.length > 0 && (
                <JsonLd
                    data={{
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        mainEntity: faqs.map((f) => ({
                            "@type": "Question",
                            name: f.q,
                            acceptedAnswer: { "@type": "Answer", text: f.a },
                        })),
                    }}
                />
            )}
        </div>
    );
}
