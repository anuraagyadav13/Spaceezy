"use client";
import { Mail, Phone, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function ContactPage() {
    return (
        <div className="bg-white min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto mb-20">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">Get in touch</h1>
                    <p className="text-xl text-gray-500">
                        We&apos;re here to answer any questions you have about our properties, projects, or services.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-20">
                    <div className="bg-gray-50 rounded-[32px] p-8 text-center flex flex-col items-center border border-gray-100">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                            <Phone className="text-gray-900" size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Phone</h3>
                        <p className="text-gray-500 mb-4">Mon-Sat from 9am to 6pm.</p>
                        <a href="tel:+917827267897" className="text-purple-600 font-bold text-lg hover:underline">+91 78272 67897</a>
                        <a
                            href="https://wa.me/917827267897?text=Hi%20SpaceEzy!%20I'm%20interested%20in%20your%20properties."
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-block bg-[#25D366] text-white text-sm font-bold px-5 py-2 rounded-full hover:bg-[#1EBE5A] transition-colors"
                        >
                            Chat on WhatsApp
                        </a>
                    </div>
                    
                    <div className="bg-gray-50 rounded-[32px] p-8 text-center flex flex-col items-center border border-gray-100">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                            <Mail className="text-gray-900" size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Email</h3>
                        <p className="text-gray-500 mb-4">We usually respond within 24 hours.</p>
                        <a href="mailto:admin@spaceezy.com" className="text-purple-600 font-bold text-lg hover:underline">admin@spaceezy.com</a>
                    </div>
                    
                    <div className="bg-gray-50 rounded-[32px] p-8 text-center flex flex-col items-center border border-gray-100">
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                            <MapPin className="text-gray-900" size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Office</h3>
                        <p className="text-gray-500 mb-4">Come say hello at our HQ.</p>
                        <p className="text-gray-900 font-bold">Office No. 04, 1st Floor, Wave Galleria<br/>Sector-3, Wave City, Ghaziabad 201002</p>
                    </div>
                </div>
                
                <div className="bg-gray-900 rounded-[40px] p-12 text-center max-w-4xl mx-auto relative overflow-hidden">
                    <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2800&q=80')] bg-cover bg-center"></div>
                    <div className="relative z-10">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">Looking for a specific property?</h2>
                        <p className="text-gray-300 mb-10 max-w-xl mx-auto text-lg">
                            Fill out our detailed enquiry form and our experts will match you with the perfect home.
                        </p>
                        <Link href="/enquiry" className="inline-block bg-white text-gray-900 px-10 py-4 rounded-full font-bold text-lg hover:bg-purple-50 transition-colors shadow-xl">
                            Go to Enquiry Form
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
