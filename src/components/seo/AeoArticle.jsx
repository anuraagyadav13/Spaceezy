import Link from "next/link";
import { JsonLd } from "./JsonLd";
import { faqSchema, serviceSchema } from "../../lib/seo/schema";

/**
 * Shared layout for original, evidence-based AEO articles. All copy is passed
 * in from `src/lib/aeo/crmContent.js`; the FAQ schema is generated from the
 * exact questions and answers rendered on the page.
 */
export function AeoArticle({
    eyebrow,
    title,
    intro,
    serviceName,
    serviceDescription,
    path,
    blocks = [],
    faqs = [],
    faqHeading = "Frequently asked questions",
    related = [],
}) {
    return (
        <article className="bg-white">
            <header className="bg-gradient-to-br from-[#f8f6ff] via-[#f5f2ff] to-white py-16 md:py-20">
                <div className="container mx-auto px-6 md:px-12 max-w-4xl">
                    {eyebrow && (
                        <p className="mb-4 text-sm font-bold uppercase tracking-widest text-purple-700">
                            {eyebrow}
                        </p>
                    )}
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-6">
                        {title}
                    </h1>
                    <p className="text-lg md:text-xl leading-relaxed text-slate-600">{intro}</p>
                </div>
            </header>

            <div className="container mx-auto px-6 md:px-12 max-w-4xl py-14 md:py-20">
                <div className="flex flex-col gap-12">
                    {blocks.map((block) => (
                        <section key={block.heading}>
                            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-5">
                                {block.heading}
                            </h2>
                            {(block.paragraphs || []).map((paragraph) => (
                                <p key={paragraph} className="text-slate-600 leading-relaxed mb-4">
                                    {paragraph}
                                </p>
                            ))}
                            {block.body && (
                                <p className="text-slate-600 leading-relaxed mb-4">{block.body}</p>
                            )}
                            {(block.bullets || []).length > 0 && (
                                <ul className="list-disc pl-6 space-y-2 text-slate-600">
                                    {block.bullets.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            )}
                            {(block.subheads || []).map((sub) => (
                                <div key={sub.heading} className="mt-8">
                                    <h3 className="text-xl font-bold text-gray-900 mb-3">
                                        {sub.heading}
                                    </h3>
                                    <p className="text-slate-600 leading-relaxed">{sub.body}</p>
                                    {sub.href && (
                                        <Link
                                            href={sub.href}
                                            className="inline-block mt-3 text-purple-700 font-semibold hover:underline"
                                        >
                                            {sub.linkText} →
                                        </Link>
                                    )}
                                </div>
                            ))}
                            {block.example && (
                                <p className="mt-5 rounded-2xl border border-purple-100 bg-purple-50/70 p-5 text-slate-700">
                                    <span className="font-bold text-purple-800">Example: </span>
                                    {block.example}
                                </p>
                            )}
                            {(block.links || []).map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="inline-block mt-4 text-purple-700 font-semibold hover:underline"
                                >
                                    {link.text} →
                                </Link>
                            ))}
                        </section>
                    ))}

                    {faqs.length > 0 && (
                        <section>
                            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
                                {faqHeading}
                            </h2>
                            <div className="flex flex-col gap-5">
                                {faqs.map((faq) => (
                                    <div key={faq.q} className="rounded-2xl border border-gray-100 p-6">
                                        <h3 className="font-bold text-gray-900 mb-2">{faq.q}</h3>
                                        <p className="text-slate-600 leading-relaxed">{faq.a}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {related.length > 0 && (
                        <section className="rounded-3xl bg-gray-50 p-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-5">
                                Explore more
                            </h2>
                            <ul className="flex flex-col gap-3">
                                {related.map((link) => (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            className="text-purple-700 font-semibold hover:underline"
                                        >
                                            {link.text} →
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>

            <JsonLd
                data={serviceSchema({
                    name: serviceName,
                    description: serviceDescription,
                    url: path,
                    serviceType: "Real estate CRM",
                })}
            />
            <JsonLd data={faqSchema(faqs)} />
        </article>
    );
}
