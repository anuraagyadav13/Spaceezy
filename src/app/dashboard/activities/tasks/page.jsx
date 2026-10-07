"use client";
import { useState } from "react";
import Link from "next/link";
import {
    CheckSquare, Plus, Calendar as CalendarIcon,
    Phone, User, CalendarClock, XCircle, AlertTriangle, Users, CalendarCheck
} from "lucide-react";
import { useAgenda } from "../../../../features/communication/hooks/useCommunication";
import { useUpdateTaskStatus, useRescheduleTask } from "../../../../features/communication/hooks/useTaskActions";
import CreateTaskModal from "../../../../features/communication/components/CreateTaskModal";
import { showToast } from "../../../../lib/toast";

const TYPE_ICONS = {
    CALL: Phone,
    SITE_VISIT: CalendarIcon,
    MEETING: Users,
    FOLLOW_UP: CalendarCheck,
    OTHER: CheckSquare
};

const VIEW_OPTIONS = [
    { value: "", label: "All open" },
    { value: "today", label: "Today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "overdue", label: "Overdue" },
    { value: "completed", label: "Completed" }
];

const TYPE_OPTIONS = ["FOLLOW_UP", "MEETING", "CALL", "SITE_VISIT", "OTHER"];

export default function TasksPage() {
    const [view, setView] = useState("");
    const [type, setType] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [rescheduleId, setRescheduleId] = useState(null);
    const [rescheduleValue, setRescheduleValue] = useState("");

    const params = {};
    if (view) params.view = view;
    if (type) params.type = type;

    const { data, isLoading, error, refetch } = useAgenda({ ...params, limit: 200 });
    const updateStatus = useUpdateTaskStatus();
    const reschedule = useRescheduleTask();

    const items = data?.items || [];
    const counts = data?.counts || {};

    const buckets = {
        overdue: items.filter((t) => t.bucket === "OVERDUE"),
        today: items.filter((t) => t.bucket === "TODAY"),
        upcoming: items.filter((t) => t.bucket === "UPCOMING"),
        completed: items.filter((t) => t.bucket === "COMPLETED"),
        cancelled: items.filter((t) => t.bucket === "CANCELLED")
    };

    const handleStatus = async (task, status) => {
        try {
            await updateStatus.mutateAsync({ id: task.id, status });
            showToast(status === "COMPLETED" ? "Task completed" : status === "PENDING" ? "Task reopened" : "Task cancelled", "success");
        } catch (err) {
            const map = {
                INVALID_TASK_TRANSITION: "That status change is not allowed for this task.",
                TASK_NOT_PENDING: "This task is no longer pending."
            };
            showToast(map[err?.code] || err?.message || "Failed to update task", "error");
        }
    };

    const handleReschedule = async (task) => {
        if (!rescheduleValue) return;
        try {
            await reschedule.mutateAsync({
                id: task.id,
                dueDate: new Date(rescheduleValue).toISOString(),
                reason: "Rescheduled from tasks page"
            });
            showToast("Task rescheduled", "success");
            setRescheduleId(null);
            setRescheduleValue("");
        } catch (err) {
            showToast(err?.message || "Failed to reschedule", "error");
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">Loading tasks...</div>;
    }

    if (error) {
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-1">
                    {error?.status === 403
                        ? "You do not have permission to view tasks"
                        : error?.status === 401
                            ? "Session expired. Please sign in again."
                            : "Failed to load tasks"}
                </p>
                <p className="text-sm text-gray-500">{error?.message}</p>
                <button onClick={() => refetch()} className="mt-4 px-4 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl">
                    Retry
                </button>
            </div>
        );
    }

    const sections = [
        { key: "overdue", title: "Overdue", icon: AlertTriangle, titleClass: "text-red-500", tasks: buckets.overdue },
        { key: "today", title: "Today", icon: CalendarIcon, titleClass: "text-gray-900", tasks: buckets.today },
        { key: "upcoming", title: "Upcoming", icon: CalendarClock, titleClass: "text-indigo-600", tasks: buckets.upcoming },
        { key: "completed", title: "Completed Recently", icon: CheckSquare, titleClass: "text-gray-500", tasks: buckets.completed },
        { key: "cancelled", title: "Cancelled", icon: XCircle, titleClass: "text-gray-400", tasks: buckets.cancelled }
    ].filter((s) => s.tasks.length > 0 || ["overdue", "today", "upcoming"].includes(s.key));

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:px-8 py-6 bg-white border-b border-gray-100 shrink-0 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tasks &amp; Follow-ups</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Backend-driven agenda — {counts.overdue ?? 0} overdue, {counts.dueNow ?? 0} due now,{" "}
                        {counts.today ?? 0} today, {counts.upcoming ?? 0} upcoming.
                    </p>
                </div>
                <button
                    onClick={() => setModalOpen(true)}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200"
                >
                    <Plus size={18} /> Add Task
                </button>
            </div>

            {/* Working filters */}
            <div className="flex flex-wrap items-center gap-3 p-4 sm:px-8 border-b border-gray-100 bg-white shrink-0">
                <div className="flex flex-wrap gap-2">
                    {VIEW_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => setView(option.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                                view === option.value
                                    ? "bg-purple-50 border-purple-300 text-purple-700"
                                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="ml-auto bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                >
                    <option value="">Type: All</option>
                    {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                    ))}
                </select>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8">
                    {items.length === 0 && (
                        <div className="text-center text-gray-500 p-12 border border-dashed border-gray-200 rounded-2xl bg-white">
                            No tasks match these filters.
                        </div>
                    )}
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <div key={section.key}>
                                <h3 className={`text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${section.titleClass}`}>
                                    <Icon size={16} /> {section.title}
                                    <span className="text-gray-400 font-medium">({section.tasks.length})</span>
                                </h3>
                                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="divide-y divide-gray-100">
                                        {section.tasks.length === 0 ? (
                                            <p className="px-4 py-5 text-sm text-gray-400">Nothing here.</p>
                                        ) : (
                                            section.tasks.map((task) => (
                                                <TaskRow
                                                    key={task.id}
                                                    task={task}
                                                    busy={updateStatus.isPending || reschedule.isPending}
                                                    onStatus={handleStatus}
                                                    onReschedule={handleReschedule}
                                                    rescheduleOpen={rescheduleId === task.id}
                                                    rescheduleValue={rescheduleValue}
                                                    setRescheduleValue={setRescheduleValue}
                                                    toggleReschedule={() => {
                                                        setRescheduleId(rescheduleId === task.id ? null : task.id);
                                                        setRescheduleValue("");
                                                    }}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <CreateTaskModal lead={null} isOpen={modalOpen} onClose={() => setModalOpen(null)} defaultTitle="" />
        </div>
    );
}

function TaskRow({ task, busy, onStatus, onReschedule, rescheduleOpen, rescheduleValue, setRescheduleValue, toggleReschedule }) {
    const typeKey = TYPE_ICONS[task.type] ? task.type : "OTHER";
    const Icon = TYPE_ICONS[typeKey] || CheckSquare;
    const completed = task.status === "COMPLETED";
    const cancelled = task.status === "CANCELLED";
    const due = new Date(task.dueDate);

    return (
        <div className={`p-4 flex flex-wrap items-center gap-4 transition-colors hover:bg-gray-50 ${completed || cancelled ? "bg-gray-50 opacity-80" : ""}`}>
            <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${completed ? "bg-green-100 text-green-600" : task.bucket === "OVERDUE" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"}`}>
                <Icon size={15} />
            </span>

            <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600">
                        {String(task.type || "TASK").replace(/_/g, " ")}
                    </span>
                    {task.bucket === "OVERDUE" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
                            Overdue
                        </span>
                    )}
                    {task.isDueNow && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                            Due now
                        </span>
                    )}
                    {task.priority && task.priority !== "MEDIUM" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                            {task.priority}
                        </span>
                    )}
                </div>
                <h4 className={`font-bold text-sm mt-1 ${completed || cancelled ? "text-gray-500 line-through" : "text-gray-900"}`}>
                    {task.title}
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                    {task.lead ? (
                        <Link href={`/dashboard/leads/${task.leadId}`} className="text-purple-600 font-medium hover:underline">
                            {task.lead.name}
                        </Link>
                    ) : (
                        "No linked lead"
                    )}
                    {task.assignedTo?.name ? ` · ${task.assignedTo.name}` : ""}
                </p>
            </div>

            <div className="hidden sm:block text-right">
                <p className="text-xs font-bold text-gray-900">
                    {due.toLocaleDateString([], { day: "numeric", month: "short" })}
                </p>
                <p className="text-xs text-gray-500">
                    {due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                <span className="hidden sm:flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                    <User size={13} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">{task.assignedTo?.name || "Unassigned"}</span>
                </span>
                {!completed && !cancelled && (
                    <>
                        <button
                            onClick={() => onStatus(task, "COMPLETED")}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                        >
                            Complete
                        </button>
                        <button
                            onClick={toggleReschedule}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
                        >
                            Reschedule
                        </button>
                        <button
                            onClick={() => onStatus(task, "CANCELLED")}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </>
                )}
                {(completed || cancelled) && (
                    <button
                        onClick={() => onStatus(task, "PENDING")}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                    >
                        Reopen
                    </button>
                )}
            </div>

            {rescheduleOpen && (
                <div className="w-full flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <input
                        type="datetime-local"
                        value={rescheduleValue}
                        onChange={(e) => setRescheduleValue(e.target.value)}
                        className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-xs"
                    />
                    <button
                        onClick={() => onReschedule(task)}
                        disabled={!rescheduleValue || busy}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        Save
                    </button>
                    <button
                        onClick={toggleReschedule}
                        className="rounded-lg bg-white border border-indigo-200 px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-50"
                    >
                        Dismiss
                    </button>
                </div>
            )}
        </div>
    );
}
