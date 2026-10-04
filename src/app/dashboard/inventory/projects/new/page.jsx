"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Check, ChevronRight, Building2, MapPin, FileText, IndianRupee,
    Sparkles, ImagePlus, UploadCloud, Link2, X, Shield, Calendar, Layers, Hash,
    Landmark, Globe, Navigation, Building, BarChart3, Users, Clock, Home, 
    Store, Combine
} from "lucide-react";
import { createProject } from "../../../../../lib/api/projects";
import { showToast } from "../../../../../lib/toast";
import { AmenitiesSelector } from "../../../../../components/AmenitiesSelector";

/* ───────────────────────── constants ───────────────────────── */

const STEPS = [
    { label: "Basic Details", icon: Building2 },
    { label: "Location", icon: MapPin },
    { label: "Overview", icon: FileText },
    { label: "RERA & Compliance", icon: Shield },
    { label: "Pricing", icon: IndianRupee },
    { label: "Amenities", icon: Sparkles },
    { label: "Gallery & Docs", icon: ImagePlus },
];

const PROJECT_TYPES = [
    { name: "Residential", icon: Home, desc: "Apartments, Villas, Townhouses" },
    { name: "Commercial", icon: Store, desc: "Office, Retail, Warehouse" },
    { name: "Mixed_Use", icon: Combine, desc: "Residential + Commercial" },
];

