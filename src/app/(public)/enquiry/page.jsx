"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { submitEnquiry } from "../../../lib/mock/enquiries";
import { getProjects } from "../../../lib/mock/projects";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

function EnquiryFormContent() {
    const searchParams = useSearchParams();
    const type = searchParams.get("type") || "enquiry"; // 'enquiry' or 'visit'
    const projectSlug = searchParams.get("project") || "";
    const propertyId = searchParams.get("property") || "";
    
    const projects = getProjects();
    const project = projects.find(p => p.slug === projectSlug);

    const [form, setForm] = useState({
        name: "", phone: "", email: "", project: project?.name || "", date: "", time: "", message: ""
    });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        submitEnquiry({ ...form, type, propertyId });
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="bg-white rounded-[32px] p-10 md:p-16 shadow-xl border border-gray-100 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Request Received!</h2>
                <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
                    Thank you, {form.name}. Our property experts will get back to you shortly to {type === 'visit' ? "confirm your site visit" : "assist with your enquiry"}.
                </p>
                <Link href="/" className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors">
                    Back to Homepage <ArrowRight size={18} />
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row gap-12 lg:items-center">
            <div className="flex-1 lg:pr-12">
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight mb-6">
                    {type === "visit" ? "Schedule a Site Visit" : "Enquire Now"}
                </h1>
                <p className="text-gray-600 text-lg leading-relaxed mb-8">
                    {type === "visit" 
                        ? "Experience our premium properties firsthand. Select your preferred date and time, and our relationship manager will guide you through the property."
                        : "Have questions about a property or project? Leave your details below and our experts will provide you with all the information you need."}
                </p>
                {project && (
                    <div className="bg-purple-50 rounded-2xl p-6 border border-purple-100 mb-8">
                        <p className="text-sm font-bold text-purple-800 uppercase tracking-wider mb-1">Selected Project</p>
                        <p className="text-xl font-bold text-gray-900">{project.name}</p>
                        <p className="text-sm text-gray-600">{project.location}, {project.city}</p>
                    </div>
                )}
            </div>
            
            <div className="flex-1 w-full max-w-xl">
                <form onSubmit={handleSubmit} className="bg-white rounded-[32px] p-8 shadow-xl shadow-gray-200/50 border border-gray-100 flex flex-col gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Name *</label>
                            <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="John Doe" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Phone *</label>
                            <input required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="+91 98765 43210" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Email</label>
                        <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none" placeholder="john@example.com" />
                    </div>
                    
                    {!project && (
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Interested Project (Optional)</label>
                            <select value={form.project} onChange={e => setForm({...form, project: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                <option value="">Select a project</option>
                                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                    )}

                    {type === "visit" && (
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Preferred Date *</label>
                                <input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Time</label>
                                <select value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none">
                                    <option value="Morning (10 AM - 12 PM)">Morning</option>
                                    <option value="Afternoon (12 PM - 4 PM)">Afternoon</option>
                                    <option value="Evening (4 PM - 7 PM)">Evening</option>
                                </select>
                            </div>
                        </div>
                    )}
                    
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Message</label>
                        <textarea value={form.message} onChange={e => setForm({...form, message: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none" rows="3" placeholder="Any specific requirements?"></textarea>
                    </div>

                    <button type="submit" className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors mt-2 text-lg">
                        {type === "visit" ? "Confirm Visit Request" : "Submit Enquiry"}
                    </button>
                    <p className="text-xs text-center text-gray-400 mt-2">By submitting this form, you agree to our privacy policy.</p>
                </form>
            </div>
        </div>
    );
}

export default function EnquiryPage() {
    return (
        <div className="bg-gray-50 min-h-screen pt-32 pb-24">
            <div className="container mx-auto px-6 md:px-12">
                <Suspense fallback={<div className="flex justify-center p-20"><div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div></div>}>
                    <EnquiryFormContent />
                </Suspense>
            </div>
        </div>
    );
}
