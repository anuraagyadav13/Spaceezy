"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import {
    fetchPublicProjects,
    fetchPublicConfigurations,
    fetchPublicProperty,
    submitPublicEnquiry,
} from "../../../lib/api/publicSite";
import { formatPrice } from "../../../utils/format";

const placeLabel = (location) =>
    [location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

export default function EnquiryClient({ type = "enquiry", projectSlug = "", propertyToken = "" }) {
    const isVisit = type === "visit";

    const [projects, setProjects] = useState([]);
    const [unitTypes, setUnitTypes] = useState([]);
    const [property, setProperty] = useState(null);
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
        projectSlug: projectSlug || "",
        date: "",
        time: "10:00",
        unitType: "",
        message: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        fetchPublicProjects({ limit: 50 })
            .then((result) => {
                if (active) setProjects(result?.items || []);
            })
            .catch(() => {});
        fetchPublicConfigurations()
            .then((list) => {
                if (active) setUnitTypes(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
        if (propertyToken) {
            fetchPublicProperty(propertyToken)
                .then((detail) => {
                    if (active) setProperty(detail);
                })
                .catch(() => {});
        }
        return () => {
            active = false;
        };
    }, [propertyToken]);

    const selectedProject = projects.find((project) => project.slug === (projectSlug || form.projectSlug));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        const payload = {
            name: form.name.trim(),
            phone: form.phone.trim(),
            source: "Website",
        };
        if (form.email.trim()) payload.email = form.email.trim();
        if (form.message.trim()) payload.message = form.message.trim();
        if (form.projectSlug) payload.projectSlug = form.projectSlug;
        if (propertyToken) payload.propertyToken = propertyToken;
        if (isVisit && form.date) payload.preferredVisitDate = form.date;
        if (isVisit && form.time) payload.preferredVisitTime = form.time;
        if (form.unitType) payload.interestedUnitType = form.unitType;

        try {
            await submitPublicEnquiry(payload);
            setSubmitted(true);
        } catch (err) {
            if (err?.status === 429) {
                setError("Too many enquiries — please wait a moment and try again.");
            } else {
                setError(err?.message || "Something went wrong while sending your enquiry. Please try again.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-white rounded-[32px] p-10 md:p-16 shadow-xl border border-gray-100 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Request Received!</h2>
                <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
                    Thank you, {form.name}. Our property experts will get back to you shortly to {isVisit ? "confirm your site visit" : "assist with your enquiry"}.
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
                    {isVisit ? "Schedule a Site Visit" : "Enquire Now"}
                </h1>
                <p className="text-gray-600 text-lg leading-relaxed mb-8">
                    {isVisit
                        ? "Experience our premium properties firsthand. Select your preferred date and time, and our relationship manager will guide you through the property."
                        : "Have questions about a property or project? Leave your details below and our experts will provide you with all the information you need."}
                </p>
                {property && (
                    <div className="bg-purple-50 rounded-2xl p-6 border border-purple-100 mb-6">
                        <p className="text-sm font-bold text-purple-800 uppercase tracking-wider mb-1">Enquiring About</p>
                        <p className="text-xl font-bold text-gray-900">{property.title}</p>
                        <p className="text-sm text-gray-600">
                            {[
                                property.project?.name,
                                property.configuration,
                                property.area ? `${property.area} sq.ft` : null,
                                property.price != null ? formatPrice(property.price) : null,
                            ].filter(Boolean).join(" · ")}
                        </p>
                        {placeLabel(property.location) && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <MapPin size={14} /> {placeLabel(property.location)}
                            </p>
                        )}
                    </div>
                )}
                {projectSlug && (
                    <div className="bg-purple-50 rounded-2xl p-6 border border-purple-100 mb-8">
                        <p className="text-sm font-bold text-purple-800 uppercase tracking-wider mb-1">Selected Project</p>
                        <p className="text-xl font-bold text-gray-900">{selectedProject?.name || projectSlug}</p>
                        {selectedProject && (
                            <p className="text-sm text-gray-600">{placeLabel(selectedProject.location) || "Location coming soon"}</p>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 w-full max-w-xl">
                <form onSubmit={handleSubmit} className="bg-white rounded-[32px] p-8 shadow-xl shadow-gray-200/50 border border-gray-100 flex flex-col gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-name">Name *</label>
                            <input
                                id="enquiry-name"
                                required
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="John Doe"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-phone">Phone *</label>
                            <input
                                id="enquiry-phone"
                                required
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="+91 98765 43210"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-email">Email</label>
                        <input
                            id="enquiry-email"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            placeholder="john@example.com"
                        />
                    </div>

                    {!projectSlug && (
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-project">Interested Project (Optional)</label>
                            <select
                                id="enquiry-project"
                                value={form.projectSlug}
                                onChange={(e) => setForm({ ...form, projectSlug: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">Select a project</option>
                                {projects.map((project) => (
                                    <option key={project.slug} value={project.slug}>{project.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-unit-type">Interested Unit Type (Optional)</label>
                        <select
                            id="enquiry-unit-type"
                            value={form.unitType}
                            onChange={(e) => setForm({ ...form, unitType: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                            <option value="">Any unit type</option>
                            {unitTypes.map((unitType) => (
                                <option key={unitType} value={unitType}>{unitType}</option>
                            ))}
                        </select>
                    </div>

                    {isVisit && (
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-date">Preferred Date *</label>
                                <input
                                    id="enquiry-date"
                                    required
                                    type="date"
                                    value={form.date}
                                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-time">Time</label>
                                <select
                                    id="enquiry-time"
                                    value={form.time}
                                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    <option value="10:00">Morning (10 AM - 12 PM)</option>
                                    <option value="13:00">Afternoon (12 PM - 4 PM)</option>
                                    <option value="16:30">Evening (4 PM - 7 PM)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-message">Message</label>
                        <textarea
                            id="enquiry-message"
                            value={form.message}
                            onChange={(e) => setForm({ ...form, message: e.target.value })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            rows="3"
                            placeholder="Any specific requirements?"
                        ></textarea>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3" role="alert">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors mt-2 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {submitting
                            ? "Sending…"
                            : isVisit
                                ? "Confirm Visit Request"
                                : "Submit Enquiry"}
                    </button>
                    <p className="text-xs text-center text-gray-400 mt-2">By submitting this form, you agree to our privacy policy.</p>
                </form>
            </div>
        </div>
    );
}
