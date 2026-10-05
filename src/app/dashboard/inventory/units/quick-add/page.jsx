"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Eye, Plus, UploadCloud, X } from "lucide-react";
import { fetchProjects } from "../../../../../lib/api/projects";
import { fetchConfigurations } from "../../../../../lib/api/configurations";
import { createProperty } from "../../../../../lib/api/properties";
import { showToast } from "../../../../../lib/toast";
import { AmenitiesSelector } from "../../../../../components/AmenitiesSelector";

const STEPS = ["Basic Detail", "Amenities", "Gallery", "Other Details"];

const PURPOSES = [
    { name: "Sale", icon: "house" },
    { name: "Resale", icon: "sale" },
    { name: "Rental", icon: "rent" },
];

const UNIT_TYPES = [
    { name: "Residential", icon: "residential" },
    { name: "Commercial", icon: "commercial" },
    { name: "Plot", icon: "plot" },
];

const RESIDENTIAL_CONFIGURATIONS = ["1 RK", "1 BHK", "1.5 BHK", "2 BHK", "2.5 BHK", "3 BHK", "3.5 BHK", "4 BHK", "4.5 BHK", "5 BHK", "5.5 BHK", "6 BHK"];
const COMMERCIAL_CONFIGURATIONS = ["Office", "Retail Shop", "Showroom", "Commercial Space", "Warehouse", "Industrial Unit", "Co-working Space", "Food Court", "Restaurant", "Clinic", "Studio", "Godown"];

const parseCurrencyValue = (value) => {
    if (value === null || value === undefined || value === "") return 0;

    const input = String(value).replace(/,/g, "").trim();
    const normalized = input.toLowerCase();

    if (!Number.isNaN(Number(input))) {
        return Number(input);
    }

    if (normalized.includes("cr")) {
        return (Number(input.replace(/[^0-9.]/g, "")) || 0) * 10000000;
    }

    if (normalized.includes("l")) {
        return (Number(input.replace(/[^0-9.]/g, "")) || 0) * 100000;
    }

    if (normalized.includes("k")) {
        return (Number(input.replace(/[^0-9.]/g, "")) || 0) * 1000;
    }

    return Number(input.replace(/[^0-9.-]/g, "")) || 0;
};

const HouseIcon = ({ active = false }) => (
    <div className={`relative h-20 w-24 rounded-[18px] border ${active ? "border-violet-400 bg-violet-100/80" : "border-[#d2cce2] bg-[#f4f0f9]"}`}>
        <div className="absolute inset-x-4 bottom-6 h-8 rounded-md border-2 border-[#7e63bf] bg-[#f7f3ff]" />
        <div className="absolute inset-x-7 bottom-10 h-6 border-2 border-[#7e63bf] bg-[#efe9ff]" />
        <div className="absolute left-4 top-3 h-6 w-6 border-2 border-[#7e63bf]" />
        <div className="absolute right-4 top-3 h-6 w-6 border-2 border-[#7e63bf]" />
        <div className="absolute left-12 top-8 h-6 w-8 border-2 border-[#7e63bf]" />
        <div className="absolute inset-x-6 bottom-3 h-3 rounded bg-violet-200/80" />
    </div>
);

