"use client";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

export default function AboutPage() {
    return (
        <div className="bg-white min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto mb-20">
                    <span className="text-purple-600 font-bold tracking-wider uppercase text-sm mb-2 block">Our Story</span>
                    <h1 className="text-4xl md:text-6xl font-bold text-gray-900 tracking-tight mb-6">Redefining real estate discovery.</h1>
                    <p className="text-xl text-gray-600 leading-relaxed">
                        SpaceEzy was founded with a single mission: to make the journey of finding a home as beautiful and transparent as the home itself.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center mb-24">
                    <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="relative h-[500px] rounded-[40px] overflow-hidden">
                        <Image src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80" alt="Our Vision" fill className="object-cover" />
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                        <h2 className="text-3xl font-bold text-gray-900 mb-6">Built on trust and transparency.</h2>
                        <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                            The real estate market is often complex and overwhelming. We built SpaceEzy to cut through the noise, providing our clients with curated options, honest advice, and end-to-end support.
                        </p>
                        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                            Whether you&apos;re looking for a luxury penthouse in the city center or a peaceful villa in the suburbs, our expert advisors work tirelessly to match you with a property that perfectly aligns with your lifestyle and investment goals.
                        </p>
                        
                        <div className="flex flex-col gap-4">
                            {["Zero brokerage on partner projects", "Dedicated relationship managers", "Legal and documentation assistance", "Post-sales support"].map((item, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <CheckCircle2 className="text-purple-600" size={20} />
                                    <span className="text-gray-800 font-medium">{item}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center mb-24"
                >
                    <div className="relative h-[440px] rounded-[40px] overflow-hidden order-1">
                        <Image src="/images/founder.jpg" alt="Kamal, Founder of SpaceEzy" fill className="object-cover" />
                    </div>
                    <div className="order-2">
                        <span className="text-purple-600 font-bold tracking-wider uppercase text-sm mb-2 block">Founder&apos;s Message</span>
                        <h2 className="text-3xl font-bold text-gray-900 mb-6">A promise from our founder.</h2>
                        <p className="text-lg text-gray-600 mb-5 leading-relaxed">
                            &ldquo;Building SpaceEzy has been a promise to every family that trusts us with one of the biggest decisions of their lives.
                            Real estate has long been complicated — opaque pricing, scattered inventory, and slow communication. We started SpaceEzy
                            to change that: one transparent platform where builders, brokers, and buyers meet on the same page.&rdquo;
                        </p>
                        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                            &ldquo;To every customer reading this — thank you. We will keep listening, keep improving, and keep earning your trust,
                            one home at a time.&rdquo;
                        </p>
                        <div>
                            <p className="text-xl font-bold text-gray-900">Kamal</p>
                            <p className="text-purple-600 font-semibold">Founder &amp; CEO, SpaceEzy</p>
                        </div>
                    </div>
                </motion.div>

                <div className="bg-gray-50 rounded-[40px] p-12 md:p-20 text-center">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-16">The principles that guide everything we do.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div>
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                <span className="text-2xl">🤝</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Integrity First</h3>
                            <p className="text-gray-600 leading-relaxed">We believe in complete transparency. We only recommend properties we would invest in ourselves.</p>
                        </div>
                        <div>
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                <span className="text-2xl">💎</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Premium Quality</h3>
                            <p className="text-gray-600 leading-relaxed">We curate our listings meticulously, ensuring every project meets our high standards for design and construction.</p>
                        </div>
                        <div>
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                <span className="text-2xl">🚀</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Client Obsession</h3>
                            <p className="text-gray-600 leading-relaxed">Your satisfaction is our only metric of success. We&apos;re with you from discovery to handover.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
