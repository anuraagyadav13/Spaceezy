import Link from "next/link";
import Image from "next/image";
import { MapPin, ImageOff, Building2 } from "lucide-react";
import { formatPrice } from "../../utils/format";
import { configurationNames, projectFacts } from "../../lib/seo/facts";
import { isOptimizableImage as isOptimizable } from "../../lib/seo/images";


const placeLabel = (location) =>
    [location?.region || location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

/** Data-derived alt text: what the image shows, where it is, and what it is. */
const projectImageAlt = (project, facts) =>
    `${project.name}${facts.locationLabel || placeLabel(project.location)
        ? ` in ${facts.locationLabel || placeLabel(project.location)}`
        : ""} — project photo`;

const unitImageAlt = (property) => {
    const place = placeLabel(property.location);
    const unit = property.configuration || (property.bhk ? `${property.bhk} BHK` : property.title);
    return `${unit}${property.project?.name ? ` in ${property.project.name}` : ""}${place ? `, ${place}` : ""} — listing photo`;
};

export function ProjectCard({ project }) {
    // Price and configurations come from the one shared facts function, so a
    // card, the hub, the project page and its metadata can never disagree.
    const facts = projectFacts(project);
    const configurations = configurationNames(project.configurations);

    return (
        <Link
            href={`/projects/${project.slug}`}
            aria-label={`View details: ${project.name}`}
            className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-shadow"
        >
            <div className="relative h-48 bg-gray-100 overflow-hidden">
                {project.image ? (
                    // Optimized for LCP/bandwidth when the source is local
                    // (`/media/...` is proxied to the API by next.config.ts);
                    // external CDN URLs fall back to the original file.
                    <Image
                        src={project.image}
                        alt={projectImageAlt(project, facts)}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized={!isOptimizable(project.image)}
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageOff size={32} />
                    </div>
                )}
                {facts.availableUnits != null && facts.availableUnits > 0 && (
                    <span className="absolute top-3 left-3 bg-emerald-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                        {facts.availableUnits} available
                    </span>
                )}
            </div>
            <div className="p-5 flex flex-col gap-2 flex-1">
                <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors line-clamp-2">{project.name}</h3>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin size={13} className="shrink-0" />
                    {facts.locationLabel || placeLabel(project.location) || project.address || "Location to be announced"}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {configurations.slice(0, 3).map((name) => (
                        <span key={name} className="text-[11px] bg-gray-50 border border-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {name}
                        </span>
                    ))}
                </div>
                <p className="mt-auto pt-2 text-sm font-bold text-gray-900">
                    {facts.priceMin != null ? `From ${formatPrice(facts.priceMin)}` : "Price on request"}
                </p>
            </div>
        </Link>
    );
}

const availabilityClasses = (availability) =>
    availability === "Available"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : availability === "Limited Availability"
            ? "bg-amber-50 text-amber-700 border-amber-100"
            : "bg-gray-100 text-gray-600 border-gray-100";

export function PropertyCard({ property }) {
    return (
        <Link
            href={`/properties/${property.token}`}
            aria-label={`View details: ${property.title}`}
            className="group flex flex-col bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-shadow"
        >
            <div className="relative h-48 bg-gray-100 overflow-hidden">
                {property.image ? (
                    <Image
                        src={property.image}
                        alt={unitImageAlt(property)}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized={!isOptimizable(property.image)}
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Building2 size={32} />
                    </div>
                )}
                {property.availability && (
                    <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full border ${availabilityClasses(property.availability)}`}>
                        {property.availability}
                    </span>
                )}
            </div>
            <div className="p-5 flex flex-col gap-2 flex-1">
                <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors line-clamp-2">{property.title}</h3>
                {property.project?.name && <p className="text-xs text-gray-500">{property.project.name}</p>}
                <div className="flex flex-wrap gap-1.5 mt-1">
                    {property.bhk ? <span className="text-[11px] bg-gray-50 border border-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{property.bhk} BHK</span> : null}
                    {property.configuration ? <span className="text-[11px] bg-gray-50 border border-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{property.configuration}</span> : null}
                    {property.area ? <span className="text-[11px] bg-gray-50 border border-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{property.area} sq.ft</span> : null}
                </div>
                <p className="mt-auto pt-2 text-sm font-bold text-gray-900">
                    {property.price != null ? formatPrice(property.price) : "On request"}
                </p>
            </div>
        </Link>
    );
}
