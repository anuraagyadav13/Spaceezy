"use client";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, MapPin, Search, CheckCircle2, ImageOff, Home } from "lucide-react";
import { formatPrice } from "../../utils/format";

const placeLabel = (location) =>
    [location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

const availabilityClasses = (availability) =>
    availability === "Available"
        ? "bg-emerald-500/80 text-white border-emerald-300"
        : availability === "Limited Availability"
            ? "bg-amber-500/80 text-white border-amber-300"
            : "bg-gray-700/80 text-white border-gray-500";

export default function HomeClient({ projects, properties, locations }) {
    const { scrollYProgress } = useScroll();
    const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 200]);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

    const fadeInUp = {
        hidden: { opacity: 0, y: 40 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
    };

    return (
        <div className="flex flex-col bg-white overflow-hidden">
            {/* HERO SECTION */}
            <section className="relative h-screen flex items-center justify-center overflow-hidden">
                <motion.div style={{ y: heroY, opacity: heroOpacity }} className="absolute inset-0 z-0">
                    <Image
                        src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=2800&q=80"
                        alt="Luxury Real Estate"
                        fill
                        className="object-cover"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-900/60 via-gray-900/20 to-gray-900/90"></div>
                </motion.div>

                <div className="container mx-auto px-6 md:px-12 relative z-10 text-center text-white mt-16">
                    <motion.h1
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 drop-shadow-lg"
                    >
                        Real Estate Properties in Ghaziabad
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.4 }}
                        className="text-lg md:text-2xl text-gray-200 mb-10 max-w-2xl mx-auto font-light drop-shadow"
                    >
                        Browse flats, plots, homes and commercial properties across Wave City and top localities — live inventory, transparent prices, zero brokerage.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.6 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link href="/projects" className="w-full sm:w-auto bg-white text-gray-900 px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-100 hover:scale-105 transition-all flex items-center justify-center gap-2">
                            Explore Projects <ArrowRight size={20} />
                        </Link>
                        <Link href="/search" className="w-full sm:w-auto bg-black/30 backdrop-blur-md text-white border border-white/30 px-8 py-4 rounded-full font-medium text-lg hover:bg-black/50 transition-all flex items-center justify-center gap-2">
                            Search Properties <Search size={20} />
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* QUICK DISCOVERY */}
            <section className="relative z-20 -mt-20 px-6 md:px-12 container mx-auto mb-32">
                <motion.div
                    initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeInUp}
                    className="bg-white rounded-[32px] shadow-2xl p-8 md:p-12 border border-gray-100 flex flex-col md:flex-row gap-8 justify-between items-center"
                >
                    <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Start your search</h3>
                        <p className="text-gray-500">Find exactly what you&apos;re looking for.</p>
                    </div>
                    <form className="flex-1 flex w-full md:w-auto gap-4" action="/search">
                        <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-200 flex items-center gap-3 focus-within:ring-2 focus-within:ring-purple-500 transition-all">
                            <MapPin className="text-purple-500" />
                            <select name="stateId" className="bg-transparent w-full focus:outline-none text-gray-700 font-medium cursor-pointer appearance-none">
                                <option value="">All Locations</option>
                                {locations.map((state) => (
                                    <option key={state.id} value={state.id}>{state.name}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="bg-gray-900 text-white px-8 rounded-2xl font-bold hover:bg-gray-800 transition-colors">
                            Search
                        </button>
                    </form>
                </motion.div>
            </section>

            {/* SEO LINK CLUSTER — crawlable paths to the main landing pages */}
            <section className="container mx-auto px-6 md:px-12 pb-10">
                <div className="max-w-4xl">
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">Explore real estate in Ghaziabad with SpaceEzy</h2>
                    <p className="text-gray-600 leading-relaxed mb-5">
                        SpaceEzy is a real estate marketplace for Ghaziabad and the NCR region. Compare live inventory
                        of flats, plots and commercial properties, or jump straight to a focused listing page:
                    </p>
                    <ul className="flex flex-wrap gap-3">
                        {[
                            ["/properties-in-ghaziabad", "Properties in Ghaziabad"],
                            ["/properties-in-wave-city", "Properties in Wave City"],
                            ["/flats-for-sale", "Flats for Sale"],
                            ["/plots-for-sale", "Plots for Sale"],
                            ["/commercial-properties", "Commercial Properties"],
                            ["/residential-properties", "Residential Properties"],
                            ["/projects", "Projects"],
                        ].map(([href, label]) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="inline-block rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:border-purple-300 hover:text-purple-700 transition-colors"
                                >
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>

            {/* FEATURED PROJECTS */}
            <section className="py-24 bg-gray-50">
                <div className="container mx-auto px-6 md:px-12">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex justify-between items-end mb-16">
                        <div>
                            <span className="text-purple-600 font-bold tracking-wider uppercase text-sm mb-2 block">Exclusive Portfolio</span>
                            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">Featured Projects</h2>
                        </div>
                        <Link href="/projects" className="hidden md:flex items-center gap-2 text-gray-600 font-medium hover:text-purple-600 transition-colors pb-2 border-b-2 border-transparent hover:border-purple-600">
                            View all projects <ArrowRight size={18} />
                        </Link>
                    </motion.div>

                    {projects.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-gray-100 p-12 text-center">
                            <h3 className="text-2xl font-bold text-gray-900 mb-3">New projects are on the way</h3>
                            <p className="text-gray-500 mb-6 max-w-md mx-auto">
                                We are publishing fresh projects right now. Check back shortly, or browse the properties that are available today.
                            </p>
                            <div className="flex flex-wrap justify-center gap-4">
                                <Link href="/projects" className="bg-gray-900 text-white px-8 py-3 rounded-full font-bold hover:bg-gray-800 transition-colors">
                                    Browse Projects
                                </Link>
                                <Link href="/properties" className="bg-gray-50 text-gray-900 px-8 py-3 rounded-full font-bold hover:bg-gray-100 transition-colors">
                                    View Properties
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {projects.map((project, i) => (
                                <motion.div
                                    key={project.slug}
                                    initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} custom={i}
                                    className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100"
                                >
                                    <div className="relative h-72 overflow-hidden bg-gray-100">
                                        {project.image ? (
                                            <img src={project.image} alt={project.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                                <ImageOff size={40} />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                                        <div className="absolute bottom-4 left-6">
                                            {project.status ? (
                                                <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 mb-2 inline-block">
                                                    {String(project.status).replace(/_/g, " ")}
                                                </span>
                                            ) : null}
                                            <h3 className="text-2xl font-bold text-white">{project.name}</h3>
                                            <p className="text-gray-200 text-sm flex items-center gap-1 mt-1">
                                                <MapPin size={14}/> {placeLabel(project.location) || "Location coming soon"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Starting From</p>
                                                <p className="text-lg font-bold text-purple-600">
                                                    {project.startingPrice != null ? formatPrice(project.startingPrice) : "On request"}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Configurations</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {(project.configurations || []).join(", ") || "—"}
                                                </p>
                                            </div>
                                        </div>
                                        <Link href={`/projects/${project.slug}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-900 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                            View Details
                                        </Link>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* FEATURED PROPERTIES */}
            {properties.length > 0 && (
                <section className="py-24 bg-white">
                    <div className="container mx-auto px-6 md:px-12">
                        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex justify-between items-end mb-16">
                            <div>
                                <span className="text-purple-600 font-bold tracking-wider uppercase text-sm mb-2 block">Ready to Move</span>
                                <h2 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">Featured Properties</h2>
                            </div>
                            <Link href="/properties" className="hidden md:flex items-center gap-2 text-gray-600 font-medium hover:text-purple-600 transition-colors pb-2 border-b-2 border-transparent hover:border-purple-600">
                                View all properties <ArrowRight size={18} />
                            </Link>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {properties.map((property, i) => (
                                <motion.div
                                    key={property.token}
                                    initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} custom={i}
                                    className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100"
                                >
                                    <div className="relative h-72 overflow-hidden bg-gray-100">
                                        {property.image ? (
                                            <img src={property.image} alt={property.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                                <ImageOff size={40} />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                                        <div className="absolute top-4 right-4">
                                            <span className="bg-white/95 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                                {property.price != null ? formatPrice(property.price) : "On request"}
                                            </span>
                                        </div>
                                        <div className="absolute bottom-4 left-6 right-6">
                                            <span className={`text-[11px] font-bold px-3 py-1 rounded-full border mb-2 inline-block ${availabilityClasses(property.availability)}`}>
                                                {property.availability}
                                            </span>
                                            <h3 className="text-2xl font-bold text-white">{property.title}</h3>
                                            <p className="text-gray-200 text-sm flex items-center gap-1 mt-1">
                                                <MapPin size={14}/> {placeLabel(property.location) || "Location coming soon"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                            <div>
                                                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Project</p>
                                                <p className="text-sm font-medium text-gray-900">{property.project?.name || "—"}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Configuration</p>
                                                <p className="text-sm font-medium text-gray-900">
                                                    {property.configuration || "—"}
                                                    {property.area ? ` · ${property.area} sq.ft` : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <Link href={`/properties/${property.token}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-900 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                            View Details
                                        </Link>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <p className="text-center text-sm text-gray-400 mt-10 flex items-center justify-center gap-2">
                            <Home size={14} /> {properties.length} verified units available right now
                        </p>
                    </div>
                </section>
            )}

            {/* WHY SPACEEZY / TRUST */}
            <section className="py-32 bg-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gray-50 rounded-l-[100px] z-0 hidden lg:block"></div>
                <div className="container mx-auto px-6 md:px-12 relative z-10 flex flex-col lg:flex-row gap-16 items-center">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex-1">
                        <span className="text-purple-600 font-bold tracking-wider uppercase text-sm mb-2 block">The Spaceezy Advantage</span>
                        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-6">Why choose us to find your next home?</h2>
                        <p className="text-gray-600 text-lg mb-8 leading-relaxed">
                            We curate only the finest properties and projects from trusted developers. Our transparent process ensures you make the right investment with complete peace of mind.
                        </p>
                        <div className="flex flex-col gap-6">
                            {[
                                "Verified properties & RERA registered projects",
                                "Zero brokerage on new developer projects",
                                "Dedicated relationship manager for site visits",
                                "Complete end-to-end documentation assistance"
                            ].map((text, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="text-purple-600" size={20} />
                                    </div>
                                    <p className="text-gray-800 font-medium">{text}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="flex-1 relative w-full h-[600px] rounded-[40px] overflow-hidden shadow-2xl">
                        <Image src="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80" alt="Premium Living" fill className="object-cover" />
                    </motion.div>
                </div>
            </section>

            {/* CTA SECTION */}
            <section className="py-24 bg-gray-900 text-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=2800&q=80')] bg-cover bg-center"></div>
                <div className="absolute inset-0 bg-gray-900/80"></div>

                <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeInUp} className="container mx-auto px-6 relative z-10">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">Ready to find your dream property?</h2>
                    <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto font-light">
                        Leave your details and our property experts will get in touch with you shortly to understand your requirements.
                    </p>
                    <Link href="/enquiry" className="inline-block bg-white text-gray-900 px-10 py-4 rounded-full font-bold text-lg hover:bg-purple-50 hover:scale-105 transition-all shadow-xl">
                        Enquire Now
                    </Link>
                </motion.div>
            </section>
        </div>
    );
}
