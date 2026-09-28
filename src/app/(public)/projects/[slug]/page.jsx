"use client";
import { useState, useEffect } from "react";
import { useParams, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getProjectBySlug } from "../../../../lib/mock/projects";
import { MapPin, Building, CheckCircle2, FileText, Calendar } from "lucide-react";

export default function ProjectDetailPage() {
    const params = useParams();
    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const data = getProjectBySlug(params.slug);
        if (!data) {
            notFound();
        } else {
            setProject(data);
        }
        setLoading(false);
    }, [params.slug]);

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center pt-32 pb-24"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>;
    if (!project) return null;

    return (
        <div className="bg-white min-h-screen pb-32">
            {/* HERO */}
            <div className="relative h-[60vh] md:h-[80vh] w-full">
                <Image src={project.images[0]} alt={project.name} fill className="object-cover" priority />
                <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 via-transparent to-gray-900/90"></div>
                <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 md:pb-16 container mx-auto">
                    <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 mb-4 inline-block">
                        {project.status}
                    </span>
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 tracking-tight">{project.name}</h1>
                    <p className="text-lg md:text-xl text-gray-200 flex items-center gap-2"><MapPin size={20}/> {project.location}, {project.city}</p>
                </div>
            </div>

            <div className="container mx-auto px-6 md:px-12 mt-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* LEFT CONTENT */}
                <div className="lg:col-span-2 flex flex-col gap-12">
                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Project Overview</h2>
                        <p className="text-gray-600 leading-relaxed text-lg">{project.description}</p>
                    </section>
                    
                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Premium Amenities</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {project.amenities.map((amenity, i) => (
                                <div key={i} className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <CheckCircle2 className="text-purple-600 shrink-0" size={20} />
                                    <span className="text-gray-800 font-medium text-sm">{amenity}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">Gallery</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {project.images.slice(1).map((img, i) => (
                                <div key={i} className="relative h-48 md:h-64 rounded-3xl overflow-hidden group">
                                    <Image src={img} alt={`${project.name} Gallery ${i}`} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* RIGHT SIDEBAR */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-xl shadow-gray-100/50 sticky top-32">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 pb-6 border-b border-gray-100">Project Details</h3>
                        
                        <div className="flex flex-col gap-6 mb-8">
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><Building size={16}/> Developer</p>
                                <p className="font-bold text-gray-900">{project.developer}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><FileText size={16}/> RERA Number</p>
                                <p className="font-bold text-gray-900">{project.reraNumber}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1 flex items-center gap-2"><Calendar size={16}/> Possession</p>
                                <p className="font-bold text-gray-900">{project.possession}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Configurations</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {project.configurations.map((conf, i) => (
                                        <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm font-medium">{conf}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Starting Price</p>
                                <p className="text-3xl font-bold text-purple-600">{project.startingPrice}</p>
                            </div>
                        </div>

                        <Link href={`/enquiry?project=${project.slug}`} className="w-full flex justify-center items-center py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-colors mb-3">
                            Enquire Now
                        </Link>
                        <Link href={`/enquiry?project=${project.slug}&type=visit`} className="w-full flex justify-center items-center py-4 bg-purple-50 text-purple-700 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-100">
                            Schedule a Site Visit
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
