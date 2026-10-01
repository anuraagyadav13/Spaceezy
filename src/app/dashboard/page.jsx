"use client";
import { useState } from "react";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { 
    Filter, RefreshCw, ChevronDown, Users, 
    CalendarCheck, FileCheck, IndianRupee, 
    BarChart3, Clock, AlertCircle, PhoneCall 
} from "lucide-react";

export default function DashboardOverview() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState("Leads");

    return (
        <div className="flex h-full overflow-hidden bg-gray-50/50">
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
                
                {/* Header & Global Filters */}
                <div className="flex flex-col gap-4 mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Owner Overview</h1>
                            <p className="text-sm text-gray-500 mt-1">Last updated: Today at 10:42 AM</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                                <RefreshCw size={16} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-500 border-r border-gray-100 pr-4">
                            <Filter size={18} />
                            <span className="text-sm font-medium">Filters</span>
                        </div>
                        
                        <div className="flex-1 flex flex-wrap items-center gap-3">
                            {["Date Range: This Month", "Project: All", "Lead Source: All", "Sales Rep: All"].map(f => (
                                <button key={f} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
                                    {f}
                                    <ChevronDown size={14} className="text-gray-400" />
                                </button>
                            ))}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button className="text-sm text-purple-600 font-medium hover:text-purple-700">Apply</button>
                            <span className="text-gray-300">|</span>
                            <button className="text-sm text-gray-500 hover:text-gray-700">Reset</button>
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <KpiCard title="Total Leads" value="1,248" change="+12% from last month" icon={Users} color="blue" />
                    <KpiCard title="Site Visits" value="342" change="+5% from last month" icon={CalendarCheck} color="purple" />
                    <KpiCard title="Bookings" value="48" change="+18% from last month" icon={FileCheck} color="emerald" />
                    <KpiCard title="Agreement Value" value="₹42.5 Cr" change="+22% from last month" icon={IndianRupee} color="indigo" />
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6">
                    {["Leads", "Site Visits", "Bookings"].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Tab Content Area (Mock Analytics) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Leads by Source */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <BarChart3 size={18} className="text-gray-400"/> Leads by Source
                        </h3>
                        <div className="flex flex-col gap-4">
                            <BarRow label="Google Ads" value={450} max={600} color="bg-blue-500" />
                            <BarRow label="Website Organic" value={320} max={600} color="bg-purple-500" />
                            <BarRow label="Facebook Ads" value={210} max={600} color="bg-indigo-500" />
                            <BarRow label="Referral" value={140} max={600} color="bg-emerald-500" />
                            <BarRow label="Walk-in" value={128} max={600} color="bg-amber-500" />
                        </div>
                    </div>

                    {/* Leads by Stage */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                            <BarChart3 size={18} className="text-gray-400"/> Leads by Stage
                        </h3>
                        <div className="flex flex-col gap-4">
                            <BarRow label="New" value={300} max={500} color="bg-gray-400" />
                            <BarRow label="Contacted" value={450} max={500} color="bg-blue-400" />
                            <BarRow label="Site Visit Scheduled" value={120} max={500} color="bg-purple-500" />
                            <BarRow label="Negotiation" value={60} max={500} color="bg-orange-400" />
                            <BarRow label="Booked" value={48} max={500} color="bg-emerald-500" />
                        </div>
                    </div>
                </div>

                {/* Performance Summary */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-4">Today&apos;s Performance Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <PerfMetric label="Total Calls" value="342" />
                        <PerfMetric label="Avg Talk Time" value="4m 12s" />
                        <PerfMetric label="Site Visits Done" value="12" />
                        <PerfMetric label="Avg Time to Contact" value="18m" />
                    </div>
                </div>
            </div>

            {/* Right Sidebar: Today's Agenda */}
            <div className="hidden xl:flex flex-col w-80 border-l border-gray-200 bg-white shrink-0 shadow-[inset_1px_0_0_rgba(0,0,0,0.02)]">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="font-bold text-gray-900 flex items-center gap-2">
                        <Clock size={18} className="text-purple-600" />
                        Today&apos;s Agenda
                    </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
                    {/* Section */}
                    <div>
                        <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <AlertCircle size={14} /> Overdue (3)
                        </h3>
                        <div className="flex flex-col gap-2">
                            <AgendaItem title="Call Rahul Sharma" subtitle="Follow-up on pricing" time="Yesterday" type="call" urgent />
                            <AgendaItem title="Send Quotation" subtitle="Sneha Gupta" time="Yesterday" type="task" urgent />
                        </div>
                    </div>

                    {/* Section */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                            Site Visits (4)
                        </h3>
                        <div className="flex flex-col gap-2">
                            <AgendaItem title="Alpha Residency" subtitle="Vikram M. (Sales: Priya)" time="11:30 AM" type="visit" />
                            <AgendaItem title="Sky City Towers" subtitle="Anita K. (Sales: Aman)" time="02:00 PM" type="visit" />
                        </div>
                    </div>

                    {/* Section */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                            Follow-ups (12)
                        </h3>
                        <div className="flex flex-col gap-2">
                            <AgendaItem title="Call John Doe" subtitle="Interested in 3BHK" time="03:30 PM" type="call" />
                            <AgendaItem title="WhatsApp Docs" subtitle="To: Ramesh Singh" time="04:00 PM" type="task" />
                        </div>
                    </div>
                </div>

                {/* User Availability Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Team Availability</h3>
                    <div className="flex flex-col gap-2">
                        <AgentAvail name="Priya Singh" state="Available" color="bg-green-500" />
                        <AgentAvail name="Aman Verma" state="On Call" color="bg-yellow-500" />
                        <AgentAvail name="Rahul Sharma" state="Offline" color="bg-gray-300" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper Components
function KpiCard({ title, value, change, icon: Icon, color }) {
    const colorMap = {
        blue: "text-blue-600 bg-blue-50 border-blue-100",
        purple: "text-purple-600 bg-purple-50 border-purple-100",
        emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
        indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    };
    
    return (
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
                </div>
                <div className={`p-2 rounded-xl border ${colorMap[color]}`}>
                    <Icon size={20} />
                </div>
            </div>
            <p className="text-xs font-medium text-emerald-600 mt-4 bg-emerald-50 inline-block px-2 py-1 rounded-md">
                {change}
            </p>
        </div>
    );
}

function BarRow({ label, value, max, color }) {
    const width = Math.round((value / max) * 100);
    return (
        <div className="flex items-center gap-3">
            <div className="w-32 shrink-0 text-sm font-medium text-gray-700 truncate">{label}</div>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }}></div>
            </div>
            <div className="w-12 text-right text-sm font-bold text-gray-900">{value}</div>
        </div>
    );
}

function PerfMetric({ label, value }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
            <span className="text-xl font-bold text-gray-900">{value}</span>
        </div>
    );
}

function AgendaItem({ title, subtitle, time, type, urgent }) {
    const icons = {
        call: PhoneCall,
        task: FileCheck,
        visit: CalendarCheck
    };
    const Icon = icons[type];
    
    return (
        <div className={`p-3 rounded-xl border ${urgent ? 'border-red-100 bg-red-50/50' : 'border-gray-100 bg-white shadow-sm'} flex items-start gap-3`}>
            <div className={`mt-0.5 p-1.5 rounded-lg ${urgent ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-bold text-gray-900 truncate">{title}</p>
                    <span className={`text-[10px] font-bold shrink-0 ${urgent ? 'text-red-500' : 'text-gray-500'}`}>{time}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            </div>
        </div>
    );
}

function AgentAvail({ name, state, color }) {
    return (
        <div className="flex items-center justify-between text-sm bg-white border border-gray-100 p-2 rounded-lg">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${color}`}></div>
                <span className="font-medium text-gray-700">{name}</span>
            </div>
            <span className="text-xs text-gray-500 font-medium">{state}</span>
        </div>
    );
}