const UnitIllustration = ({ type, active = false }) => {
    const base = `relative h-28 w-32 rounded-[20px] border ${active ? "border-violet-400 bg-violet-50" : "border-[#d7d2de] bg-[#f5f3f7]"}`;

    if (type === "Commercial") {
        return (
            <div className={base}>
                <div className="absolute inset-x-8 inset-y-8 rounded-md border-2 border-[#7e63bf] bg-[#f3edff]" />
                <div className="absolute left-4 right-4 top-5 h-3 rounded bg-[#cabef7]" />
                <div className="absolute left-7 right-7 bottom-7 h-10 rounded-md border-2 border-[#7e63bf] bg-[#efe9ff]" />
                <div className="absolute inset-x-10 bottom-8 h-2 rounded bg-[#7e63bf] opacity-60" />
            </div>
        );
    }

    if (type === "Plot") {
        return (
            <div className={base}>
                <div className="absolute inset-6 rounded-md border-2 border-dashed border-[#7e63bf] bg-[#f5f1ff]" />
                <div className="absolute inset-x-8 bottom-7 h-8 border border-[#7e63bf] bg-[#ece5ff]" />
                <div className="absolute left-10 top-8 h-5 w-5 rounded-full border-2 border-[#7e63bf] bg-white" />
                <div className="absolute right-10 top-8 h-5 w-5 rounded-full border-2 border-[#7e63bf] bg-white" />
            </div>
        );
    }

    return (
        <div className={base}>
            <div className="absolute inset-x-6 bottom-6 h-14 rounded-t-[18px] border-2 border-[#7e63bf] bg-[#efe9ff]" />
            <div className="absolute left-10 top-7 h-6 w-6 border-2 border-[#7e63bf] bg-white" />
            <div className="absolute right-10 top-7 h-6 w-6 border-2 border-[#7e63bf] bg-white" />
            <div className="absolute inset-x-9 bottom-10 h-8 border-2 border-[#7e63bf] bg-[#f5f0ff]" />
            <div className="absolute left-12 top-4 h-3 w-3 rounded-full bg-[#7e63bf] opacity-60" />
            <div className="absolute right-12 top-4 h-3 w-3 rounded-full bg-[#7e63bf] opacity-60" />
        </div>
    );
};

