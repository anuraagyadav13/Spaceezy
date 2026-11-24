import Link from "next/link";
import { Phone, MessageCircle, MapPin, CalendarCheck } from "lucide-react";
import { JsonLd } from "./JsonLd";
import { Breadcrumbs } from "./Breadcrumbs";
import { ProjectCard, PropertyCard } from "./Cards";
import { PHONE_DISPLAY, PHONE_TEL, WHATSAPP_URL } from "../../lib/seo/site";
import {
    breadcrumbSchema,
    itemListSchema,
    webPageSchema,
} from "../../lib/seo/schema";
import { pluralize } from "../../lib/seo/text";

const MAX_PROPERTY_CARDS = 18;
const MAX_PROJECT_CARDS = 9;

/**
 * Shared template for every generated hub page (location, category, BHK).
 *
 * All copy is derived from the hub facts computed in `lib/seo/facets.js`:
 * counts, real price range, configurations that actually exist and unit
 * availability. There is no hand-written copy per city.
 */
export function LandingPage({ hub }) {
    const { h1, projects, properties, counts, blocks, indexable, breadcrumbs, related } = hub;

    const itemListItems = [
        ...projects.map((project) => ({
            name: project.name,
            url: `/projects/${project.slug}`,
            type: "ApartmentComplex",
            price: project.startingPrice,
        })),
        ...properties.map((unit) => ({
            name: unit.title,
            url: `/properties/${unit.token}`,
            type: "RealEstateListing",
            price: unit.price,
        })),
    ];

    const breadcrumb = breadcrumbSchema(breadcrumbs, hub.path);
    // Duplicate hubs are noindex and canonicalise to the surviving intent, so
    // their schema @id points at that canonical URL, not at the duplicate path.
    const canonical = hub.canonicalPath || hub.path;
    const webPage = webPageSchema({
        url: canonical,
        name: h1,
        description: hub.description,
        breadcrumbUrl: hub.path,
    });
    const itemList = itemListSchema({ name: h1, items: itemListItems, url: canonical });

    return (
        <div className="bg-white">
            {/* HERO */}
            <section className="bg-gray-900 pt-36 pb-14 md:pt-44 md:pb-20">
                <div className="container mx-auto px-6 md:px-12">
                    <Breadcrumbs items={breadcrumbs} dark />
                    <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-5 max-w-4xl">{h1}</h1>
                    <p className="text-lg md:text-xl text-gray-300 leading-relaxed max-w-3xl">
                        {blocks[0] || `Browse the live inventory Spaceezy has published for ${h1.toLowerCase()}.`}
                    </p>
                    {counts.total > 0 && (
                        <p className="mt-6 inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-full">
                            <MapPin size={15} />
                            {counts.projects} {pluralize(counts.projects, "project")} &middot; {counts.properties}{" "}
                            {pluralize(counts.properties, "unit")} listed
                        </p>
                    )}
                </div>
            </section>

            <div className="container mx-auto px-6 md:px-12">
                {/* DATA-DERIVED FACTS */}
                {blocks.length > 1 && (
                    <section className="pt-10">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">At a glance</h2>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 text-gray-600 leading-relaxed">
                            {blocks.map((block) => (
                                <li key={block} className="flex gap-2">
                                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 rounded-full bg-purple-500 shrink-0" />
                                    <span>{block}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* PROJECTS */}
                {projects.length > 0 && (
                    <section className="pt-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                            {`Projects in ${h1}`}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.slice(0, MAX_PROJECT_CARDS).map((project) => (
                                <ProjectCard key={project.slug} project={project} />
                            ))}
                        </div>
                    </section>
                )}

                {/* UNITS */}
                {properties.length > 0 && (
                    <section className="pt-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">{`Units in ${h1}`}</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {properties.slice(0, MAX_PROPERTY_CARDS).map((unit) => (
                                <PropertyCard key={unit.token} property={unit} />
                            ))}
                        </div>
                        {properties.length > MAX_PROPERTY_CARDS && (
                            <p className="mt-6">
                                <Link
                                    href="/properties"
                                    className="text-purple-700 font-semibold hover:underline"
                                >
                                    {`View all ${properties.length} units in this collection`}
                                </Link>
                            </p>
                        )}
                    </section>
                )}

                {/* HONEST EMPTY STATE — rendered noindex while the threshold is unmet */}
                {!indexable && (
                    <section className="my-16 bg-gray-50 border border-gray-100 rounded-[32px] p-8 md:p-12 text-center">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">No live listings here yet</h2>
                        <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
                            {`Spaceezy does not have published inventory matching "${h1}" right now. New projects and units appear on this page automatically as soon as they are published.`}
                        </p>
                        <div className="flex flex-wrap justify-center gap-3 mb-8">
                            <a
                                href={`tel:${PHONE_TEL}`}
                                className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
                            >
                                <Phone size={17} /> {PHONE_DISPLAY}
                            </a>
                            <a
                                href={WHATSAPP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-emerald-700 transition-colors"
                            >
                                <MessageCircle size={17} /> Chat on WhatsApp
                            </a>
                            <Link
                                href="/enquiry"
                                rel="nofollow"
                                className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-purple-700 transition-colors"
                            >
                                <CalendarCheck size={17} /> Tell us your requirement
                            </Link>
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                            <Link href="/projects" className="text-purple-700 font-medium hover:underline">
                                Browse all projects
                            </Link>
                            <Link href="/properties" className="text-purple-700 font-medium hover:underline">
                                Browse all properties
                            </Link>
                            <Link href="/properties" className="text-purple-700 font-medium hover:underline">
                                Browse everything
                            </Link>
                        </div>
                    </section>
                )}

                {/* RELATED HUBS — only indexable destinations */}
                {related?.length > 0 && (
                    <section className="py-12">
                        <h2 className="text-2xl font-bold text-gray-900 mb-5">Explore related collections</h2>
                        <ul className="flex flex-wrap gap-3">
                            {related.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                                    >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <Link
                                    href="/contact"
                                    className="inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                                >
                                    Contact Spaceezy
                                </Link>
                            </li>
                        </ul>
                    </section>
                )}

                {/* CTA */}
                <section className="mb-20">
                    <div className="bg-gray-900 rounded-[32px] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Need help narrowing it down?</h2>
                            <p className="text-gray-400">
                                {blocks[1] || "Talk to the Spaceezy team about current availability and site visits."}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href={`tel:${PHONE_TEL}`}
                                className="inline-flex items-center gap-2 bg-white text-gray-900 px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors"
                            >
                                <Phone size={17} /> {PHONE_DISPLAY}
                            </a>
                            <Link
                                href="/contact"
                                className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-purple-700 transition-colors"
                            >
                                Contact us
                            </Link>
                        </div>
                    </div>
                </section>
            </div>

            <JsonLd data={breadcrumb} />
            <JsonLd data={webPage} />
            <JsonLd data={itemList} />
        </div>
    );
}
