"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getProperties } from "../../../lib/mock/properties";
import { getProjects } from "../../../lib/mock/projects";
import { MapPin, ArrowRight, Maximize, Compass } from "lucide-react";
import { motion } from "framer-motion";

export default function PropertiesPage() {
    const [properties, setProperties] = useState([]);
    const [projects, setProjects] = useState({});

    useEffect(() => {
        const timer = setTimeout(() => {
            const props = getProperties();
            setProperties(props);
            
            const prjs = getProjects();
            const prjMap = {};
            prjs.forEach(p => prjMap[p.id] = p);
            setProjects(prjMap);
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    const formatPrice = (price) => {
        if (price >= 10000000) return `₹ ${(price / 10000000).toFixed(2)} Cr`;
        if (price >= 100000) return `₹ ${(price / 100000).toFixed(2)} L`;
        return `₹ ${price.toLocaleString()}`;
    };

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">Available Properties</h1>
                    <p className="text-gray-500 text-lg max-w-2xl">
                        Discover your perfect home from our curated selection of premium units.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {properties.map((prop, i) => {
                        const project = projects[prop.projectId];
                        if (!project) return null;
                        
                        return (
                            <motion.div 
                                key={prop.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col"
                            >
                                <div className="relative h-64 overflow-hidden">
                                    <Image src={prop.images[0]} alt={prop.title} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                                    <div className="absolute top-4 right-4">
                                        <span className="bg-white/90 backdrop-blur-md text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                            {formatPrice(prop.price)}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-6 flex-grow flex flex-col justify-between">
                                    <div className="mb-6">
                                        <span className="text-purple-600 font-bold tracking-wider uppercase text-[10px] mb-2 block">{project.name}</span>
                                        <h3 className="text-xl font-bold text-gray-900 mb-2 leading-tight line-clamp-2">{prop.title}</h3>
                                        <p className="text-gray-500 text-sm flex items-center gap-1 mb-4"><MapPin size={14}/> {project.location}, {project.city}</p>
                                        
                                        <div className="grid grid-cols-3 gap-2 py-4 border-y border-gray-100">
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Conf</p>
                                                <p className="text-sm font-semibold text-gray-800">{prop.configuration}</p>
                                            </div>
                                            <div className="text-center border-x border-gray-100">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Area</p>
                                                <p className="text-sm font-semibold text-gray-800 flex items-center justify-center gap-1"><Maximize size={12}/> {prop.area} sqft</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Facing</p>
                                                <p className="text-sm font-semibold text-gray-800 flex items-center justify-center gap-1"><Compass size={12}/> {prop.facing}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <Link href={`/properties/${prop.id}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-purple-600 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                        View Property <ArrowRight size={18} />
                                    </Link>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
