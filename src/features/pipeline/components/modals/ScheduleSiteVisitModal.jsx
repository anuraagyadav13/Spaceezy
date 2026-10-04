"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "../../../../components/shared/Modal";
import { useTransitionLeadStage } from "../../hooks/useLeadMutations";
import { fetchProjects } from "../../../../lib/api/projects";

const inputClass =
    "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all";

const defaultDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export default function ScheduleSiteVisitModal({ lead, isOpen, onClose }) {
    const [date, setDate] = useState(defaultDate());
    const [time, setTime] = useState("11:00");
    const [propertyName, setPropertyName] = useState("");
    const transitionStage = useTransitionLeadStage();

    const { data: projects } = useQuery({
        queryKey: ["projects", "filter-options"],
        queryFn: () => fetchProjects({ limit: 200 }),
        staleTime: 5 * 60 * 1000,
        retry: 1,
        enabled: isOpen
    });

    if (!lead) return null;

    const projectList = Array.isArray(projects) ? projects : [];

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!date || !time) return;
        transitionStage.mutate(
            {
                id: lead.id,
                target: "SITE_VISIT",
                siteVisit: {
                    date,
                    time,
                    propertyName: propertyName || undefined
                },
                successMessage: "Site visit scheduled"
            },
            {
                onSuccess: () => onClose()
            }
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Schedule Site Visit">
            <p className="text-sm text-gray-500 mb-5">
                Pick a slot for <span className="font-bold text-gray-900">{lead.name}</span> to move the lead into the Site
                Visit stage.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Date *</label>
                        <input
                            type="date"
                            required
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Time *</label>
                        <input
                            type="time"
                            required
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">Project / Property</label>
                    <select value={propertyName} onChange={(e) => setPropertyName(e.target.value)} className={inputClass}>
                        <option value="">Not specified yet</option>
                        {projectList.map((project) => (
                            <option key={project.id} value={project.name}>{project.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={transitionStage.isPending}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {transitionStage.isPending ? "Scheduling..." : "Schedule Visit"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
