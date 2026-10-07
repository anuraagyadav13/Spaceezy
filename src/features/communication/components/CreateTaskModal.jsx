"use client";

import { useState } from "react";
import Modal from "../../../components/shared/Modal";
import { useCreateTask } from "../hooks/useTaskActions";
import { showToast } from "../../../lib/toast";

const TASK_TYPES = [
    { value: "FOLLOW_UP", label: "Follow-up" },
    { value: "CALL", label: "Call" },
    { value: "MEETING", label: "Meeting" },
    { value: "SITE_VISIT", label: "Site Visit" },
    { value: "OTHER", label: "Other" }
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const defaultDue = () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function TaskForm({ lead, onClose, defaultTitle }) {
    const createTask = useCreateTask();
    const [title, setTitle] = useState(defaultTitle);
    const [type, setType] = useState("FOLLOW_UP");
    const [priority, setPriority] = useState("MEDIUM");
    const [dueDate, setDueDate] = useState(defaultDue);

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            await createTask.mutateAsync({
                title: title.trim(),
                type,
                priority,
                dueDate: new Date(dueDate).toISOString(),
                leadId: lead?.id
            });
            showToast("Task created", "success");
            onClose?.();
        } catch (err) {
            showToast(err?.message || "Failed to create task", "error");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block">
                <span className="text-xs font-medium text-slate-600">Title</span>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={200}
                    placeholder="Call back about 3BHK pricing"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-xs font-medium text-slate-600">Type</span>
                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                        {TASK_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs font-medium text-slate-600">Priority</span>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                        {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </label>
            </div>
            <label className="block">
                <span className="text-xs font-medium text-slate-600">Due at</span>
                <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
            </label>
            <div className="flex justify-end gap-2 pt-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={createTask.isPending}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                    {createTask.isPending ? "Creating..." : "Create Task"}
                </button>
            </div>
        </form>
    );
}

export default function CreateTaskModal({ lead, isOpen, onClose, defaultTitle = "" }) {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Task" maxWidth="max-w-md">
            <TaskForm
                key={`${lead?.id || "no-lead"}|${defaultTitle}`}
                lead={lead}
                onClose={onClose}
                defaultTitle={defaultTitle}
            />
        </Modal>
    );
}
