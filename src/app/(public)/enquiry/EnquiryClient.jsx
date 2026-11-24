"use client";
import { useEffect, useState } from "react";
import {
    CheckCircle2,
    ArrowRight,
    MapPin,
    UserRound,
    MessageCircle,
    Mail,
    Building2,
    Pencil,
    Layers3,
    MessageSquareText,
    Headphones,
    Zap,
    ShieldCheck,
    Send,
    CalendarDays,
    Clock,
    ChevronDown,
} from "lucide-react";
import Image from "next/image";
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

const inputCls =
    "w-full rounded-xl border border-gray-200 bg-[#fbfaff] pl-11 pr-4 py-3.5 text-sm text-gray-800 " +
    "placeholder:text-gray-400 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100 " +
    "dark:bg-[#191c25] dark:placeholder:text-gray-500";
const selectCls =
    "w-full appearance-none rounded-xl border border-gray-200 bg-[#fbfaff] pl-11 pr-10 py-3.5 text-sm " +
    "text-gray-800 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100 " +
    "disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#191c25]";

const labelCls = "mb-2 block text-[13px] font-bold text-gray-800";
const required = <span className="text-rose-500"> *</span>;

function Field({ icon: Icon, label, htmlFor, optional = false, children }) {
    return (
        <div>
            <label className={labelCls} htmlFor={htmlFor}>
                {label}
                {optional ? <span className="font-normal text-gray-400"> (Optional)</span> : required}
            </label>
            <div className="relative">
                {Icon && (
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                        <Icon size={18} />
                    </span>
                )}
                {children}
            </div>
        </div>
    );
}

function SelectChevron() {
    return (
        <ChevronDown
            size={16}
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
    );
}

