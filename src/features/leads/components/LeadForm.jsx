"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { leadSchema } from "../schemas/leadSchema";
import { useCreateLead } from "../hooks/useCreateLead";
import { useEditLead } from "../hooks/useEditLead";
import { showToast } from "../../../lib/toast";
import { fetchProjects } from "../../../lib/api/projects";
import { fetchProperties } from "../../../lib/api/properties";
import { PROPERTY_TYPES, configurationsFor } from "../../../lib/propertyRequirement";
import LocationSelector from "../../../components/shared/LocationSelector";

const inputClass =
    "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition-all";
const labelClass = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block";
const sectionTitleClass = "text-xs font-black text-purple-700 uppercase tracking-widest border-b border-gray-100 pb-2";

const toBudgetString = (value) => {
    if (value === null || value === undefined || value === "") return "";
    return String(Number(value));
};

const buildDefaults = (lead, employees) => ({
    name: lead?.name || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    projectId: lead?.projectId || "",
    propertyId: lead?.propertyId || "",
    source: lead?.source || "Website",
    assignedTo: lead?.assignedToId || employees?.[0]?.id || "",
    propertyType: lead?.propertyType || "",
    configurations: Array.isArray(lead?.configurations) ? lead.configurations : [],
    budgetMin: toBudgetString(lead?.budgetMin),
    budgetMax:
        lead?.budgetMax !== null && lead?.budgetMax !== undefined
            ? toBudgetString(lead.budgetMax)
            : (lead?.budget !== null && lead?.budget !== undefined ? toBudgetString(lead.budget) : ""),
    preferredLocations: Array.isArray(lead?.preferredLocations)
        ? lead.preferredLocations.map((row) => ({
            stateId: row.stateId || "",
            districtId: row.districtId || "",
            regionId: row.regionId || "",
        }))
        : [],
});

const buildPayload = (data) => ({
    name: String(data.name).trim(),
    phone: String(data.phone).trim(),
    email: data.email?.trim() || null,
    projectId: data.projectId || null,
    propertyId: data.propertyId || null,
    source: data.source,
    assignedToId: data.assignedTo,
    propertyType: data.propertyType || null,
    configurations: data.configurations || [],
    budgetMin:
        data.budgetMin !== undefined && String(data.budgetMin).trim() !== ""
            ? Number(data.budgetMin)
            : null,
    budgetMax:
        data.budgetMax !== undefined && String(data.budgetMax).trim() !== ""
            ? Number(data.budgetMax)
            : null,
    preferredLocations: (data.preferredLocations || [])
        .filter((row) => row && row.stateId)
        .map((row) => ({
            stateId: row.stateId,
            districtId: row.districtId || null,
            regionId: row.regionId || null,
        })),
});