const PROJECT_STATUSES = [
    { value: "UPCOMING", label: "Upcoming", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { value: "PRE_LAUNCH", label: "Pre-Launch", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { value: "UNDER_CONSTRUCTION", label: "Under Construction", color: "bg-orange-50 text-orange-700 border-orange-200" },
    { value: "READY_TO_MOVE", label: "Ready to Move", color: "bg-green-50 text-green-700 border-green-200" },
    { value: "AVAILABLE", label: "Available", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    { value: "COMPLETED", label: "Completed", color: "bg-teal-50 text-teal-700 border-teal-200" },
    { value: "ON_HOLD", label: "On Hold", color: "bg-gray-50 text-gray-700 border-gray-200" },
    { value: "SOLD_OUT", label: "Sold Out", color: "bg-red-50 text-red-700 border-red-200" },
];

const LAND_AREA_UNITS = ["Sq. Ft.", "Sq. M.", "Acres", "Hectares", "Guntha", "Bigha"];

/* ────────── reusable UI atoms (matching quick-add design) ───────── */

const Label = ({ children, required }) => (
    <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">
        {children} {required && <span className="text-violet-600">*</span>}
    </label>
);

const Input = ({ icon: Icon, ...props }) => (
    <div className="relative mt-3">
        {Icon && (
            <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Icon size={16} />
            </div>
        )}
        <input
            {...props}
            className={`w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] ${Icon ? "pl-10" : "px-4"} pr-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-gray-400`}
        />
    </div>
);

const TextArea = (props) => (
    <textarea
        {...props}
        className="mt-3 w-full resize-none rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-gray-400"
    />
);

const Select = ({ children, ...props }) => (
    <select
        {...props}
        className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
    >
        {children}
    </select>
);

const SectionTitle = ({ icon: Icon, children }) => (
    <div className="flex items-center gap-2.5 pb-3 mb-6 border-b border-[#e7e2ee]">
        {Icon && <Icon size={18} className="text-violet-500" />}
        <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">{children}</h3>
    </div>
);

/* ───────────────────────── main component ───────────────────────── */

export default function AddProjectPage() {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        // Basic
        name: "",
        projectType: "Residential",
        status: "UPCOMING",
        developer: "",
        // Location
        address: "",
        locality: "",
        city: "",
        state: "",
        pincode: "",
        landmark: "",
        mapUrl: "",
        latitude: "",
        longitude: "",
        // Overview
        description: "",
        shortDescription: "",
        totalLandArea: "",
        landAreaUnit: "Sq. Ft.",
        totalTowers: "",
        totalFloors: "",
        totalUnits: "",
        availableUnits: "",
        launchDate: "",
        expectedCompletionDate: "",
        possessionDate: "",
        // RERA
        reraRegistered: false,
        reraNumber: "",
        reraAuthority: "",
        // Pricing
        startingPrice: "",
        maximumPrice: "",
        pricePerSqFt: "",
        priceUnit: "per sq.ft.",
        maintenanceCharges: "",
        plcCharges: "",
        parkingCharges: "",
        clubCharges: "",
        otherCharges: "",
        // Amenities
        amenities: [],
        // Gallery & Docs
        images: [],
        documents: [],
        connectivity: [],
    });

    const updateField = (field, value) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    /* ──── connectivity helpers ──── */
    const addConnectivity = () =>
        setForm((prev) => ({
            ...prev,
            connectivity: [...prev.connectivity, { name: "", category: "", distance: "", time: "" }],
        }));

    const updateConnectivity = (index, field, value) =>
        setForm((prev) => ({
            ...prev,
            connectivity: prev.connectivity.map((c, i) =>
                i === index ? { ...c, [field]: value } : c
            ),
        }));

    const removeConnectivity = (index) =>
        setForm((prev) => ({
            ...prev,
            connectivity: prev.connectivity.filter((_, i) => i !== index),
        }));

    /* ──── image helpers ──── */
    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const urls = files.map((f) => URL.createObjectURL(f));
        setForm((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
    };

    const removeImage = (index) =>
        setForm((prev) => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index),
        }));

    /* ──── navigation ──── */
    const handleBack = () => {
        if (currentStep > 0) return setCurrentStep((s) => s - 1);
        router.back();
    };

    const handleNext = async () => {
        if (currentStep < STEPS.length - 1) return setCurrentStep((s) => s + 1);
        await handleSubmit();
    };

    /* ──── validation + submit ──── */
    const handleSubmit = async () => {
        if (!form.name?.trim()) {
            showToast("Project name is required", "error");
            setCurrentStep(0);
            return;
        }

        setSaving(true);
        try {
            const toNum = (v) => (v === "" || v === null || v === undefined ? undefined : Number(v) || undefined);

            const payload = {
                name: form.name.trim(),
                projectType: form.projectType,
                status: form.status,
                developer: form.developer || undefined,
                address: form.address?.trim() || undefined,
                locality: form.locality || undefined,
                city: form.city || undefined,
                state: form.state || undefined,
                pincode: form.pincode || undefined,
                landmark: form.landmark || undefined,
                mapUrl: form.mapUrl || undefined,
                latitude: toNum(form.latitude),
                longitude: toNum(form.longitude),
                description: form.description || undefined,
                shortDescription: form.shortDescription || undefined,
                totalLandArea: toNum(form.totalLandArea),
                landAreaUnit: form.landAreaUnit || undefined,
                totalTowers: toNum(form.totalTowers),
                totalFloors: toNum(form.totalFloors),
                totalUnits: toNum(form.totalUnits),
                availableUnits: toNum(form.availableUnits),
                launchDate: form.launchDate || undefined,
                expectedCompletionDate: form.expectedCompletionDate || undefined,
                possessionDate: form.possessionDate || undefined,
                reraRegistered: form.reraRegistered,
                reraNumber: form.reraNumber || undefined,
                reraAuthority: form.reraAuthority || undefined,
                startingPrice: toNum(form.startingPrice),
                maximumPrice: toNum(form.maximumPrice),
                pricePerSqFt: toNum(form.pricePerSqFt),
                priceUnit: form.priceUnit || undefined,
                maintenanceCharges: toNum(form.maintenanceCharges),
                plcCharges: toNum(form.plcCharges),
                parkingCharges: toNum(form.parkingCharges),
                clubCharges: toNum(form.clubCharges),
                otherCharges: toNum(form.otherCharges),
                amenities: form.amenities.length > 0 ? form.amenities : undefined,
                images: form.images.length > 0 ? form.images : undefined,
                documents: form.documents.length > 0 ? form.documents : undefined,
                connectivity: form.connectivity.length > 0 ? form.connectivity : undefined,
            };

            await createProject(payload);
            showToast("Project created successfully!", "success");
            router.push("/dashboard/inventory");
        } catch (err) {
            // apiClient rejects with a string message, not an Error object
            const msg = typeof err === "string" ? err : err?.message || "Unknown error";
            console.error("Create project failed:", err);
            showToast(`Failed to create project: ${msg}`, "error");
        } finally {
            setSaving(false);
        }
    };

    /* ═══════════════════════════════ STEP RENDERERS ═══════════════════════════════ */

    const renderBasicDetails = () => (
        <div className="space-y-10">
            {/* Project Type */}
            <div>
                <SectionTitle icon={Building2}>Project Type</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {PROJECT_TYPES.map((pt) => {
                        const selected = form.projectType === pt.name;
                        const Icon = pt.icon;
                        return (
                            <button
                                type="button"
                                key={pt.name}
                                onClick={() => updateField("projectType", pt.name)}
                                className={`group rounded-[22px] border p-5 text-left transition-all duration-200 ${selected
                                    ? "border-violet-400 bg-violet-50 shadow-[0_0_0_1px_rgba(124,58,237,0.15)]"
                                    : "border-[#d9d2e3] bg-white hover:border-violet-200 hover:shadow-sm"
                                    }`}
                            >
                                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-xl border transition-colors ${selected
                                    ? "border-violet-300 bg-violet-100 text-violet-600"
                                    : "border-[#e8e1f0] bg-[#f4f1f9] text-gray-400 group-hover:text-violet-400"
                                    }`}>
                                    <Icon size={24} strokeWidth={1.5} />
                                </div>
                                <div className="mt-4 text-center">
                                    <div className={`text-lg font-semibold ${selected ? "text-violet-700" : "text-gray-700"}`}>
                                        {pt.name === "Mixed_Use" ? "Mixed Use" : pt.name}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-400">{pt.desc}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Name + Developer */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <Label required>Project Name</Label>
                    <Input
                        icon={Building}
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="e.g. Binghamti Hills Phase 2"
                    />
                </div>
                <div>
                    <Label>Developer / Builder</Label>
                    <Input
                        icon={Users}
                        value={form.developer}
                        onChange={(e) => updateField("developer", e.target.value)}
                        placeholder="e.g. Lodha Group"
                    />
                </div>
            </div>

            {/* Status */}
            <div>
                <SectionTitle icon={BarChart3}>Project Status</SectionTitle>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PROJECT_STATUSES.map((s) => {
                        const selected = form.status === s.value;
                        return (
                            <button
                                type="button"
                                key={s.value}
                                onClick={() => updateField("status", s.value)}
                                className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${selected
                                    ? "border-violet-400 bg-violet-50 text-violet-700 shadow-[0_0_0_1px_rgba(124,58,237,0.15)]"
                                    : `${s.color} hover:shadow-sm`
                                    }`}
                            >
                                {s.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );

    const renderLocation = () => (
        <div className="space-y-10">
            <div>
                <SectionTitle icon={MapPin}>Address Details</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="lg:col-span-2">
                        <Label required>Full Address</Label>
                        <Input
                            icon={MapPin}
                            value={form.address}
                            onChange={(e) => updateField("address", e.target.value)}
                            placeholder="Enter the complete project address"
                        />
                    </div>
                    <div>
                        <Label>Locality / Area</Label>
                        <Input
                            icon={Navigation}
                            value={form.locality}
                            onChange={(e) => updateField("locality", e.target.value)}
                            placeholder="e.g. Baner"
                        />
                    </div>
                    <div>
                        <Label>City</Label>
                        <Input
                            icon={Building2}
                            value={form.city}
                            onChange={(e) => updateField("city", e.target.value)}
                            placeholder="e.g. Pune"
                        />
                    </div>
                    <div>
                        <Label>State</Label>
                        <Input
                            icon={Globe}
                            value={form.state}
                            onChange={(e) => updateField("state", e.target.value)}
                            placeholder="e.g. Maharashtra"
                        />
                    </div>
                    <div>
                        <Label>Pincode</Label>
                        <Input
                            icon={Hash}
                            value={form.pincode}
                            onChange={(e) => updateField("pincode", e.target.value)}
                            placeholder="e.g. 411045"
                        />
                    </div>
                    <div>
                        <Label>Landmark</Label>
                        <Input
                            icon={Landmark}
                            value={form.landmark}
                            onChange={(e) => updateField("landmark", e.target.value)}
                            placeholder="e.g. Near Phoenix Mall"
                        />
                    </div>
                    <div>
                        <Label>Google Maps URL</Label>
                        <Input
                            icon={Link2}
                            value={form.mapUrl}
                            onChange={(e) => updateField("mapUrl", e.target.value)}
                            placeholder="Paste Google Maps link"
                        />
                    </div>
                </div>
            </div>

            {/* Connectivity */}
            <div>
                <SectionTitle icon={Navigation}>Connectivity & Nearby</SectionTitle>
                {form.connectivity.map((item, idx) => (
                    <div key={idx} className="mb-3 grid grid-cols-[1fr_1fr_100px_100px_40px] gap-3 items-end">
                        <div>
                            {idx === 0 && <Label>Place</Label>}
                            <Input
                                value={item.name}
                                onChange={(e) => updateConnectivity(idx, "name", e.target.value)}
                                placeholder="e.g. Airport"
                            />
                        </div>
                        <div>
                            {idx === 0 && <Label>Category</Label>}
                            <Input
                                value={item.category}
                                onChange={(e) => updateConnectivity(idx, "category", e.target.value)}
                                placeholder="Transport"
                            />
                        </div>
                        <div>
                            {idx === 0 && <Label>Distance</Label>}
                            <Input
                                value={item.distance}
                                onChange={(e) => updateConnectivity(idx, "distance", e.target.value)}
                                placeholder="5 km"
                            />
                        </div>
                        <div>
                            {idx === 0 && <Label>Time</Label>}
                            <Input
                                value={item.time}
                                onChange={(e) => updateConnectivity(idx, "time", e.target.value)}
                                placeholder="10 min"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeConnectivity(idx)}
                            className="mt-3 flex h-[46px] w-[40px] items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-500 transition hover:bg-red-100"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    onClick={addConnectivity}
                    className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-800 transition"
                >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-600">+</span>
                    Add Connectivity Point
                </button>
            </div>
        </div>
    );

    const renderOverview = () => (
        <div className="space-y-10">
            <div>
                <SectionTitle icon={FileText}>Project Description</SectionTitle>
                <div className="space-y-5">
                    <div>
                        <Label>Short Description</Label>
                        <TextArea
                            value={form.shortDescription}
                            onChange={(e) => updateField("shortDescription", e.target.value)}
                            rows={2}
                            placeholder="A brief tagline for the project (max 200 chars)"
                        />
                    </div>
                    <div>
                        <Label>Full Description</Label>
                        <TextArea
                            value={form.description}
                            onChange={(e) => updateField("description", e.target.value)}
                            rows={5}
                            placeholder="Detailed project description, key highlights, and USPs"
                        />
                    </div>
                </div>
            </div>

            <div>
                <SectionTitle icon={Layers}>Project Specifications</SectionTitle>
                <div className="rounded-[18px] border border-[#e7e0ee] bg-[#f7f5f9] p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <Label>Total Land Area</Label>
                            <div className="mt-3 flex gap-2">
                                <input
                                    type="number"
                                    value={form.totalLandArea}
                                    onChange={(e) => updateField("totalLandArea", e.target.value)}
                                    placeholder="Area"
                                    className="flex-1 rounded-xl border border-[#d9d2e3] bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                />
                                <select
                                    value={form.landAreaUnit}
                                    onChange={(e) => updateField("landAreaUnit", e.target.value)}
                                    className="w-28 rounded-xl border border-[#d9d2e3] bg-white px-3 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                >
                                    {LAND_AREA_UNITS.map((u) => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <Label>Total Towers</Label>
                            <Input
                                type="number"
                                value={form.totalTowers}
                                onChange={(e) => updateField("totalTowers", e.target.value)}
                                placeholder="e.g. 5"
                            />
                        </div>
                        <div>
                            <Label>Total Floors</Label>
                            <Input
                                type="number"
                                value={form.totalFloors}
                                onChange={(e) => updateField("totalFloors", e.target.value)}
                                placeholder="e.g. 40"
                            />
                        </div>
                        <div>
                            <Label>Total Units</Label>
                            <Input
                                type="number"
                                value={form.totalUnits}
                                onChange={(e) => updateField("totalUnits", e.target.value)}
                                placeholder="e.g. 500"
                            />
                        </div>
                        <div>
                            <Label>Available Units</Label>
                            <Input
                                type="number"
                                value={form.availableUnits}
                                onChange={(e) => updateField("availableUnits", e.target.value)}
                                placeholder="e.g. 120"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <SectionTitle icon={Calendar}>Key Dates</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <Label>Launch Date</Label>
                        <Input
                            type="date"
                            value={form.launchDate}
                            onChange={(e) => updateField("launchDate", e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Expected Completion</Label>
                        <Input
                            type="date"
                            value={form.expectedCompletionDate}
                            onChange={(e) => updateField("expectedCompletionDate", e.target.value)}
                        />
                    </div>
                    <div>
                        <Label>Possession Date</Label>
                        <Input
                            type="date"
                            value={form.possessionDate}
                            onChange={(e) => updateField("possessionDate", e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    const renderRERA = () => (
        <div className="space-y-10">
            <SectionTitle icon={Shield}>RERA & Compliance Details</SectionTitle>

            {/* Toggle */}
            <div className="rounded-[22px] border border-[#e7e0ee] bg-[#f7f5f9] p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-base font-semibold text-gray-800">RERA Registered</div>
                        <div className="mt-1 text-sm text-gray-500">Toggle if this project is RERA approved</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => updateField("reraRegistered", !form.reraRegistered)}
                        className={`relative h-8 w-14 rounded-full transition-colors duration-300 ${form.reraRegistered ? "bg-violet-600" : "bg-gray-300"}`}
                    >
                        <span
                            className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ${form.reraRegistered ? "translate-x-6" : ""}`}
                        />
                    </button>
                </div>
            </div>

            {form.reraRegistered && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
                    <div>
                        <Label required>RERA Number</Label>
                        <Input
                            icon={Hash}
                            value={form.reraNumber}
                            onChange={(e) => updateField("reraNumber", e.target.value)}
                            placeholder="e.g. P52100045678"
                        />
                    </div>
                    <div>
                        <Label>RERA Authority</Label>
                        <Input
                            icon={Landmark}
                            value={form.reraAuthority}
                            onChange={(e) => updateField("reraAuthority", e.target.value)}
                            placeholder="e.g. MahaRERA"
                        />
                    </div>
                </div>
            )}

            {!form.reraRegistered && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <Shield size={20} className="text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                        RERA registration is mandatory for projects in India. You can add the number later if pending.
                    </p>
                </div>
            )}
        </div>
    );

    const renderPricing = () => (
        <div className="space-y-10">
            <div>
                <SectionTitle icon={IndianRupee}>Base Pricing</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <Label>Starting Price (₹)</Label>
                        <Input
                            icon={IndianRupee}
                            type="number"
                            value={form.startingPrice}
                            onChange={(e) => updateField("startingPrice", e.target.value)}
                            placeholder="e.g. 7500000"
                        />
                    </div>
                    <div>
                        <Label>Maximum Price (₹)</Label>
                        <Input
                            icon={IndianRupee}
                            type="number"
                            value={form.maximumPrice}
                            onChange={(e) => updateField("maximumPrice", e.target.value)}
                            placeholder="e.g. 25000000"
                        />
                    </div>
                    <div>
                        <Label>Price per Sq. Ft. (₹)</Label>
                        <Input
                            icon={IndianRupee}
                            type="number"
                            value={form.pricePerSqFt}
                            onChange={(e) => updateField("pricePerSqFt", e.target.value)}
                            placeholder="e.g. 12500"
                        />
                    </div>
                </div>
            </div>

            <div>
                <SectionTitle icon={BarChart3}>Additional Charges</SectionTitle>
                <div className="rounded-[18px] border border-[#e7e0ee] bg-[#f7f5f9] p-6">
                    <div className="space-y-4">
                        {[
                            { label: "Maintenance Charges", field: "maintenanceCharges", placeholder: "Monthly maintenance" },
                            { label: "PLC Charges", field: "plcCharges", placeholder: "Preferential location" },
                            { label: "Parking Charges", field: "parkingCharges", placeholder: "Per parking slot" },
                            { label: "Club Membership", field: "clubCharges", placeholder: "Clubhouse membership" },
                            { label: "Other Charges", field: "otherCharges", placeholder: "Misc. charges" },
                        ].map((item) => (
                            <div key={item.field} className="grid grid-cols-[1fr_180px] items-center gap-4">
                                <div className="text-sm font-medium text-gray-700">{item.label}</div>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        value={form[item.field]}
                                        onChange={(e) => updateField(item.field, e.target.value)}
                                        placeholder={item.placeholder}
                                        className="w-full rounded-lg border border-[#d9d2e3] bg-white py-2.5 pl-7 pr-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderAmenities = () => (
        <div className="space-y-6">
            <AmenitiesSelector
                selectedAmenities={form.amenities}
                onChange={(amenities) => updateField("amenities", amenities)}
                propertyType={form.projectType}
            />
            {form.amenities.length > 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="text-sm font-semibold text-violet-700 mb-2">
                        {form.amenities.length} amenities selected
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {form.amenities.map((a) => (
                            <span key={a} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-700 border border-violet-200">
                                {a}
                                <button type="button" onClick={() => updateField("amenities", form.amenities.filter((x) => x !== a))} className="text-violet-400 hover:text-violet-600">
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

    const renderGallery = () => (
        <div className="space-y-10">
            <div>
                <SectionTitle icon={ImagePlus}>Project Images</SectionTitle>
                <label className="flex min-h-[200px] cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-[#d9d2e3] bg-[#faf7ff] p-10 text-center transition hover:bg-[#f3edff] hover:border-violet-300">
                    <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleImageUpload} />
                    <div>
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                            <UploadCloud size={26} />
                        </div>
                        <div className="mt-4 text-lg font-semibold text-gray-800">Click to upload images</div>
                        <div className="mt-1 text-sm text-gray-500">PNG, JPG, or WebP up to 5MB each</div>
                    </div>
                </label>

                {form.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        {form.images.map((img, idx) => (
                            <div key={idx} className="group relative aspect-video overflow-hidden rounded-xl border border-gray-200">
                                <img src={img} alt={`Project ${idx + 1}`} className="h-full w-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => removeImage(idx)}
                                    className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-red-500 opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <SectionTitle icon={FileText}>Documents</SectionTitle>
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <FileText size={20} className="text-gray-400 shrink-0" />
                    <p className="text-sm text-gray-500">
                        Document uploads (brochures, floor plans, legal docs) can be added after project creation from the project detail page.
                    </p>
                </div>
            </div>
        </div>
    );

    const stepRenderers = [
        renderBasicDetails,
        renderLocation,
        renderOverview,
        renderRERA,
        renderPricing,
        renderAmenities,
        renderGallery,
    ];

    /* ═══════════════════════════════ LAYOUT ═══════════════════════════════ */

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f3f6]">
            {/* Breadcrumb */}
            <div className="px-4 pb-4 pt-6 sm:px-8">
                <div className="mx-auto max-w-6xl text-sm text-gray-500">
                    Home <span className="px-2">›</span> Project &amp; Inventory Management <span className="px-2">›</span> <span className="font-medium text-gray-700">Add New Project</span>
                </div>
            </div>

            {/* Stepper */}
            <div className="px-4 pb-4 sm:px-8">
                <div className="mx-auto max-w-6xl rounded-[28px] border border-[#ebe2f5] bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2">
                        {STEPS.map((step, index) => {
                            const isActive = currentStep === index;
                            const isComplete = currentStep > index;
                            const Icon = step.icon;

                            return (
                                <div key={step.label} className="relative flex flex-1 items-center justify-center">
                                    {/* Connector line */}
                                    <div className={`absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 transition-colors ${isComplete ? "bg-violet-300" : "bg-[#e7e2ee]"}`} />
                                    <div className="relative z-10 flex flex-col items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isComplete || isActive) setCurrentStep(index);
                                            }}
                                            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300 ${isActive
                                                ? "border-violet-500 bg-violet-600 text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]"
                                                : isComplete
                                                    ? "border-violet-400 bg-violet-100 text-violet-700 cursor-pointer hover:bg-violet-200"
                                                    : "border-[#d9d2e3] bg-white text-gray-400"
                                                }`}
                                        >
                                            {isComplete ? <Check size={16} /> : <Icon size={16} />}
                                        </button>
                                        <div className={`text-[11px] font-medium whitespace-nowrap ${isActive ? "text-violet-700" : isComplete ? "text-violet-500" : "text-gray-400"}`}>
                                            {step.label}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
                <div className="mx-auto max-w-6xl rounded-[28px] border border-[#ebe2f5] bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-8">
                    {/* Step title bar */}
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{STEPS[currentStep].label}</h2>
                            <p className="mt-1 text-sm text-gray-500">Step {currentStep + 1} of {STEPS.length}</p>
                        </div>
                        <div className="flex items-center gap-2 rounded-full bg-violet-50 px-4 py-2">
                            <div className="h-2 w-2 rounded-full bg-violet-500" />
                            <span className="text-xs font-semibold text-violet-700">
                                {Math.round(((currentStep + 1) / STEPS.length) * 100)}% Complete
                            </span>
                        </div>
                    </div>
                    {stepRenderers[currentStep]()}
                </div>

                {/* Navigation Buttons */}
                <div className="mx-auto mt-5 flex max-w-6xl items-center justify-between pb-4">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#d9d2e3] bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 hover:shadow-sm"
                    >
                        <ArrowLeft size={16} />
                        {currentStep === 0 ? "Cancel" : "Back"}
                    </button>

                    <div className="flex items-center gap-3">
                        {/* Save Draft (skip for now, or could wire up later) */}
                        {currentStep > 0 && (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={saving}
                                className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                            >
                                Save as Draft
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-8 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(124,58,237,0.28)] transition hover:opacity-95 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <Clock size={16} className="animate-spin" />
                                    Creating...
                                </>
                            ) : currentStep === STEPS.length - 1 ? (
                                <>
                                    <Check size={16} />
                                    Create Project
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight size={16} />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
