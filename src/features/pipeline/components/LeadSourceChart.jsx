"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BAR_COLORS = ["#8b5cf6", "#6366f1", "#06b6d4", "#10b981", "#f97316", "#f43f5e", "#eab308"];

export default function LeadSourceChart({ sources }) {
    const hasData = (sources || []).length > 0;

    return (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5">
            <div className="mb-4">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Lead Sources</h3>
                <p className="text-xs text-gray-500 mt-0.5">Where your pipeline leads come from</p>
            </div>
            {!hasData ? (
                <div className="h-[260px] flex flex-col items-center justify-center text-gray-400">
                    <p className="text-sm font-semibold">No source data yet</p>
                    <p className="text-xs mt-1">Sources appear once leads match your filters</p>
                </div>
            ) : (
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sources} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                            <YAxis
                                type="category"
                                dataKey="source"
                                width={110}
                                tick={{ fontSize: 11, fill: "#64748b" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: "rgba(139, 92, 246, 0.06)" }}
                                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                                formatter={(value, _name, item) => [`${value} leads (${item.payload.pct}%)`, "Leads"]}
                            />
                            <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18}>
                                {sources.map((_, index) => (
                                    <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