export default function QuickAddWizard() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [projects, setProjects] = useState([]);
    const [projectConfigs, setProjectConfigs] = useState([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState({
        purpose: "Sale",
        category: "Residential",
        type: "Residential",
        projectId: "",
        tower: "",
        floor: "",
        unitName: "",
        configuration: "2 BHK",
        configurationId: "",
        totalFloors: "",
        amenities: [],
        images: [],
        areaCarpet: "",
        areaSaleable: "",
        basePrice: "",
        allInclusivePrice: "",
    });

    useEffect(() => {
        const loadProjects = async () => {
            try {
                const preselected = new URLSearchParams(window.location.search).get("projectId") || "";
                const data = await fetchProjects({ limit: 200 });
                const projectList = Array.isArray(data) ? data : data?.projects || [];
                setProjects(projectList);

                const valid = projectList.some((p) => p.id === preselected) ? preselected : "";
                setFormData((prev) => ({ ...prev, projectId: prev.projectId || valid || projectList[0]?.id || "" }));
            } catch (err) {
                console.error("Failed to load projects", err);
            }
        };

        loadProjects();
    }, []);

    useEffect(() => {
        const loadConfigs = async () => {
            setProjectConfigs([]);
            setFormData((prev) => ({ ...prev, configurationId: "" }));
            if (!formData.projectId) return;
            try {
                const list = await fetchConfigurations(formData.projectId);
                setProjectConfigs(Array.isArray(list) ? list : []);
            } catch {
                setProjectConfigs([]);
            }
        };
        loadConfigs();
    }, [formData.projectId]);

    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        
        // For demonstration, create object URLs. In a real app, you'd upload to a server.
        const newImages = files.map(file => URL.createObjectURL(file));
        
        setFormData(prev => ({
            ...prev,
            images: [...(prev.images || []), ...newImages]
        }));
    };

    const removeImage = (index) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, i) => i !== index)
        }));
    };

    const updateField = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep((step) => step - 1);
            return;
        }
        router.back();
    };

    const saveUnit = async () => {
        try {
            const selectedProject = projects.find((p) => p.id === formData.projectId);
            if (!selectedProject) {
                showToast("Select a project before saving the unit.", "error");
                return;
            }

            const unitName = formData.unitName?.trim();
            if (!unitName) {
                showToast("Unit name is required.", "error");
                return;
            }

            const bhkMatch = String(formData.configuration || "").match(/\d+/);
            const bhk = bhkMatch ? Number(bhkMatch[0]) : null;
            const saleableArea = Number(formData.areaSaleable) || Number(formData.areaCarpet) || null;
            const price = parseCurrencyValue(formData.allInclusivePrice || formData.basePrice || "");
            if (!price || price <= 0) {
                showToast("Enter a valid base price or all-inclusive price.", "error");
                return;
            }

            const selectedConfig = projectConfigs.find((c) => c.id === formData.configurationId);

            const payload = {
                projectId: selectedProject.id,
                title: `${selectedProject.name} ${formData.tower ? `${formData.tower} ` : ""}${unitName}`.trim(),
                purpose: formData.purpose === "Rental" ? "Rent" : formData.purpose || "Sale",
                unitNumber: unitName,
                tower: formData.tower?.trim() || null,
                configuration: selectedConfig ? selectedConfig.name : (formData.configuration || null),
                bhk,
                area: saleableArea,
                areaCarpet: Number(formData.areaCarpet) || null,
                areaSaleable: Number(formData.areaSaleable) || null,
                areaBuiltUp: Number(formData.builtUpArea) || null,
                areaProject: Number(formData.projectArea) || null,
                areaCovered: Number(formData.coveredArea) || null,
                areaTerrace: Number(formData.terraceArea) || null,
                floor: formData.floor !== "" && formData.floor !== null ? Number(formData.floor) : null,
                price,
                status: "AVAILABLE",
                featured: false,
                images: formData.images || [],
                amenities: formData.amenities || [],
            };
            if (selectedConfig) payload.configurationId = selectedConfig.id;

            await createProperty(payload);
            queryClient.invalidateQueries({ queryKey: ["projects"] });
            queryClient.invalidateQueries({ queryKey: ["properties"] });
            if (selectedProject.id) queryClient.invalidateQueries({ queryKey: ["project", selectedProject.id] });
            showToast("Unit created successfully", "success");
            router.push(`/dashboard/inventory/projects/${selectedProject.id}`);
        } catch (err) {
            showToast(`Failed to create unit: ${err?.message || err}`, "error");
        }
    };

    const handleNext = async () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep((step) => step + 1);
            return;
        }
        await saveUnit();
    };

    const renderStepContent = () => {
        if (currentStep === 0) {
            return (
                <div className="space-y-10">
                    <div>
                        <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Property purpose <span className="text-violet-600">*</span></h3>
                        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {PURPOSES.map((purpose) => {
                                const selected = formData.purpose === purpose.name;
                                return (
                                    <button
                                        type="button"
                                        key={purpose.name}
                                        onClick={() => updateField("purpose", purpose.name)}
                                        className={`rounded-[22px] border p-4 text-left transition-all ${selected ? "border-violet-400 bg-violet-50 shadow-[0_0_0_1px_rgba(124,58,237,0.15)]" : "border-[#d9d2e3] bg-white hover:border-violet-200"}`}
                                    >
                                        <div className="flex items-center justify-center rounded-[18px] border border-[#e8e1f0] bg-[#f4f1f9] p-4">
                                            <HouseIcon active={selected} />
                                        </div>
                                        <div className="mt-4 text-center text-xl font-medium text-gray-700">{purpose.name}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Project <span className="text-violet-600">*</span></h3>
                            <div className="mt-4 flex gap-3">
                                <div className="relative flex-1">
                                    <select
                                        value={formData.projectId || ""}
                                        onChange={(e) => updateField("projectId", e.target.value)}
                                        className="w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    >
                                        <option value="">Select existing project</option>
                                        {projects.map((project) => (
                                            <option key={project.id} value={project.id}>
                                                {project.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                                    <Eye size={16} /> Preview
                                </button>
                            </div>
                            <button type="button" onClick={() => router.push("/dashboard/inventory/projects/new")} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-700">
                                <Plus size={16} /> Add project
                            </button>
                        </div>

                        <div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Project tower name</label>
                                    <input
                                        value={formData.tower}
                                        onChange={(e) => updateField("tower", e.target.value)}
                                        placeholder="Enter tower name"
                                        className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Total floors</label>
                                    <input
                                        value={formData.totalFloors}
                                        onChange={(e) => updateField("totalFloors", e.target.value)}
                                        placeholder="Enter total floors"
                                        className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Unit type <span className="text-violet-600">*</span></h3>
                            <div className="mt-5 grid grid-cols-3 gap-4">
                                {UNIT_TYPES.map((unit) => {
                                    const selected = formData.type === unit.name;
                                    return (
                                        <button
                                            type="button"
                                            key={unit.name}
                                            onClick={() => updateField("type", unit.name)}
                                            className={`rounded-[22px] border p-3 text-center transition-all ${selected ? "border-violet-400 bg-violet-50 shadow-[0_0_0_1px_rgba(124,58,237,0.15)]" : "border-[#d9d2e3] bg-white hover:border-violet-200"}`}
                                        >
                                            <div className="flex justify-center"> <UnitIllustration type={unit.name} active={selected} /> </div>
                                            <div className="mt-4 text-lg font-medium text-gray-700">{unit.name}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-4 pt-8">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Unit name <span className="text-violet-600">*</span></label>
                                    <input
                                        value={formData.unitName}
                                        onChange={(e) => updateField("unitName", e.target.value)}
                                        placeholder="Enter unit name"
                                        className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    />
                                </div>
                                <div>
                                    <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Floor</label>
                                    <input
                                        value={formData.floor}
                                        onChange={(e) => updateField("floor", e.target.value)}
                                        placeholder="Enter floor"
                                        className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                    />
                                </div>
                            </div>

                            <div className="rounded-[18px] border border-[#e7e0ee] bg-[#f7f5f9] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">Measure</div>
                                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-600">Sq. Ft.</div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {[
                                        { label: "Carpet area", field: "areaCarpet" },
                                        { label: "Saleable area", field: "areaSaleable" },
                                        { label: "Built-up area", field: "builtUpArea" },
                                        { label: "Project area", field: "projectArea" },
                                        { label: "Covered area", field: "coveredArea" },
                                        { label: "Terrace area", field: "terraceArea" },
                                    ].map((item) => (
                                        <div key={item.field} className="grid grid-cols-[1fr_120px] items-center gap-3">
                                            <div className="text-sm font-medium text-gray-700">{item.label}</div>
                                            <input
                                                value={formData[item.field] ?? ""}
                                                onChange={(e) => updateField(item.field, e.target.value)}
                                                placeholder="Enter"
                                                className="w-full rounded-lg border border-[#d9d2e3] bg-white px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-violet-400"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Configuration</label>
                                {projectConfigs.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {projectConfigs.map((c) => {
                                            const selected = formData.configurationId === c.id;
                                            return (
                                                <button
                                                    type="button"
                                                    key={c.id}
                                                    onClick={() => setFormData((prev) => ({ ...prev, configurationId: selected ? "" : c.id, configuration: c.name }))}
                                                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${selected ? "border-violet-500 bg-violet-600 text-white" : "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400"}`}
                                                    title={c.basePrice ? `Base price: ${c.basePrice}` : ""}
                                                >
                                                    {c.name}{c.bhk ? ` · ${c.bhk} BHK` : ""}{c.basePrice ? ` · ₹${Number(c.basePrice).toLocaleString("en-IN")}` : ""}
                                                </button>
                                            );
                                        })}
                                        <span className="text-[11px] text-gray-400 self-center">
                                            {formData.configurationId ? "Linked to project configuration" : "or pick a free-text type below"}
                                        </span>
                                    </div>
                                )}
                                <div className="mt-3 grid grid-cols-4 gap-3">
                                    {(formData.type === "Commercial" ? COMMERCIAL_CONFIGURATIONS : RESIDENTIAL_CONFIGURATIONS).map((config) => {
                                        const selected = formData.configuration === config && !formData.configurationId;
                                        return (
                                            <button
                                                type="button"
                                                key={config}
                                                onClick={() => setFormData((prev) => ({ ...prev, configuration: config, configurationId: "" }))}
                                                className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${selected ? "border-violet-400 bg-violet-50 text-violet-700" : "border-[#d9d2e3] bg-[#f7f5f9] text-gray-700 hover:border-violet-200"}`}
                                            >
                                                {config}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (currentStep === 1) {
            return (
                <div className="space-y-6">
                    <AmenitiesSelector
                        selectedAmenities={formData.amenities}
                        onChange={(amenities) => updateField("amenities", amenities)}
                        propertyType={formData.type}
                    />
                </div>
            );
        }

        if (currentStep === 2) {
            return (
                <div className="space-y-6">
                    <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Gallery</h3>
                    
                    <label className="flex min-h-[220px] cursor-pointer items-center justify-center rounded-[22px] border-2 border-dashed border-[#d9d2e3] bg-[#faf7ff] p-10 text-center transition hover:bg-[#f3edff]">
                        <input type="file" multiple accept="image/png, image/jpeg, image/svg+xml" className="hidden" onChange={handleImageUpload} />
                        <div>
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                                <UploadCloud size={26} />
                            </div>
                            <div className="mt-4 text-lg font-semibold text-gray-800">Click to upload images</div>
                            <div className="mt-1 text-sm text-gray-500">PNG, JPG, or SVG up to 5MB</div>
                        </div>
                    </label>

                    {formData.images?.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                            {formData.images.map((img, idx) => (
                                <div key={idx} className="relative group rounded-xl overflow-hidden border border-gray-200 aspect-video">
                                    <img src={img} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                                    <button 
                                        type="button" 
                                        onClick={() => removeImage(idx)}
                                        className="absolute top-2 right-2 p-1 bg-white/90 rounded-md text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-6">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Other details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Carpet area</label>
                        <input value={formData.areaCarpet} onChange={(e) => updateField("areaCarpet", e.target.value)} placeholder="Enter carpet area" className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400" />
                    </div>
                    <div>
                        <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Saleable area</label>
                        <input value={formData.areaSaleable} onChange={(e) => updateField("areaSaleable", e.target.value)} placeholder="Enter saleable area" className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400" />
                    </div>
                    <div>
                        <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">Base price *</label>
                        <input value={formData.basePrice} onChange={(e) => updateField("basePrice", e.target.value)} placeholder="Enter base price" className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400" />
                    </div>
                    <div>
                        <label className="text-[13px] font-bold uppercase tracking-[0.18em] text-gray-700">All-inclusive price</label>
                        <input value={formData.allInclusivePrice} onChange={(e) => updateField("allInclusivePrice", e.target.value)} placeholder="Enter all-inclusive price" className="mt-3 w-full rounded-xl border border-[#d9d2e3] bg-[#f7f5f9] px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-violet-400" />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#f5f3f6]">
            <div className="px-4 pb-4 pt-6 sm:px-8">
                <div className="mx-auto max-w-6xl text-sm text-gray-500">
                    Home <span className="px-2">›</span> Project &amp; Inventory Management <span className="px-2">›</span> <span className="font-medium text-gray-700">Quick Unit Add</span>
                </div>
            </div>

            <div className="px-4 pb-4 sm:px-8">
                <div className="mx-auto max-w-6xl rounded-[28px] border border-[#ebe2f5] bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                        {STEPS.map((step, index) => {
                            const isActive = currentStep === index;
                            const isComplete = currentStep > index;

                            return (
                                <div key={step} className="relative flex flex-1 items-center justify-center">
                                    <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#e7e2ee]" />
                                    <div className="relative z-10 flex flex-col items-center gap-2">
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold ${isActive ? "border-violet-500 bg-violet-600 text-white" : isComplete ? "border-violet-400 bg-violet-100 text-violet-700" : "border-[#d9d2e3] bg-white text-gray-400"}`}>
                                            {isComplete ? <Check size={16} /> : index + 1}
                                        </div>
                                        <div className={`text-xs font-medium ${isActive ? "text-violet-700" : "text-gray-500"}`}>{step}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-8">
                <div className="mx-auto max-w-6xl rounded-[28px] border border-[#ebe2f5] bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-8">
                    {renderStepContent()}
                </div>

                <div className="mx-auto mt-5 flex max-w-6xl justify-end gap-3 pb-4">
                    <button type="button" onClick={handleBack} className="rounded-xl border border-[#d9d2e3] bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                        {currentStep === 0 ? "Cancel" : "Back"}
                    </button>
                    <button type="button" onClick={handleNext} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(124,58,237,0.28)] transition hover:opacity-95">
                        {currentStep === STEPS.length - 1 ? "Save" : "Next"}
                        {currentStep < STEPS.length - 1 && <ChevronRight size={16} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
