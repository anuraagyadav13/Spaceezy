import { notFound } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "../../../../utils/format";
import { MapPin, Maximize, Compass, ArrowLeft, Building2, ImageOff } from "lucide-react";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// Public property page by opaque share token (never an internal unit ID).
// Fetched server-side so crawlers get full HTML + OG metadata.
async function getPublicProperty(token) {
    if (!token) return null;
    try {
        const res = await fetch(
            `${API_BASE}/public/properties/${encodeURIComponent(token)}`,
            { cache: "no-store" }
        );
        if (!res.ok) return null;
        const payload = await res.json();
        return payload && payload.success ? payload.data : null;
    } catch {
        return null;
    }
}

export async function generateMetadata({ params }) {
    const { id } = await params;
    const property = await getPublicProperty(id);
    if (!property) {
        return { title: "Property not found | Spaceezy" };
    }

    const locationText = property.locationLabel || [property.location?.city, property.location?.state].filter(Boolean).join(", ");
    const title = `${property.title}${property.project?.name ? ` | ${property.project.name}` : ""}`;
    const description = [
        property.configuration && `${property.configuration} unit`,
        property.area && `${property.area} sq.ft`,
        property.price != null && formatPrice(property.price),
        locationText
    ].filter(Boolean).join(" · ");

    return {
        title,
        description,
        alternates: { canonical: `/properties/${property.token}` },
        openGraph: {
            title,
            description,
            url: `/properties/${property.token}`,
            type: "website",
            ...(property.images && property.images[0]
                ? { images: [{ url: property.images[0] }] }
                : (property.project?.image ? { images: [{ url: property.project.image }] } : {}))
        },
        twitter: {
            card: "summary_large_image",
            title,
            description
        }
    };
}

export default async function PropertyDetailPage({ params }) {
    const { id } = await params;
    const property = await getPublicProperty(id);
    if (!property) notFound();

    const project = property.project || {};
    const gallery = property.images || [];
    const availabilityClasses = property.availability === "Available"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : property.availability === "Limited Availability"
            ? "bg-amber-50 text-amber-700 border-amber-100"
            : "bg-gray-100 text-gray-600 border-gray-200";

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-32">
            <div className="container mx-auto px-6 md:px-12">
                <Link href="/properties" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-purple-600 mb-8 font-medium transition-colors">
                    <ArrowLeft size={16} /> Back to properties
                </Link>

                <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                    {/* GALLERY */}
                    {gallery.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                            <div className="relative h-64 md:h-[500px] rounded-[32px] overflow-hidden bg-gray-100">
                                <img src={gallery[0]} alt={property.title} className="w-full h-full object-cover" loading="eager" />
                            </div>
                            <div className="grid grid-rows-2 gap-2 h-64 md:h-[500px]">
                                <div className="relative rounded-[32px] overflow-hidden bg-gray-100">
                                    <img src={gallery[1] || project.image || gallery[0]} alt={project.name || "Property"} className="w-full h-full object-cover" loading="lazy" />
                                </div>
                                <div className="relative rounded-[32px] overflow-hidden bg-gray-100">
                                    <img src={gallery[2] || project.image || gallery[0]} alt={project.name || "Property"} className="w-full h-full object-cover" loading="lazy" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="m-2 h-64 md:h-[420px] rounded-[32px] bg-gray-100 flex flex-col items-center justify-center text-gray-400">
                            <ImageOff size={40} />
                            <p className="text-sm font-medium mt-3">Photos coming soon</p>
                        </div>
                    )}

                    <div className="p-8 md:p-12 flex flex-col lg:flex-row gap-16">
                        {/* LEFT DETAILS */}
                        <div className="flex-1">
                            <div className="mb-8">
                                <span className={`text-xs font-bold px-3 py-1 rounded-full border mb-4 inline-block ${availabilityClasses}`}>
                                    {property.availability}
                                </span>
                                <h1 className="text-3xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">{property.title}</h1>
                                <p className="text-lg text-gray-500 flex items-center gap-2">
                                    <MapPin size={20} /> {property.locationLabel || property.address}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 py-8 border-y border-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Price</p>
                                    <p className="text-xl font-bold text-gray-900">{property.price != null ? formatPrice(property.price) : "On request"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Configuration</p>
                                    <p className="text-lg font-semibold text-gray-900">{property.configuration || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Area</p>
                                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-1"><Maximize size={16} /> {property.area ? `${property.area} sqft` : "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Facing</p>
                                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-1"><Compass size={16} /> {property.facing || "—"}</p>
                                </div>
                            </div>

                            <h2 className="text-2xl font-bold text-gray-900 mb-4">About this property</h2>
                            <p className="text-gray-600 leading-relaxed text-lg mb-8">
                                {property.description ||
                                    `Unit ${property.unitNumber || property.title} is a ${property.configuration || "premium"} residence in ${project.name || "this project"}. Contact us for full details, pricing and a site visit.`}
                            </p>

                            {property.amenities && property.amenities.length > 0 && (
                                <>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Amenities</h2>
                                    <div className="flex flex-wrap gap-2 mb-8">
                                        {property.amenities.map((amenity) => (
                                            <span key={amenity} className="bg-purple-50 text-purple-700 text-sm font-medium px-4 py-2 rounded-full border border-purple-100">
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}

                            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                        <Building2 className="text-gray-900" size={24} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Part of {project.name}</p>
                                        {project.developer ? <p className="text-xs text-gray-500">By {project.developer}</p> : null}
                                    </div>
                                </div>
                                <Link href={`/projects/${project.slug}`} className="text-purple-600 font-bold text-sm hover:underline">
                                    View Project
                                </Link>
                            </div>
                        </div>

                        {/* RIGHT ACTION CARD */}
                        <div className="w-full lg:w-96 shrink-0">
                            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-gray-200/50 border border-gray-100 sticky top-32">
                                <p className="text-sm text-gray-500 mb-2 font-medium uppercase tracking-wider">Property Price</p>
                                <h3 className="text-4xl font-bold text-gray-900 mb-8">
                                    {property.price != null ? formatPrice(property.price) : "On request"}
                                </h3>

                                <div className="flex flex-col gap-3">
                                    <Link
                                        href={`/enquiry?propertyToken=${encodeURIComponent(property.token)}${property.enquiry?.projectSlug ? `&projectSlug=${encodeURIComponent(property.enquiry.projectSlug)}` : ""}`}
                                        className="w-full text-center bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors"
                                    >
                                        Enquire Now
                                    </Link>
                                    <Link
                                        href={`/enquiry?propertyToken=${encodeURIComponent(property.token)}${property.enquiry?.projectSlug ? `&projectSlug=${encodeURIComponent(property.enquiry.projectSlug)}` : ""}&type=visit`}
                                        className="w-full text-center bg-purple-50 text-purple-700 py-4 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-100"
                                    >
                                        Schedule Site Visit
                                    </Link>
                                </div>
                                <p className="text-xs text-gray-400 text-center mt-6">Zero brokerage fee. Secure your unit today.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
