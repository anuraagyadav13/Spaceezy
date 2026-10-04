"use client";
import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatShortDate } from "../helpers";

const SERIES = [
    { key: "new", name: "New", color: "#8b5cf6" },
    { key: "contacted", name: "Contacted", color: "#06b6d4" },
    { key: "siteVisit", name: "Site Visit", color: "#f97316" },
    { key: "quotation", name: "Quotation", color: "#6366f1" },
    { key: "booking", name: "Booking", color: "#10b981" }
];

export default function LeadTrendChart({ trends }) {
    const data = useMemo(
        () =>
            (trends || []).map((bucket) => ({
                ...bucket,
                label: formatShortDate(bucket.date)
            })),
        [trends]
    );

    const hasData = data.some((row) => SERIES.some((s) => row[s.key] > 0));

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Lead Trend</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Stage entries per day for the selected period</p>
                </div>
            </div>
            {!hasData ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-gray-400">
                    <p className="text-sm font-semibold">No lead activity in this period</p>
                    <p className="text-xs mt-1">Adjust the filters or wait for new activity</p>
                </div>
            ) : (
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                            <defs>
                                {SERIES.map((s) => (
                                    <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                                labelStyle={{ fontWeight: 700 }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                            {SERIES.map((s) => (
                                <Area
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    name={s.name}
                                    stroke={s.color}
                                    fill={`url(#grad-${s.key})`}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
