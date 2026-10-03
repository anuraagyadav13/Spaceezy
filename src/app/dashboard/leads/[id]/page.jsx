"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchLeadById } from "../../../../lib/api/leads";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";
import { 
    ArrowLeft, Phone, Mail, MessageSquare, Calendar as CalendarIcon,
    FileText, Search, Star, History, MoreHorizontal, User, CalendarCheck
} from "lucide-react";

export default function LeadProfile() {
    const params = useParams();
    const router = useRouter();
    const [lead, setLead] = useState(null);
    const [employee, setEmployee] = useState(null);
    const [activeTab, setActiveTab] = useState("Activity");

    useEffect(() => {
        const loadData = async () => {
            try {
                const leadData = await fetchLeadById(params.id);
                setLead(leadData);
                
                const assignedId = leadData.assignedToId || leadData.assignedTo;
                if (assignedId) {
                    const usersData = await fetchUsers();
                    const emps = usersData.users || usersData || [];
                    const emp = emps.find(e => e.id === assignedId);
                    setEmployee(emp);
                }
            } catch (err) {
                showToast(`Failed to load lead profile: ${err.message}`, "error");
            }
        };
        loadData();
    }, [params.id]);

    if (!lead) {
        return <div className="p-8 text-center text-gray-500">Loading Lead 360...</div>;
    }

    const tabs = ["Activity", "Starred", "Notes", "Calls", "WhatsApp", "History", "Follow-ups", "Emails"];
    const activityTimeline = Array.isArray(lead.activities) ? lead.activities : [];
    const currentStatus = lead.status || lead.stage || "NEW";

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            {/* Main Column */}
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                {/* Header Section */}
                <div className="bg-white border-b border-gray-100 shrink-0">
                    <div className="px-4 sm:px-8 py-4 flex items-center gap-4">
                        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-50 rounded-xl transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black text-white bg-gradient-to-r from-purple-500 to-indigo-500 px-2 py-1 rounded uppercase tracking-wider shadow-sm">
                                {lead.id}
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                {currentStatus}
                            </span>
                            <span className="text-xs text-gray-500 font-bold bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
                                {lead.source || "Unknown Source"}
                            </span>
                        </div>
                    </div>

                    <div className="px-4 sm:px-8 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                        <div className="flex gap-5 items-center">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-100 to-blue-100 border border-purple-200 flex items-center justify-center shadow-sm shrink-0">
                                <User size={28} className="text-purple-600" />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{lead.name}</h1>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm font-medium text-gray-600">
                                    <p className="flex items-center gap-1.5"><Phone size={14} className="text-gray-400"/> {lead.phone}</p>
                                    {lead.email && <p className="flex items-center gap-1.5"><Mail size={14} className="text-gray-400"/> {lead.email}</p>}
                                </div>
                            </div>
                        </div>

                        {/* Quick Action Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                            <ActionBtn icon={FileText} label="Note" />
                            <ActionBtn icon={Phone} label="Call" color="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" />
                            <ActionBtn icon={MessageSquare} label="WhatsApp" color="bg-green-50 text-green-700 border-green-200 hover:bg-green-100" />
                            <ActionBtn icon={CalendarIcon} label="Site Visit" />
                            <ActionBtn icon={CalendarCheck} label="Follow-up" />
                            <Link href={`/dashboard/leads/${lead.id}/match`} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity shadow-sm shadow-purple-200">
                                <Search size={16} /> Property Match
                            </Link>
                            <button className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors border border-transparent hover:border-gray-200">
                                <MoreHorizontal size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs & Content */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div className="px-4 sm:px-8 border-b border-gray-200 shrink-0 bg-white flex gap-1 overflow-x-auto hide-scrollbar">
                        {tabs.map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-gray-50/50">
                        {activeTab === "Activity" && (
                            <div className="max-w-3xl">
                                {activityTimeline.length === 0 ? (
                                    <div className="text-center text-gray-500 p-12 border border-dashed border-gray-200 rounded-2xl bg-white">
                                        <p>No lead activity exists yet.</p>
                                    </div>
                                ) : (
                                    <div className="relative pl-6 border-l-2 border-gray-200 space-y-8">
                                        {activityTimeline.map((activity) => (
                                            <TimelineItem
                                                key={activity.id}
                                                type={activity.type || "System"}
                                                title={activity.description || "Lead activity"}
                                                time={activity.createdAt ? new Date(activity.createdAt).toLocaleString() : "Unknown time"}
                                                user={activity.performedBy?.name || activity.performer || employee?.name || "System"}
                                                icon={activity.type === "STATUS_CHANGE" ? History : activity.type === "CALL" ? Phone : Star}
                                                color={activity.type === "STATUS_CHANGE" ? "text-blue-600 bg-blue-100" : activity.type === "CALL" ? "text-emerald-600 bg-emerald-100" : "text-gray-600 bg-gray-200"}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {activeTab !== "Activity" && (
                            <div className="text-center text-gray-500 p-12">
                                <p>Not implemented — backend capability missing for the {activeTab.toLowerCase()} lead view.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Profile Details */}
            <div className="hidden xl:flex flex-col w-80 border-l border-gray-200 bg-white shrink-0 overflow-y-auto custom-scrollbar">
                <div className="p-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Lead Requirements</h3>
                    <div className="space-y-4">
                        <DetailRow label="Interested In" value={lead.project || "Any"} />
                        <DetailRow label="Budget" value={lead.budget || "Not specified"} className="text-emerald-600 font-black" />
                        <DetailRow label="Location" value="Not specified" />
                    </div>

                    <hr className="my-6 border-gray-100" />

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Ownership</h3>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0 border border-white shadow-sm">
                            <Image src={`https://i.pravatar.cc/150?u=${lead.assignedTo}`} alt="" width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-gray-900">{employee?.name || "Unassigned"}</p>
                            <p className="text-xs text-gray-500">{employee?.role || "Sales"}</p>
                        </div>
                    </div>

                    <hr className="my-6 border-gray-100" />

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Engagement Metrics</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <MetricCard label="Site Visits" value="0" />
                        <MetricCard label="Calls (Ans)" value="1" />
                        <MetricCard label="Calls (Missed)" value="0" />
                        <MetricCard label="WhatsApp" value="2" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helpers
function ActionBtn({ icon: Icon, label, color = "bg-white text-gray-700 border-gray-200 hover:bg-gray-50" }) {
    return (
        <button className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors shadow-sm ${color}`}>
            <Icon size={16} /> <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

function DetailRow({ label, value, className = "text-gray-900 font-bold" }) {
    return (
        <div>
            <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
            <p className={`text-sm ${className}`}>{value}</p>
        </div>
    );
}

function MetricCard({ label, value }) {
    return (
        <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
            <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        </div>
    );
}

function TimelineItem({ type, title, desc, time, user, icon: Icon, color }) {
    return (
        <div className="relative">
            <div className={`absolute -left-[35px] w-8 h-8 rounded-full flex items-center justify-center border-4 border-gray-50 ${color}`}>
                <Icon size={12} />
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-start gap-4 mb-2">
                    <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">{type}</span>
                        <h4 className="font-bold text-gray-900">{title}</h4>
                    </div>
                    <span className="text-xs font-medium text-gray-400 shrink-0">{time}</span>
                </div>
                {desc && <p className="text-sm text-gray-600 mb-3">{desc}</p>}
                <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <div className="w-5 h-5 rounded-full bg-gray-200 overflow-hidden">
                        <Image src={`https://i.pravatar.cc/150?u=${user}`} alt="" width={20} height={20} className="w-5 h-5 rounded-full object-cover" />
                    </div>
                    {user}
                </div>
            </div>
        </div>
    );
}
