"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createSiteVisit } from "../../../../lib/api/siteVisits";
import { fetchLeads } from "../../../../lib/api/leads";
import { fetchUsers } from "../../../../lib/api/users";
import { fetchProjects } from "../../../../lib/api/projects";
import { fetchProperties } from "../../../../lib/api/properties";
import { showToast } from "../../../../lib/toast";
import { toErrorMessage } from "../../../../features/pipeline/hooks/useLeadMutations";

const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-500";

function ScheduleSiteVisitForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const preselectedLeadId = searchParams.get("leadId") || "";

    const [leadId, setLeadId] = useState(preselectedLeadId);
    const [projectId, setProjectId] = useState("");
    const [propertyId, setPropertyId] = useState("");
    const [date, setDate] = useState("");
    const [time, setTime] = useState("11:00");
    const [assignedTo, setAssignedTo] = useState("");

    const { data: leads, isLoading: leadsLoading } = useQuery({
        queryKey: ["leads", "filter-options"],
        queryFn: () => fetchLeads({ limit: 200 }),
        staleTime: 60 * 1000,
        retry: 1
    });

    const { data: employees, isLoading: employeesLoading } = useQuery({
        queryKey: ["users", "all"],
        queryFn: async () => {
            const data = await fetchUsers({ limit: 100 });
            const list = data?.users || data || [];
            return Array.isArray(list) ? list : [];
        },
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    const { data: projects, isLoading: projectsLoading } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    const leadList = Array.isArray(leads) ? leads : [];
    const projectList = Array.isArray(projects) ? projects : [];
    const employeeList = Array.isArray(employees) ? employees : [];

    const selectedLead = leadList.find((l) => l.id === leadId);
    const effectiveProjectId = projectId || selectedLead?.projectId || "";

    const { data: units, isLoading: unitsLoading } = useQuery({
        queryKey: ["properties", "for-project", effectiveProjectId, "schedule"],
        queryFn: () => fetchProperties(effectiveProjectId, { limit: 200 }),
        enabled: Boolean(effectiveProjectId),
        staleTime: 60 * 1000,
        retry: 1
    });

    const unitList = Array.isArray(units) ? units : [];

    const schedule = useMutation({
        mutationFn: () =>
            createSiteVisit({
                leadId,
                ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
                ...(propertyId ? { propertyId } : {}),
                date,
                time,
                ...(assignedTo ? { assignedToId: assignedTo } : {}),
                status: "SCHEDULED"
            }),
        onSuccess: () => {
            showToast("Site visit scheduled successfully", "success");
            ["siteVisits", "leads", "pipeline", "lead", "activities"].forEach((key) =>
                queryClient.invalidateQueries({ queryKey: [key] })
            );
            router.push("/dashboard/site-visits");
        },
        onError: (err) => showToast(toErrorMessage(err), "error")
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!leadId || !date || !time) return;
        schedule.mutate();
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Schedule Site Visit</h1>
                    <p className="text-sm text-gray-500">Book customer property visit appointment with sales executive assignment.</p>
                </div>
            </div>

            {leadsLoading ? (
                <p className="text-sm text-gray-400">Loading leads...</p>
            ) : leadList.length === 0 ? (
                <div className="max-w-xl bg-white p-8 rounded-3xl border border-dashed border-gray-300 text-center">
                    <p className="text-sm font-bold text-gray-700 mb-1">No leads yet</p>
                    <p className="text-xs text-gray-500 mb-4">Create a lead first — site visits are always linked to a real lead.</p>
                    <button onClick={() => router.push("/dashboard/leads/new")} className="text-xs font-bold text-purple-600 hover:underline">
                        + Add New Lead
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="max-w-xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Lead *</label>
                        <select
                            required
                            value={leadId}
                            onChange={(e) => { setLeadId(e.target.value); setProjectId(""); setPropertyId(""); }}
                            className={`${inputClass} cursor-pointer`}
                        >
                            <option value="">Select a lead</option>
                            {leadList.map((lead) => (
                                <option key={lead.id} value={lead.id}>
                                    {lead.name}{lead.phone ? ` — ${lead.phone}` : ""}{lead.status ? ` (${lead.status})` : ""}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Project</label>
                            <select
                                value={effectiveProjectId}
                                onChange={(e) => { setProjectId(e.target.value); setPropertyId(""); }}
                                disabled={projectsLoading}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="">Not specified yet</option>
                                {projectList.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Unit (optional)</label>
                            <select
                                value={propertyId}
                                onChange={(e) => setPropertyId(e.target.value)}
                                disabled={!effectiveProjectId || unitsLoading}
                                className={`${inputClass} cursor-pointer disabled:opacity-60`}
                            >
                                <option value="">{!effectiveProjectId ? "Select a project first" : unitsLoading ? "Loading units..." : "Whole project visit"}</option>
                                {unitList.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.unitNumber ? `Unit ${u.unitNumber}` : u.title}
                                        {u.price ? ` — ₹${Number(u.price).toLocaleString("en-IN")}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date *</label>
                            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Time *</label>
                            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Assign To</label>
                        <select
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            disabled={employeesLoading}
                            className={`${inputClass} cursor-pointer`}
                        >
                            <option value="">{employeesLoading ? "Loading team..." : "Leave unassigned"}</option>
                            {employeeList.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={() => router.back()} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Cancel</button>
                        <button
                            type="submit"
                            disabled={schedule.isPending}
                            className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-purple-700 disabled:opacity-60"
                        >
                            {schedule.isPending ? "Scheduling..." : "Confirm Site Visit"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

export default function ScheduleSiteVisitPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <ScheduleSiteVisitForm />
        </Suspense>
    );
}
