"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { fetchOverdueTasks } from "../../../../lib/api/tasks";
import { useUpdateTaskStatus, useRescheduleTask } from "../../../../features/communication/hooks/useTaskActions";
import { showToast } from "../../../../lib/toast";

const formatOverdue = (dueDate) => {
    const diffMs = Date.now() - new Date(dueDate).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}m overdue`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h overdue`;
    const days = Math.floor(hours / 24);
    return `${days}d overdue`;
};

export default function OverdueActivitiesPage() {
    const [rescheduleId, setRescheduleId] = useState(null);
    const [rescheduleValue, setRescheduleValue] = useState("");

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["tasks", "overdue"],
        queryFn: fetchOverdueTasks,
        retry: 1
    });

    const updateStatus = useUpdateTaskStatus();
    const reschedule = useRescheduleTask();

    const overdue = Array.isArray(data) ? data : data?.tasks || [];

    const handleComplete = async (task) => {
        try {
            await updateStatus.mutateAsync({ id: task.id, status: "COMPLETED" });
            showToast("Overdue task completed", "success");
        } catch (err) {
            showToast(err?.message || "Failed to complete the task", "error");
        }
    };

    const handleReschedule = async (task) => {
        if (!rescheduleValue) return;
        try {
            await reschedule.mutateAsync({
                id: task.id,
                dueDate: new Date(rescheduleValue).toISOString(),
                reason: "Rescheduled from overdue queue"
            });
            showToast("Task rescheduled out of the overdue queue", "success");
            setRescheduleId(null);
            setRescheduleValue("");
        } catch (err) {
            showToast(err?.message || "Failed to reschedule", "error");
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading overdue activities...</div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 403
                        ? "You do not have permission to view overdue activities"
                        : error?.status === 401
                            ? "Session expired. Please sign in again."
                            : "Failed to load overdue activities"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
                <button onClick={() => refetch()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Overdue Activities Queue</h1>
                <p className="text-sm text-gray-500">
                    Tasks and follow-ups past their scheduled due time. Overdue items are never silently completed.
                </p>
            </div>

            {overdue.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
                    Nothing is overdue. Great work.
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Activity</th>
                                <th className="p-4">Lead Reference</th>
                                <th className="p-4">Scheduled Due</th>
                                <th className="p-4">Escalation Delay</th>
                                <th className="p-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {overdue.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-50 align-top">
                                    <td className="p-4 font-bold text-red-600 flex items-center gap-2">
                                        <AlertCircle size={14} className="shrink-0" />
                                        <span>
                                            {String(task.type || "TASK").replace(/_/g, " ")}
                                            <span className="block text-xs font-medium text-gray-700">{task.title}</span>
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-gray-900">
                                        {task.lead ? (
                                            <Link href={`/dashboard/leads/${task.leadId}`} className="text-purple-700 hover:underline">
                                                {task.lead.name}
                                            </Link>
                                        ) : (
                                            <span className="text-gray-400 font-medium">No linked lead</span>
                                        )}
                                        {task.assignedTo?.name && (
                                            <span className="block text-[11px] font-medium text-gray-500">
                                                {task.assignedTo.name}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-gray-600">
                                        {new Date(task.dueDate).toLocaleString([], {
                                            day: "numeric", month: "short", year: "numeric",
                                            hour: "2-digit", minute: "2-digit"
                                        })}
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-red-50 text-red-700 font-bold px-2 py-0.5 rounded whitespace-nowrap">
                                            {formatOverdue(task.dueDate)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() => handleComplete(task)}
                                                disabled={updateStatus.isPending}
                                                className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                                            >
                                                <CheckCircle2 size={12} /> Complete
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setRescheduleId(rescheduleId === task.id ? null : task.id);
                                                    setRescheduleValue("");
                                                }}
                                                className="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 inline-flex items-center gap-1"
                                            >
                                                <CalendarClock size={12} /> Reschedule
                                            </button>
                                        </div>
                                        {rescheduleId === task.id && (
                                            <div className="mt-2 flex justify-end items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                                <input
                                                    type="datetime-local"
                                                    value={rescheduleValue}
                                                    onChange={(e) => setRescheduleValue(e.target.value)}
                                                    className="bg-white border border-indigo-200 rounded px-2 py-1 text-xs"
                                                />
                                                <button
                                                    onClick={() => handleReschedule(task)}
                                                    disabled={!rescheduleValue || reschedule.isPending}
                                                    className="rounded bg-indigo-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                                                >
                                                    {reschedule.isPending ? "Saving..." : "Save"}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
