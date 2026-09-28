"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { getProjects } from "../../../lib/mock/projects";
import { MapPin, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setProjects(getProjects());
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-4">Discover Projects</h1>
                    <p className="text-gray-500 text-lg max-w-2xl">
                        Explore our curated selection of premium real estate projects designed for exceptional living.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {projects.map((project, i) => (
                        <motion.div 
                            key={project.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col"
                        >
                            <div className="relative h-64 overflow-hidden">
                                <Image src={project.images[0]} alt={project.name} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                                <div className="absolute bottom-4 left-6">
                                    <span className="bg-white/20 backdrop-blur-md text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30 mb-2 inline-block">
                                        {project.status}
                                    </span>
                                    <h3 className="text-2xl font-bold text-white">{project.name}</h3>
                                    <p className="text-gray-200 text-sm flex items-center gap-1 mt-1"><MapPin size={14}/> {project.location}, {project.city}</p>
                                </div>
                            </div>
                            <div className="p-6 flex-grow flex flex-col justify-between">
                                <div className="mb-6">
                                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                                        <div>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Starting From</p>
                                            <p className="text-lg font-bold text-purple-600">{project.startingPrice}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Configurations</p>
                                            <p className="text-sm font-medium text-gray-900">{project.configurations.join(", ")}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-2">{project.description}</p>
                                </div>
                                <Link href={`/projects/${project.slug}`} className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-900 hover:text-white text-gray-900 py-3 rounded-xl font-bold transition-colors">
                                    View Project Details <ArrowRight size={18} />
                                </Link>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}
