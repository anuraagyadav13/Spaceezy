"use client";
import { useState, useEffect } from "react";
import { 
    CheckSquare, Clock, Filter, Plus, Calendar as CalendarIcon, 
    MessageSquare, Phone, ChevronDown, MoreHorizontal, User
} from "lucide-react";
import { fetchTasks, toggleTaskStatus } from "../../../../lib/api/tasks";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";

export default function TasksPage() {
    const [tasks, setTasks] = useState([]);
    const [employees, setEmployees] = useState([]);

    const loadData = async () => {
        try {
            const [tasksRes, empData] = await Promise.all([
                fetchTasks(),
                fetchUsers()
            ]);
            setTasks(tasksRes.tasks || tasksRes || []);
            setEmployees(empData || []);
        } catch (err) {
            showToast(`Failed to load tasks: ${err.message}`, "error");
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const employeeName = (id) => employees.find((e) => e.id === id)?.name || "Unassigned";

    const handleToggle = async (taskId) => {
        try {
            await toggleTaskStatus(taskId);
            loadData();
        } catch (err) {
            showToast(`Failed to update task: ${err.message}`, "error");
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:px-8 py-6 bg-white border-b border-gray-100 shrink-0 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Tasks & Follow-ups</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your agenda, reminders, and team activities.</p>
                </div>
                <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                    <Plus size={18} /> Add Task
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 p-4 sm:px-8 border-b border-gray-100 bg-white shrink-0">
                <div className="flex items-center gap-2 text-gray-500 border-r border-gray-100 pr-4">
                    <Filter size={18} />
                    <span className="text-sm font-medium hidden sm:inline">Filters</span>
                </div>
                {["Status: Open", "Type: All", "Assigned To: Me", "Date: Upcoming"].map(f => (
                    <button key={f} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                        {f} <ChevronDown size={14} className="text-gray-400" />
                    </button>
                ))}
            </div>

            {/* Content area: Kanban style or List style? Let's do a structured list grouped by date. */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8">
                    
                    {/* Overdue Section */}
                    <div>
                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Clock size={16} /> Overdue Tasks
                        </h3>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="divide-y divide-gray-100">
                                {tasks.filter(t => (t.status === "Pending" || t.status === "PENDING") && new Date(t.dueDate) < new Date()).map(task => (
                                    <TaskRow key={task.id} task={task} employeeName={employeeName(task.assignedTo)} overdue onToggle={handleToggle} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Today Section */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CalendarIcon size={16} className="text-purple-600" /> Today's Agenda
                        </h3>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="divide-y divide-gray-100">
                                {/* Using fallback if no 'today' logic explicitly matches mock data */}
                                {tasks.filter(t => (t.status === "Pending" || t.status === "PENDING") && new Date(t.dueDate) >= new Date()).map(task => (
                                    <TaskRow key={task.id} task={task} employeeName={employeeName(task.assignedTo)} onToggle={handleToggle} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Completed Section */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CheckSquare size={16} /> Completed Recently
                        </h3>
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden opacity-70">
                            <div className="divide-y divide-gray-100">
                                {tasks.filter(t => t.status === "Done" || t.status === "COMPLETED").map(task => (
                                    <TaskRow key={task.id} task={task} employeeName={employeeName(task.assignedTo)} completed onToggle={handleToggle} />
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function TaskRow({ task, employeeName, overdue, completed, onToggle }) {
    const getIcon = () => {
        if (task.type?.toLowerCase().includes("call")) return Phone;
        if (task.type?.toLowerCase().includes("visit")) return CalendarIcon;
        if (task.type?.toLowerCase().includes("whatsapp")) return MessageSquare;
        return CheckSquare;
    };
    const Icon = getIcon();

    return (
        <div className={`p-4 flex items-center gap-4 group transition-colors hover:bg-gray-50 ${completed ? 'bg-gray-50' : ''}`}>
            {/* Checkbox */}
            <button onClick={() => onToggle && onToggle(task.id)} className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-purple-500 text-transparent hover:text-purple-200'}`}>
                <CheckSquare size={14} className={completed ? "text-white" : "text-transparent"} />
            </button>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        task.type === 'Call' ? 'bg-blue-100 text-blue-700' :
                        task.type === 'Site Visit' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                    }`}>
                        <Icon size={10} /> {task.type}
                    </span>
                    {overdue && !completed && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
                            Overdue
                        </span>
                    )}
                </div>
                <h4 className={`font-bold text-sm truncate ${completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                    {task.notes || `Follow up with ${task.refName}`}
                </h4>
                <p className="text-xs text-gray-500 truncate mt-0.5">Ref: <span className="font-medium text-gray-700">{task.refName}</span></p>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-6 shrink-0">
                <div className="hidden sm:block text-right">
                    <p className="text-xs font-bold text-gray-900">{task.dueDate}</p>
                    <p className="text-xs text-gray-500">10:00 AM</p>
                </div>
                <div className="hidden sm:flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                    <User size={14} className="text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">{employeeName}</span>
                </div>
                <button className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                    <MoreHorizontal size={18} />
                </button>
            </div>
        </div>
    );
}
