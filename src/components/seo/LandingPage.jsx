import Link from "next/link";
import { Phone, MessageCircle, MapPin, CalendarCheck } from "lucide-react";
import { JsonLd } from "./JsonLd";
import { Breadcrumbs, breadcrumbJsonLd } from "./Breadcrumbs";
import { ProjectCard, PropertyCard } from "./Cards";
import { getLandingData } from "../../lib/seo/landing";
import { SITE_URL, PHONE_DISPLAY, PHONE_TEL, WHATSAPP_URL, absoluteUrl } from "../../lib/seo/site";

const MAX_PROPERTY_CARDS = 18;
const MAX_PROJECT_CARDS = 9;

const STATIC_FALLBACK_LINKS = [
    { slug: null, href: "/projects", label: "Projects" },
    { slug: null, href: "/properties", label: "Properties" },
    { slug: null, href: "/search", label: "Property Search" },
];

export async function LandingPage({ data }) {
    const { slug, page, projects, properties, indexable } = data;

    const crumbs = [
        { name: "Home", href: "/" },
        { name: page.h1, href: null },
    ];

    // Related pages: only cross-link the ones that currently carry inventory
    // (keeps link equity on indexable pages); fall back to core static links.
    const relatedData = await Promise.all((page.related || []).map((s) => getLandingData(s)));
    const relatedLinks = relatedData
        .filter((d) => d && d.indexable && d.slug !== slug)
        .map((d) => ({ slug: d.slug, href: `/${d.slug}`, label: d.page.h1 }));
    const links = (relatedLinks.length ? relatedLinks : STATIC_FALLBACK_LINKS).slice(0, 6);

    const itemList = [
        ...projects.map((p) => ({
            "@type": "ListItem",
            name: p.name,
            item: { "@type": "Thing", name: p.name, url: absoluteUrl(`/projects/${p.slug}`) },
        })),
        ...properties.map((pr) => ({
            "@type": "ListItem",
            name: `${pr.title}${pr.project?.name ? ` — ${pr.project.name}` : ""}`,
            item: {
                "@type": "RealEstateListing",
                name: pr.title,
                url: absoluteUrl(`/properties/${pr.token}`),
                ...(pr.price != null
                    ? { offers: { "@type": "Offer", price: pr.price, priceCurrency: "INR" } }
                    : {}),
            },
        })),
    ].slice(0, 40)
        .map((item, i) => ({ ...item, position: i + 1 }));

    const breadcrumb = breadcrumbJsonLd(crumbs);
    const webPageJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${absoluteUrl(`/${slug}`)}#webpage`,
        url: absoluteUrl(`/${slug}`),
        name: page.title,
        description: page.description,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        breadcrumb: { "@id": `${absoluteUrl(`/${slug}`)}#breadcrumb` },
    };
    const faqJsonLd = page.faq?.length
        ? {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: page.faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
          }
        : null;
    const itemListJsonLd = itemList.length
        ? {
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: page.h1,
              numberOfItems: itemList.length,
              itemListElement: itemList,
          }
        : null;

    return (
        <div className="bg-white">
            {/* HERO */}
            <section className="bg-gray-900 pt-36 pb-14 md:pt-44 md:pb-20">
                <div className="container mx-auto px-6 md:px-12">
                    <Breadcrumbs items={crumbs} dark />
                    <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-5 max-w-4xl">{page.h1}</h1>
                    <p className="text-lg md:text-xl text-gray-300 leading-relaxed max-w-3xl">{page.intro[0]}</p>
                    {indexable && (
                        <p className="mt-6 inline-flex items-center gap-2 bg-white/10 border border-white/20 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-full">
                            <MapPin size={15} />
                            {projects.length} {projects.length === 1 ? "project" : "projects"} · {properties.length} {properties.length === 1 ? "unit" : "units"} listed
                        </p>
                    )}
                </div>
            </section>

            <div className="container mx-auto px-6 md:px-12">
                <p className="text-gray-600 leading-relaxed text-lg max-w-4xl -mt-2 pt-10">{page.intro[1]}</p>

                {/* PROJECTS */}
                {projects.length > 0 && (
                    <section className="pt-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                            {`Projects — ${page.h1}`}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.slice(0, MAX_PROJECT_CARDS).map((p) => (
                                <ProjectCard key={p.slug} project={p} />
                            ))}
                        </div>
                    </section>
                )}

                {/* PROPERTIES */}
                {properties.length > 0 && (
                    <section className="pt-12">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                            {`Listings — ${page.h1}`}
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {properties.slice(0, MAX_PROPERTY_CARDS).map((pr) => (
                                <PropertyCard key={pr.token} property={pr} />
                            ))}
                        </div>
                        {properties.length > MAX_PROPERTY_CARDS && (
                            <p className="mt-6">
                                <Link href="/properties" className="text-purple-700 font-semibold hover:underline">
                                    View all properties →
                                </Link>
                            </p>
                        )}
                    </section>
                )}

                {/* HONEST EMPTY STATE (noindex when count === 0) */}
                {!indexable && (
                    <section className="my-16 bg-gray-50 border border-gray-100 rounded-[32px] p-8 md:p-12 text-center">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">No live listings here yet</h2>
                        <p className="text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
                            We do not have published inventory matching &ldquo;{page.h1}&rdquo; right now. New projects
                            and units go live regularly — tell us what you are looking for and we will reach out the
                            moment something fits, or browse the inventory we do have.
                        </p>
                        <div className="flex flex-wrap justify-center gap-3 mb-8">
                            <a href={`tel:${PHONE_TEL}`} className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors">
                                <Phone size={17} /> {PHONE_DISPLAY}
                            </a>
                            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-emerald-700 transition-colors">
                                <MessageCircle size={17} /> Chat on WhatsApp
                            </a>
                            <Link href="/enquiry" className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-purple-700 transition-colors">
                                <CalendarCheck size={17} /> Tell us your requirement
                            </Link>
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                            <Link href="/projects" className="text-purple-700 font-medium hover:underline">Browse projects</Link>
                            <Link href="/properties" className="text-purple-700 font-medium hover:underline">Browse properties</Link>
                            <Link href="/search" className="text-purple-700 font-medium hover:underline">Search everything</Link>
                        </div>
                    </section>
                )}

                {/* FAQ — only when real, visible Q&A exists for this page */}
                {page.faq?.length > 0 && (
                    <section className="pt-12 pb-4">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">Frequently asked questions</h2>
                        <div className="flex flex-col gap-4 max-w-4xl">
                            {page.faq.map((f) => (
                                <div key={f.q} className="border border-gray-100 rounded-2xl p-6">
                                    <h3 className="font-bold text-gray-900 mb-2">{f.q}</h3>
                                    <p className="text-gray-600 leading-relaxed">{f.a}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* RELATED / INTERNAL LINKS */}
                <section className="py-12">
                    <h2 className="text-2xl font-bold text-gray-900 mb-5">Explore more on SpaceEzy</h2>
                    <ul className="flex flex-wrap gap-3">
                        {links.map((l) => (
                            <li key={l.href}>
                                <Link
                                    href={l.href}
                                    className="inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                                >
                                    {l.label}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link
                                href="/contact"
                                className="inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                            >
                                Contact SpaceEzy
                            </Link>
                        </li>
                    </ul>
                </section>

                {/* CTA */}
                <section className="mb-20">
                    <div className="bg-gray-900 rounded-[32px] p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Need help narrowing it down?</h2>
                            <p className="text-gray-400">Talk to the SpaceEzy team — we are on the ground in Ghaziabad.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <a href={`tel:${PHONE_TEL}`} className="inline-flex items-center gap-2 bg-white text-gray-900 px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors">
                                <Phone size={17} /> {PHONE_DISPLAY}
                            </a>
                            <Link href="/contact" className="inline-flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-purple-700 transition-colors">
                                Contact us
                            </Link>
                        </div>
                    </div>
                </section>
            </div>

            <JsonLd data={breadcrumb} />
            <JsonLd data={webPageJsonLd} />
            <JsonLd data={itemListJsonLd} />
            <JsonLd data={faqJsonLd} />
        </div>
    );
}
