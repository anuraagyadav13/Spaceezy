"use client";
import Link from "next/link";
import { Phone, Mail, StickyNote, ArrowRightCircle, CalendarDays, Clock3, CheckCircle2, FileText, BadgeCheck, HelpCircle } from "lucide-react";
import { formatRelativeTime } from "../helpers";

const TYPE_META = {
    CALL: { icon: Phone, tint: "bg-blue-50 text-blue-600" },
    EMAIL: { icon: Mail, tint: "bg-indigo-50 text-indigo-600" },
    NOTE: { icon: StickyNote, tint: "bg-amber-50 text-amber-600" },
    STATUS_CHANGE: { icon: ArrowRightCircle, tint: "bg-purple-50 text-purple-600" },
    SITE_VISIT: { icon: CalendarDays, tint: "bg-orange-50 text-orange-600" },
    FOLLOW_UP: { icon: Clock3, tint: "bg-cyan-50 text-cyan-600" },
    TASK: { icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600" },
    QUOTATION: { icon: FileText, tint: "bg-indigo-50 text-indigo-600" },
    BOOKING: { icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-600" }
};

const TYPE_LABELS = {
    CALL: "Call",
    EMAIL: "Email",
    NOTE: "Note",
    STATUS_CHANGE: "Stage change",
    SITE_VISIT: "Site visit",
    FOLLOW_UP: "Follow-up",
    TASK: "Task",
    QUOTATION: "Quotation",
    BOOKING: "Booking"
};

export default function RecentActivities({ activities }) {
    const items = activities || [];

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden h-full">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Recent Activities</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Latest actions across your leads</p>
                </div>
            </div>
            {items.length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400">
                    <p className="text-sm font-semibold">No recent activity</p>
                    <p className="text-xs mt-1">Activities appear here as your team works leads</p>
                </div>
            ) : (
                <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto custom-scrollbar">
                    {items.map((activity) => {
                        const meta = TYPE_META[activity.type] || { icon: HelpCircle, tint: "bg-gray-50 text-gray-500" };
                        const Icon = meta.icon;
                        return (
                            <li key={activity.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50/60 transition-colors">
                                <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${meta.tint}`}>
                                    <Icon size={15} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                                            {TYPE_LABELS[activity.type] || activity.type}
                                        </span>
                                        {activity.lead && (
                                            <Link
                                                href={`/dashboard/leads/${activity.lead.id}`}
                                                className="text-xs font-bold text-purple-600 hover:underline truncate"
                                            >
                                                {activity.lead.name}
                                            </Link>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{activity.description}</p>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                                        {activity.performedBy?.name && <span className="font-semibold">{activity.performedBy.name}</span>}
                                        <span>{formatRelativeTime(activity.createdAt)}</span>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
