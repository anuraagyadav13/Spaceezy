"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { DollarSign, Loader2, AlertCircle, Search, Save, X } from "lucide-react";
import { fetchProperties, updateProperty } from "../../../../lib/api/properties";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";
import { showToast } from "../../../../lib/toast";
import { formatCurrency } from "../../../../features/pipeline/helpers";

const UNIT_BADGES = {
    AVAILABLE: "bg-emerald-50 text-emerald-700",
    RESERVED: "bg-purple-50 text-purple-700",
    SOLD: "bg-gray-800 text-white",
};

export default function PricingPage() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [editingId, setEditingId] = useState(null);
    const [draftPrice, setDraftPrice] = useState("");

    const {
        data: properties,
        isPending,
        isError,
        error,
        refetch
    } = useQuery({
        queryKey: ["properties", "pricing"],
        queryFn: () => fetchProperties(null, { limit: 500 }),
        staleTime: 30 * 1000,
        retry: 1
    });

    const savePrice = useMutation({
        mutationFn: ({ id, price }) => updateProperty({ id, price }),
        onSuccess: () => {
            showToast("Price updated");
            setEditingId(null);
            queryClient.invalidateQueries({ queryKey: ["properties"] });
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        },
        onError: (err) => showToast(err?.message || "Failed to update price", "error")
    });

    const rows = useMemo(() => {
        const list = Array.isArray(properties) ? properties : [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((p) =>
            [p.unitNumber, p.title, p.configuration, p.project?.name, p.tower]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q))
        );
    }, [properties, search]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-4 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Inventory Pricing & Rate Cards</h1>
                    <p className="text-sm text-gray-500">Unit-level pricing across projects. Edits require inventory:update permission.</p>
                </div>
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search unit, project, config…"
                        className="bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm font-semibold w-64"
                    />
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                {isPending ? (
                    <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                        <Loader2 size={24} className="animate-spin mr-3" /> Loading pricing…
                    </div>
                ) : isError ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <AlertCircle size={30} className="text-red-400 mb-3" />
                        <p className="text-sm font-semibold text-gray-600 mb-3">{error?.message || "Failed to load pricing data"}</p>
                        <button onClick={() => refetch()} className="px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold">Retry</button>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-20 text-center text-gray-400 text-sm">
                        No units found.{" "}
                        <Link href="/dashboard/inventory/units/quick-add" className="text-purple-600 font-bold hover:underline">Add units first</Link>
                    </div>
                ) : (
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-gray-50 border-b border-gray-100 font-black text-gray-500 uppercase text-[10px]">
                                    <th className="p-4">Unit</th>
                                    <th className="p-4">Project</th>
                                    <th className="p-4">Configuration</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Price</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map((p) => (
                                    <tr key={p.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-black text-gray-900">
                                            {p.unitNumber || p.title}
                                            {p.tower ? <span className="ml-1.5 text-[10px] font-bold text-gray-400">T-{p.tower}</span> : null}
                                        </td>
                                        <td className="p-4 text-gray-600">{p.project?.name || "—"}</td>
                                        <td className="p-4 text-gray-600">{p.configuration || "—"}</td>
                                        <td className="p-4">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${UNIT_BADGES[p.status] || "bg-gray-100 text-gray-600"}`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-black text-purple-700">
                                            {editingId === p.id ? (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={draftPrice}
                                                    onChange={(e) => setDraftPrice(e.target.value)}
                                                    className="w-36 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-right font-bold text-gray-900"
                                                    autoFocus
                                                />
                                            ) : (
                                                formatCurrency(p.price)
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="inline-flex items-center gap-1.5">
                                                <PermissionGate permission="inventory:update">
                                                    {editingId === p.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => savePrice.mutate({ id: p.id, price: Number(draftPrice) })}
                                                                disabled={savePrice.isPending || !(Number(draftPrice) > 0)}
                                                                className="text-[10px] font-black px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 inline-flex items-center gap-1"
                                                            >
                                                                {savePrice.isPending ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingId(null)}
                                                                className="text-[10px] font-black px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 inline-flex items-center gap-1"
                                                            >
                                                                <X size={11} /> Cancel
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setEditingId(p.id);
                                                                setDraftPrice(String(p.price));
                                                            }}
                                                            className="text-[10px] font-black px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 inline-flex items-center gap-1"
                                                            title="Edit price"
                                                        >
                                                            <DollarSign size={11} /> Edit
                                                        </button>
                                                    )}
                                                </PermissionGate>
                                                <Link
                                                    href={`/dashboard/inventory/units/${p.id}`}
                                                    className="text-[10px] font-black px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
                                                >
                                                    Open
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