const BENEFITS = [
    {
        icon: Headphones,
        title: "Expert Assistance",
        text: "Get guidance from our property experts",
    },
    {
        icon: Zap,
        title: "Quick Response",
        text: "We'll get back to you soon",
    },
    {
        icon: ShieldCheck,
        title: "Accurate Information",
        text: "Verified project and unit details",
    },
];

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
            <div className="mx-auto max-w-2xl rounded-[32px] border border-white bg-white/90 px-8 py-14 text-center shadow-[0_24px_70px_-32px_rgba(76,29,149,0.45)] backdrop-blur">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                </div>
                <h2 className="mb-4 text-3xl font-bold text-gray-900">Request Received!</h2>
                <p className="mx-auto mb-8 max-w-md text-lg text-gray-500">
                    Thank you, {form.name}. Our property experts will get back to you shortly to{" "}
                    {isVisit ? "confirm your site visit" : "assist with your enquiry"}.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-4 font-bold text-white transition-colors hover:bg-purple-700"
                >
                    Back to Homepage <ArrowRight size={18} />
                </Link>
            </div>
        );
    }

    return (
        <div className="relative rounded-[36px] border border-white/70 bg-white/70 shadow-[0_30px_90px_-45px_rgba(76,29,149,0.55)] backdrop-blur-sm lg:grid lg:grid-cols-[0.9fr_1.1fr]">
            {/* LEFT: brand, copy, benefits and illustration */}
            <div className="relative overflow-hidden px-6 py-10 sm:px-10 lg:px-12 lg:py-14">
                <div className="pointer-events-none absolute -left-24 top-24 h-80 w-80 rounded-full bg-purple-200/50 blur-3xl" />
                <div className="relative">
                    <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
                        {isVisit ? "Schedule a Site Visit" : "Enquire Now"}
                    </h1>
                    <p className="mb-10 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
                        {isVisit
                            ? "Experience our premium properties firsthand. Select your preferred date and time, and our relationship manager will guide you through the property."
                            : "Have questions about a property or project? Leave your details below and our experts will provide you with all the information you need."}
                    </p>

                    {(property || projectSlug) && (
                        <div className="mb-10 rounded-2xl border border-purple-100 bg-purple-50/80 p-5">
                            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-purple-700">
                                {property ? "Enquiring About" : "Selected Project"}
                            </p>
                            <p className="text-lg font-bold text-gray-900">
                                {property?.title || selectedProject?.name || projectSlug}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                                {property
                                    ? [
                                          property.project?.name,
                                          property.configuration,
                                          property.area ? `${property.area} sq.ft` : null,
                                          property.price != null ? formatPrice(property.price) : null,
                                      ]
                                          .filter(Boolean)
                                          .join(" · ")
                                    : placeLabel(selectedProject?.location) || "Location coming soon"}
                            </p>
                            {property && placeLabel(property.location) && (
                                <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                                    <MapPin size={14} /> {placeLabel(property.location)}
                                </p>
                            )}
                        </div>
                    )}

                    <ul className="space-y-6">
                        {BENEFITS.map(({ icon: Icon, title, text }) => (
                            <li key={title} className="flex items-start gap-4">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                                    <Icon size={20} />
                                </span>
                                <div>
                                    <p className="font-bold text-gray-900">{title}</p>
                                    <p className="text-sm text-slate-500">{text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative mt-10 hidden lg:block">
                    <div className="absolute bottom-0 left-1/2 h-52 w-72 -translate-x-1/2 rounded-full bg-purple-200/70 blur-2xl" />
                    <div className="relative mx-auto max-w-sm overflow-hidden rounded-t-[120px]">
                        <Image
                            src="/images/login-bg.jpg"
                            alt="Modern residential tower at sunset"
                            width={900}
                            height={600}
                            sizes="(max-width: 1024px) 0px, 420px"
                            className="h-64 w-full object-cover object-center"
                        />
                    </div>
                </div>
            </div>

            {/* RIGHT: the form card */}
            <div className="bg-white/60 p-4 sm:p-6 lg:p-8">
                <form
                    onSubmit={handleSubmit}
                    className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-[0_24px_70px_-40px_rgba(76,29,149,0.45)] sm:p-8"
                >
                    <div className="mb-7 flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                            <UserRound size={20} />
                        </span>
                        <h2 className="text-lg font-bold text-gray-900">Your Details</h2>
                    </div>

                    <div className="flex flex-col gap-5">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <Field icon={UserRound} label="Name" htmlFor="enquiry-name">
                                <input
                                    id="enquiry-name"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className={inputCls}
                                    placeholder="John Doe"
                                />
                            </Field>
                            <Field icon={MessageCircle} label="WhatsApp Number" htmlFor="enquiry-phone">
                                <input
                                    id="enquiry-phone"
                                    required
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    className={inputCls}
                                    placeholder="+91 98765 43210"
                                />
                            </Field>
                        </div>

                        <Field icon={Mail} label="Email" htmlFor="enquiry-email" optional>
                            <input
                                id="enquiry-email"
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className={inputCls}
                                placeholder="john@example.com"
                            />
                        </Field>

                        {!projectSlug && (
                            <Field icon={Building2} label="Interested Project" htmlFor="enquiry-project" optional>
                                <select
                                    id="enquiry-project"
                                    value={form.projectSlug}
                                    onChange={(e) => setForm({ ...form, projectSlug: e.target.value })}
                                    className={selectCls}
                                >
                                    <option value="">Select a project</option>
                                    {projects.map((project) => (
                                        <option key={project.slug} value={project.slug}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                                <SelectChevron />
                                {!form.projectSlug && (
                                    <>
                                        <p className="mt-2 text-xs text-gray-400">
                                            If your project isn&apos;t listed, type it below.
                                        </p>
                                        <div className="relative mt-2">
                                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                                <Pencil size={18} />
                                            </span>
                                            <input
                                                id="enquiry-project-other"
                                                value={form.projectOther}
                                                onChange={(e) => setForm({ ...form, projectOther: e.target.value })}
                                                className={inputCls}
                                                placeholder="Type your project name"
                                            />
                                        </div>
                                    </>
                                )}
                            </Field>
                        )}

                        <div>
                            <span className={labelCls}>Location (Optional)</span>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="relative">
                                    <label className="sr-only" htmlFor="enquiry-state">
                                        State
                                    </label>
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                        <MapPin size={18} />
                                    </span>
                                    <select
                                        id="enquiry-state"
                                        value={form.stateId}
                                        onChange={(e) =>
                                            setForm({ ...form, stateId: e.target.value, districtId: "", regionId: "" })
                                        }
                                        className={selectCls}
                                    >
                                        <option value="">Select state</option>
                                        {states.map((state) => (
                                            <option key={state.id} value={state.id}>
                                                {state.name}
                                            </option>
                                        ))}
                                    </select>
                                    <SelectChevron />
                                </div>
                                <div className="relative">
                                    <label className="sr-only" htmlFor="enquiry-district">
                                        District
                                    </label>
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                        <Building2 size={18} />
                                    </span>
                                    <select
                                        id="enquiry-district"
                                        disabled={!form.stateId}
                                        value={form.districtId}
                                        onChange={(e) => setForm({ ...form, districtId: e.target.value, regionId: "" })}
                                        className={selectCls}
                                    >
                                        <option value="">{form.stateId ? "Select district" : "Select state first"}</option>
                                        {(selectedState?.districts || []).map((district) => (
                                            <option key={district.id} value={district.id}>
                                                {district.name}
                                            </option>
                                        ))}
                                    </select>
                                    <SelectChevron />
                                </div>
                                <div className="relative">
                                    <label className="sr-only" htmlFor="enquiry-region">
                                        Region
                                    </label>
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                        <MapPin size={18} />
                                    </span>
                                    <select
                                        id="enquiry-region"
                                        disabled={!form.districtId}
                                        value={form.regionId}
                                        onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                                        className={selectCls}
                                    >
                                        <option value="">
                                            {!form.districtId
                                                ? "Select district first"
                                                : (selectedDistrict?.regions || []).length
                                                  ? "Select region"
                                                  : "No regions listed"}
                                        </option>
                                        {(selectedDistrict?.regions || []).map((region) => (
                                            <option key={region.id} value={region.id}>
                                                {region.name}
                                            </option>
                                        ))}
                                    </select>
                                    <SelectChevron />
                                </div>
                            </div>
                        </div>

                        <Field icon={Layers3} label="Interested Unit Type" htmlFor="enquiry-unit-type" optional>
                            <select
                                id="enquiry-unit-type"
                                value={form.unitType}
                                onChange={(e) => setForm({ ...form, unitType: e.target.value })}
                                className={selectCls}
                            >
                                <option value="">Any unit type</option>
                                {unitTypes.map((unitType) => (
                                    <option key={unitType} value={unitType}>
                                        {unitType}
                                    </option>
                                ))}
                            </select>
                            <SelectChevron />
                        </Field>

                        {isVisit && (
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                                <Field icon={CalendarDays} label="Preferred Date" htmlFor="enquiry-date">
                                    <input
                                        id="enquiry-date"
                                        required
                                        type="date"
                                        value={form.date}
                                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                                        className={inputCls}
                                    />
                                </Field>
                                <Field icon={Clock} label="Time" htmlFor="enquiry-time" optional>
                                    <select
                                        id="enquiry-time"
                                        value={form.time}
                                        onChange={(e) => setForm({ ...form, time: e.target.value })}
                                        className={selectCls}
                                    >
                                        <option value="10:00">Morning (10 AM - 12 PM)</option>
                                        <option value="13:00">Afternoon (12 PM - 4 PM)</option>
                                        <option value="16:30">Evening (4 PM - 7 PM)</option>
                                    </select>
                                    <SelectChevron />
                                </Field>
                            </div>
                        )}

                        <Field icon={MessageSquareText} label="Message" htmlFor="enquiry-message" optional>
                            <textarea
                                id="enquiry-message"
                                value={form.message}
                                onChange={(e) => setForm({ ...form, message: e.target.value })}
                                className={`w-full resize-y rounded-xl border border-gray-200 bg-[#fbfaff] px-4 py-3 pl-11 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-purple-400 focus:ring-4 focus:ring-purple-100 dark:bg-[#191c25] dark:placeholder:text-gray-500`}
                                rows="3"
                                placeholder="Any specific requirements?"
                            />
                        </Field>

                        {error && (
                            <div
                                className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
                                role="alert"
                            >
                                {error}
                            </div>
                        )}

                        {/* Sticky action bar: the form is tall, so keep the
                            primary action reachable without scrolling away. */}
                        <div className="sticky bottom-0 z-10 -mx-6 mt-2 border-t border-gray-100 bg-white/95 px-6 pb-1 pt-4 backdrop-blur sm:-mx-8 sm:px-8 dark:bg-[#14161d]/95">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-4 text-lg font-bold text-white shadow-lg shadow-purple-200 transition-all hover:-translate-y-0.5 hover:bg-purple-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Send size={18} />
                                {submitting ? "Sending…" : isVisit ? "Confirm Visit Request" : "Submit Enquiry"}
                            </button>
                            <p className="mt-2 text-center text-xs text-gray-400">
                                By submitting this form, you agree to our privacy policy.
                            </p>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
