"use client";
import Link from "next/link";
import { ListOrdered, PhoneCall, AlertCircle, Clock } from "lucide-react";
import { useAgenda } from "../../../../features/communication/hooks/useCommunication";

const priorityOf = (task) => {
    if (task.bucket === "OVERDUE") return { label: "P1 · Overdue", tone: "text-red-600 bg-red-50 border-red-100" };
    if (task.isDueNow) return { label: "P1 · Due now", tone: "text-red-600 bg-red-50 border-red-100" };
    if (task.bucket === "TODAY") return { label: "P2 · Today", tone: "text-purple-600 bg-purple-50 border-purple-100" };
    return { label: "P3 · Upcoming", tone: "text-gray-600 bg-gray-50 border-gray-100" };
};

export default function CallbackQueuePage() {
    const { data, isLoading, error, refetch } = useAgenda({ status: "PENDING", limit: 50 });
    const items = (data?.items || []).filter((t) => ["FOLLOW_UP", "CALL", "MEETING"].includes(t.type));

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Priority Callback Queue</h1>
                <p className="text-sm text-gray-500">
                    Open follow-ups and callbacks ordered by due time — {items.length} in queue.
                </p>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center justify-between gap-3">
                    <span>
                        {error?.status === 403
                            ? "You do not have permission to view the queue"
                            : error?.status === 401
                                ? "Session expired. Please sign in again."
                                : `Failed to load the callback queue: ${error?.message}`}
                    </span>
                    <button onClick={() => refetch()} className="font-bold underline shrink-0">Retry</button>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {isLoading ? (
                    <p className="p-8 text-center text-sm text-gray-400">Loading callback queue...</p>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center">
                        <ListOrdered size={24} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400">Queue is empty — no pending callbacks or follow-ups.</p>
                    </div>
                ) : (
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                                <th className="p-4">Priority</th>
                                <th className="p-4">Lead</th>
                                <th className="p-4">Task</th>
                                <th className="p-4">Due Time</th>
                                <th className="p-4">Assigned Agent</th>
                                <th className="p-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map((task) => {
                                const priority = priorityOf(task);
                                return (
                                    <tr key={task.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-black whitespace-nowrap">
                                            <span className={`px-2 py-0.5 rounded-lg border font-bold whitespace-nowrap ${priority.tone}`}>
                                                {priority.label}
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
                                        </td>
                                        <td className="p-4 text-gray-700">
                                            <span className="font-semibold">{task.title}</span>
                                            <span className="block text-[11px] text-gray-400 uppercase">{task.type}</span>
                                        </td>
                                        <td className="p-4 text-gray-500 whitespace-nowrap flex items-center gap-1.5">
                                            <Clock size={12} className="shrink-0" />
                                            {new Date(task.dueDate).toLocaleString([], {
                                                day: "numeric", month: "short",
                                                hour: "2-digit", minute: "2-digit"
                                            })}
                                            {task.bucket === "OVERDUE" && (
                                                <AlertCircle size={12} className="text-red-500 shrink-0" />
                                            )}
                                        </td>
                                        <td className="p-4 font-semibold text-gray-800">
                                            {task.assignedTo?.name || "—"}
                                        </td>
                                        <td className="p-4 text-right">
                                            {task.leadId ? (
                                                <Link
                                                    href={`/dashboard/leads/${task.leadId}`}
                                                    className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-700 inline-flex items-center gap-1"
                                                >
                                                    <PhoneCall size={12} /> Open &amp; Call
                                                </Link>
                                            ) : (
                                                <Link
                                                    href="/dashboard/activities/tasks"
                                                    className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 font-bold rounded-lg text-xs hover:bg-gray-50 inline-block"
                                                >
                                                    Manage
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
