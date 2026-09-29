"use client";
import { useParams, notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getPropertyById } from "../../../../lib/mock/properties";
import { getProjects } from "../../../../lib/mock/projects";
import { formatPrice } from "../../../../utils/format";
import { MapPin, Maximize, Compass, ArrowLeft, Building2 } from "lucide-react";

export default function PropertyDetailPage() {
    const params = useParams();
    
    const property = getPropertyById(params.id);
    if (!property) {
        notFound();
    }
    
    const prjs = getProjects();
    const project = prjs.find(p => p.id === property.projectId);

    if (!project) return null;

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-32">
            <div className="container mx-auto px-6 md:px-12">
                <Link href="/properties" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-purple-600 mb-8 font-medium transition-colors">
                    <ArrowLeft size={16} /> Back to properties
                </Link>
                
                <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                    {/* GALLERY */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
                        <div className="relative h-64 md:h-[500px] rounded-[32px] overflow-hidden">
                            <Image src={property.images[0]} alt={property.title} fill className="object-cover" />
                        </div>
                        <div className="grid grid-rows-2 gap-2">
                            <div className="relative rounded-[32px] overflow-hidden">
                                <Image src={property.images[1] || project.images[0]} alt="Gallery 2" fill className="object-cover" />
                            </div>
                            <div className="relative rounded-[32px] overflow-hidden">
                                <Image src={project.images[1] || property.images[0]} alt="Gallery 3" fill className="object-cover" />
                            </div>
                        </div>
                    </div>

                    <div className="p-8 md:p-12 flex flex-col lg:flex-row gap-16">
                        {/* LEFT DETAILS */}
                        <div className="flex-1">
                            <div className="mb-8">
                                <span className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full border border-purple-100 mb-4 inline-block">
                                    {property.status}
                                </span>
                                <h1 className="text-3xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">{property.title}</h1>
                                <p className="text-lg text-gray-500 flex items-center gap-2"><MapPin size={20}/> {project.location}, {project.city}</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 py-8 border-y border-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Price</p>
                                    <p className="text-xl font-bold text-gray-900">{formatPrice(property.price)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Configuration</p>
                                    <p className="text-lg font-semibold text-gray-900">{property.configuration}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Area</p>
                                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-1"><Maximize size={16}/> {property.area} sqft</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Facing</p>
                                    <p className="text-lg font-semibold text-gray-900 flex items-center gap-1"><Compass size={16}/> {property.facing}</p>
                                </div>
                            </div>

                            <h2 className="text-2xl font-bold text-gray-900 mb-4">About this property</h2>
                            <p className="text-gray-600 leading-relaxed text-lg mb-8">
                                Unit {property.unitNumber} is a premium {property.configuration} residence located on floor {property.floor}. 
                                Enjoy breathtaking views and state-of-the-art finishings in one of the most sought-after projects in {project.city}. 
                                Residents have full access to {project.name}&apos;s exclusive amenities.
                            </p>

                            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                        <Building2 className="text-gray-900" size={24}/>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">Part of {project.name}</p>
                                        <p className="text-xs text-gray-500">By {project.developer}</p>
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
                                <h3 className="text-4xl font-bold text-gray-900 mb-8">{formatPrice(property.price)}</h3>
                                
                                <div className="flex flex-col gap-3">
                                    <Link href={`/enquiry?property=${property.id}&project=${project.slug}`} className="w-full text-center bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors">
                                        Enquire Now
                                    </Link>
                                    <Link href={`/enquiry?property=${property.id}&project=${project.slug}&type=visit`} className="w-full text-center bg-purple-50 text-purple-700 py-4 rounded-xl font-bold hover:bg-purple-100 transition-colors border border-purple-100">
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
