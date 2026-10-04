"use client";
import { Users, UserPlus, PhoneCall, Clock3, MapPin, FileText, BadgeCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";

const KPI_DEFS = [
    { key: "total", label: "Total Leads", icon: Users, tint: "bg-purple-50 text-purple-600" },
    { key: "new", label: "New Leads", icon: UserPlus, tint: "bg-blue-50 text-blue-600" },
    { key: "contacted", label: "Contacted", icon: PhoneCall, tint: "bg-cyan-50 text-cyan-600" },
    { key: "followUp", label: "Follow-up", icon: Clock3, tint: "bg-amber-50 text-amber-600" },
    { key: "siteVisit", label: "Site Visits", icon: MapPin, tint: "bg-orange-50 text-orange-600" },
    { key: "quotation", label: "Quotations", icon: FileText, tint: "bg-indigo-50 text-indigo-600" },
    { key: "booking", label: "Bookings", icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-600" }
];

function DeltaBadge({ deltaPct }) {
    if (deltaPct === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400">
                <Minus size={12} /> 0%
            </span>
        );
    }
    const isUp = deltaPct > 0;
    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold ${isUp ? "text-emerald-600" : "text-red-500"}`}
        >
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isUp ? "+" : ""}{deltaPct}%
        </span>
    );
}

export default function PipelineSummaryCards({ summary }) {
    if (!summary) return null;

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {KPI_DEFS.map(({ key, label, icon: Icon, tint }) => {
                const stat = summary[key] || { count: 0, prevCount: 0, deltaPct: 0 };
                return (
                    <div key={key} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${tint}`}>
                                <Icon size={16} />
                            </span>
                            <DeltaBadge deltaPct={stat.deltaPct} />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-gray-900 tabular-nums">{stat.count}</p>
                            <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