// Shared Create/Edit lead form: contact details, project interest, the
// structured property requirement (type, configurations, budget range,
// hierarchical preferred locations) and assignment.
export default function LeadForm({ lead, employees = [], onSuccess, onCancel }) {
    const isEdit = Boolean(lead?.id);
    const { mutate: createLead, isPending: creating, error: createError } = useCreateLead();
    const { mutate: editLead, isPending: editing, error: editError } = useEditLead();
    const isPending = creating || editing;
    const error = createError || editError;

    const { data: projects, isLoading: projectsLoading } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
    });

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(leadSchema),
        defaultValues: buildDefaults(lead, employees),
    });

    const selectedProjectId = watch("projectId");
    const propertyType = watch("propertyType");
    const selectedConfigurations = watch("configurations") || [];
    const locationRows = watch("preferredLocations") || [];

    const { data: units, isLoading: unitsLoading } = useQuery({
        queryKey: ["properties", "for-project", selectedProjectId],
        queryFn: () => fetchProperties(selectedProjectId, { limit: 200 }),
        enabled: Boolean(selectedProjectId),
        staleTime: 60 * 1000,
        retry: 1,
    });

    const projectList = Array.isArray(projects) ? projects : [];
    const unitList = Array.isArray(units) ? units : [];

    const toggleConfiguration = (configuration) => {
        const next = selectedConfigurations.includes(configuration)
            ? selectedConfigurations.filter((item) => item !== configuration)
            : [...selectedConfigurations, configuration];
        setValue("configurations", next, { shouldValidate: true });
    };

    const setPreferredLocation = (index, next) => {
        setValue(`preferredLocations.${index}`, next, { shouldValidate: true });
    };

    const addPreferredLocation = () => {
        if (locationRows.length >= 10) return;
        setValue("preferredLocations", [...locationRows, { stateId: "", districtId: "", regionId: "" }], {
            shouldValidate: true,
        });
    };

    const removePreferredLocation = (index) => {
        setValue(
            "preferredLocations",
            locationRows.filter((_, rowIndex) => rowIndex !== index),
            { shouldValidate: true }
        );
    };

    const onSubmit = (data) => {
        const payload = buildPayload(data);
        const handleSuccess = () => {
            showToast(isEdit ? "Lead updated successfully" : `${data.name} added to the pipeline`, "success");
            onSuccess?.();
        };
        const handleError = () => {
            showToast(isEdit ? "Failed to update lead" : "Failed to create lead", "error");
        };

        if (isEdit) {
            editLead({ id: lead.id, ...payload }, { onSuccess: handleSuccess, onError: handleError });
        } else {
            createLead({ ...payload, status: "NEW" }, { onSuccess: handleSuccess, onError: handleError });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium">
                    {error.message || "An unexpected error occurred."}
                </div>
            )}

            {/* Contact details */}
            <section className="flex flex-col gap-4">
                <h2 className={sectionTitleClass}>Contact Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Full Name</label>
                        <input
                            {...register("name")}
                            type="text"
                            placeholder="e.g., John Doe"
                            className={inputClass}
                        />
                        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Phone Number</label>
                        <input
                            {...register("phone")}
                            type="text"
                            placeholder="+91 9876543210"
                            className={inputClass}
                        />
                        {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
                    </div>
                </div>
                <div>
                    <label className={labelClass}>Email Address (optional)</label>
                    <input
                        {...register("email")}
                        type="email"
                        placeholder="lead@example.com"
                        className={inputClass}
                    />
                    {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
            </section>

            {/* Project interest */}
            <section className="flex flex-col gap-4">
                <h2 className={sectionTitleClass}>Project Interest</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Interested Project (optional)</label>
                        <select
                            {...register("projectId")}
                            onChange={(event) => {
                                setValue("projectId", event.target.value, { shouldValidate: true });
                                setValue("propertyId", "");
                            }}
                            disabled={projectsLoading}
                            className={`${inputClass} cursor-pointer`}
                        >
                            <option value="">
                                {projectsLoading ? "Loading projects..." : "Not tied to a project"}
                            </option>
                            {projectList.map((project) => (
                                <option key={project.id} value={project.id}>{project.name}</option>
                            ))}
                        </select>
                        {errors.projectId && <p className="text-red-500 text-xs mt-1">{errors.projectId.message}</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Interested Unit (optional)</label>
                        <select
                            {...register("propertyId")}
                            disabled={!selectedProjectId || unitsLoading}
                            className={`${inputClass} cursor-pointer disabled:opacity-60`}
                        >
                            <option value="">
                                {!selectedProjectId
                                    ? "Select a project first"
                                    : unitsLoading
                                        ? "Loading units..."
                                        : "Not decided yet"}
                            </option>
                            {unitList.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                    {unit.unitNumber ? `Unit ${unit.unitNumber}` : unit.title}
                                    {unit.price ? ` — ₹${Number(unit.price).toLocaleString("en-IN")}` : ""}
                                </option>
                            ))}
                        </select>
                        {errors.propertyId && <p className="text-red-500 text-xs mt-1">{errors.propertyId.message}</p>}
                    </div>
                </div>
            </section>

            {/* Property requirement */}
            <section className="flex flex-col gap-4">
                <h2 className={sectionTitleClass}>Property Requirement</h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass}>Property Type</label>
                        <select
                            {...register("propertyType")}
                            onChange={(event) => {
                                setValue("propertyType", event.target.value, { shouldValidate: true });
                                setValue("configurations", [], { shouldValidate: true });
                            }}
                            className={`${inputClass} cursor-pointer`}
                        >
                            <option value="">Select type</option>
                            {PROPERTY_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        {errors.propertyType && <p className="text-red-500 text-xs mt-1">{errors.propertyType.message}</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Minimum Budget (₹)</label>
                        <input
                            {...register("budgetMin")}
                            type="number"
                            min="0"
                            placeholder="e.g. 5000000"
                            className={inputClass}
                        />
                        {errors.budgetMin && <p className="text-red-500 text-xs mt-1">{errors.budgetMin.message}</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Maximum Budget (₹)</label>
                        <input
                            {...register("budgetMax")}
                            type="number"
                            min="0"
                            placeholder="e.g. 15000000"
                            className={inputClass}
                        />
                        {errors.budgetMax && <p className="text-red-500 text-xs mt-1">{errors.budgetMax.message}</p>}
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Configurations</label>
                    {propertyType ? (
                        <div className="flex flex-wrap gap-2">
                            {configurationsFor(propertyType).map((configuration) => {
                                const active = selectedConfigurations.includes(configuration);
                                return (
                                    <button
                                        key={configuration}
                                        type="button"
                                        onClick={() => toggleConfiguration(configuration)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                            active
                                                ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200"
                                                : "bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-700"
                                        }`}
                                    >
                                        {configuration}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400">Select a property type to choose configurations.</p>
                    )}
                    {errors.configurations && (
                        <p className="text-red-500 text-xs mt-1">{errors.configurations.message}</p>
                    )}
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className={`${labelClass} mb-0`}>Preferred Locations</label>
                        <span className="text-xs text-gray-400">
                            Matching includes every level you select (state, district or area)
                        </span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {locationRows.map((row, index) => (
                            <div key={index} className="relative border border-gray-100 bg-gray-50/40 rounded-xl p-3 pt-4">
                                {locationRows.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removePreferredLocation(index)}
                                        aria-label="Remove preferred location"
                                        className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                                <LocationSelector
                                    value={row}
                                    onChange={(next) => setPreferredLocation(index, next)}
                                    disabled={isPending}
                                />
                                {errors.preferredLocations?.[index]?.stateId && (
                                    <p className="text-red-500 text-xs mt-1">
                                        {errors.preferredLocations[index].stateId.message}
                                    </p>
                                )}
                            </div>
                        ))}
                        {locationRows.length < 10 && (
                            <button
                                type="button"
                                onClick={addPreferredLocation}
                                className="self-start flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors"
                            >
                                <Plus size={14} /> Add preferred location
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Assignment */}
            <section className="flex flex-col gap-4">
                <h2 className={sectionTitleClass}>Assignment</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Lead Source</label>
                        <select {...register("source")} className={`${inputClass} cursor-pointer`}>
                            <option>Website</option>
                            <option>Google Ads</option>
                            <option>Meta / Instagram</option>
                            <option>Referral</option>
                            <option>Walk-in</option>
                            <option>Direct Call</option>
                        </select>
                        {errors.source && <p className="text-red-500 text-xs mt-1">{errors.source.message}</p>}
                    </div>
                    <div>
                        <label className={labelClass}>Assign To</label>
                        <select {...register("assignedTo")} className={`${inputClass} cursor-pointer`}>
                            {(employees || []).map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                    {employee.name}
                                    {employee.role ? ` (${employee.role})` : ""}
                                </option>
                            ))}
                        </select>
                        {errors.assignedTo && <p className="text-red-500 text-xs mt-1">{errors.assignedTo.message}</p>}
                    </div>
                </div>
            </section>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isPending}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isPending}
                    className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-200 disabled:opacity-50"
                >
                    {isPending ? "Saving..." : isEdit ? "Save Changes" : "Save Lead"}
                </button>
            </div>
        </form>
    );
}
