"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import {
    fetchPublicProjects,
    fetchPublicConfigurations,
    fetchPublicProperty,
    fetchPublicLocations,
    submitPublicEnquiry,
} from "../../../lib/api/publicSite";
import { formatPrice } from "../../../utils/format";

const placeLabel = (location) =>
    [location?.locality || location?.district, location?.state].filter(Boolean).join(", ");

export default function EnquiryClient({ type = "enquiry", projectSlug = "", propertyToken = "", configuration = "" }) {
    const isVisit = type === "visit";

    const [projects, setProjects] = useState([]);
    const [unitTypes, setUnitTypes] = useState([]);
    const [property, setProperty] = useState(null);
    // State -> District -> Region master, fetched once from the public
    // locations endpoint (no login needed). Drives the cascading selects.
    const [states, setStates] = useState([]);
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
        projectSlug: projectSlug || "",
        projectOther: "",
        stateId: "",
        districtId: "",
        regionId: "",
        date: "",
        time: "10:00",
        unitType: configuration || "",
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
        fetchPublicLocations()
            .then((list) => {
                if (active) setStates(Array.isArray(list) ? list : []);
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

    // Cascading location picks -> one readable string ("Region, District,
    // State"), deepest choice first. Every level is optional, so a skipped
    // level simply drops out of the label.
    const selectedState = states.find((state) => state.id === form.stateId) || null;
    const selectedDistrict = selectedState?.districts?.find((d) => d.id === form.districtId) || null;
    const selectedRegion = selectedDistrict?.regions?.find((r) => r.id === form.regionId) || null;
    const locationLabel = [selectedRegion?.name, selectedDistrict?.name, selectedState?.name]
        .filter(Boolean)
        .join(", ");

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

        // Enquiry context the visitor states in their own words. These are real
        // columns on Lead, so they stay filterable and reportable instead of
        // being buried in the free-text `message`.
        if (locationLabel) payload.enquiryLocation = locationLabel;
        // Only meaningful when no project was resolved: a dropdown pick (or a
        // deep link) already yields projectId server-side. `form.projectOther`
        // persists after a later dropdown pick, so guard on both.
        if (!projectSlug && !form.projectSlug && form.projectOther.trim()) {
            payload.requestedProjectName = form.projectOther.trim();
        }
        if (form.message.trim()) payload.message = form.message.trim();

        if (form.projectSlug) payload.projectSlug = form.projectSlug;
        if (propertyToken) payload.propertyToken = propertyToken;
        if (isVisit && form.date) payload.preferredVisitDate = form.date;
        if (isVisit && form.time) payload.preferredVisitTime = form.time;
        if (form.unitType) payload.interestedUnitType = form.unitType;
        // Configuration attribution: the visitor's selection (or the
        // deep-linked configuration) resolves to a configurationId server-side.
        const configLabel = form.unitType || configuration;
        if (configLabel) payload.configuration = configLabel;

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
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block" htmlFor="enquiry-phone">WhatsApp Number *</label>
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
                            {!form.projectSlug && (
                                <>
                                    <p className="text-xs text-gray-400 mt-2">If your project isn&apos;t listed, type it below.</p>
                                    <input
                                        id="enquiry-project-other"
                                        value={form.projectOther}
                                        onChange={(e) => setForm({ ...form, projectOther: e.target.value })}
                                        className="mt-2 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                        placeholder="Type your project name"
                                    />
                                </>
                            )}
                        </div>
                    )}

                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase mb-2 block">Location (Optional)</span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="sr-only" htmlFor="enquiry-state">State</label>
                                <select
                                    id="enquiry-state"
                                    value={form.stateId}
                                    onChange={(e) => setForm({ ...form, stateId: e.target.value, districtId: "", regionId: "" })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    <option value="">Select state</option>
                                    {states.map((state) => (
                                        <option key={state.id} value={state.id}>{state.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="sr-only" htmlFor="enquiry-district">District</label>
                                <select
                                    id="enquiry-district"
                                    disabled={!form.stateId}
                                    value={form.districtId}
                                    onChange={(e) => setForm({ ...form, districtId: e.target.value, regionId: "" })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">{form.stateId ? "Select district" : "Select state first"}</option>
                                    {(selectedState?.districts || []).map((district) => (
                                        <option key={district.id} value={district.id}>{district.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="sr-only" htmlFor="enquiry-region">Region</label>
                                <select
                                    id="enquiry-region"
                                    disabled={!form.districtId}
                                    value={form.regionId}
                                    onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="">
                                        {!form.districtId
                                            ? "Select district first"
                                            : (selectedDistrict?.regions || []).length
                                                ? "Select region"
                                                : "No regions listed"}
                                    </option>
                                    {(selectedDistrict?.regions || []).map((region) => (
                                        <option key={region.id} value={region.id}>{region.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

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
