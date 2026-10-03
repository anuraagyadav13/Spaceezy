"use client";
import { useEffect, useState } from "react";
import { Copy, ShieldAlert, CheckCircle2 } from "lucide-react";
import { fetchDuplicates, mergeLeads } from "../../../../lib/api/leads";
import { showToast } from "../../../../lib/toast";

export default function DuplicateLeadsPage() {
    const [duplicates, setDuplicates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [merging, setMerging] = useState(null); // id of duplicate being merged

    const loadDuplicates = () => {
        setLoading(true);
        fetchDuplicates()
            .then(data => {
                setDuplicates(Array.isArray(data) ? data : []);
            })
            .catch(err => showToast("Failed to load duplicates", "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        let isMounted = true;
        fetchDuplicates()
            .then(data => {
                if (isMounted) setDuplicates(Array.isArray(data) ? data : []);
            })
            .catch(err => {
                if (isMounted) showToast("Failed to load duplicates", "error");
            })
            .finally(() => {
                if (isMounted) setLoading(false);
            });

        return () => { isMounted = false; };
    }, []);

    const handleMerge = async (survivorId, duplicateId) => {
        if (!confirm(`Are you sure you want to merge lead ${duplicateId} into ${survivorId}? The duplicate will be removed and its data combined.`)) return;

        setMerging(duplicateId);
        try {
            await mergeLeads(survivorId, duplicateId);
            showToast("Leads merged successfully", "success");
            loadDuplicates();
        } catch (err) {
            showToast(err.message || "Failed to merge leads", "error");
        } finally {
            setMerging(null);
        }
    };

    if (loading) return <div className="p-8 text-gray-400 font-medium">Scanning for duplicates...</div>;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Duplicate Leads Review Queue</h1>
                <p className="text-sm text-gray-500">Review matching phone number and email duplicates before safe merging.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-medium">
                    <ShieldAlert size={20} className="shrink-0" />
                    <span>Spaceezy duplicate rules strictly require manual confirmation. No records will be silently overwritten.</span>
                </div>

                <div className="divide-y divide-gray-100">
                    {duplicates.length === 0 && (
                        <div className="py-4 text-center text-gray-400">No duplicates detected.</div>
                    )}
                    {duplicates.map((group, idx) => {
                        const survivor = group.leads[0];
                        const dupes = group.leads.slice(1);
                        return (
                            <div key={idx} className="py-6 flex flex-col gap-4">
                                <div>
                                    <span className="text-[10px] font-bold uppercase text-red-600 bg-red-50 px-2 py-0.5 rounded">{group.type} ({group.value})</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 border border-emerald-200 bg-emerald-50/30 rounded-xl relative">
                                        <div className="absolute top-2 right-2 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">Primary</div>
                                        <h3 className="font-bold text-gray-900 text-base">{survivor.name} ({survivor.id})</h3>
                                        <p className="text-xs text-gray-500 mb-1">Created: {new Date(survivor.createdAt).toLocaleDateString()}</p>
                                        <p className="text-xs text-gray-500">Source: {survivor.source || 'N/A'}</p>
                                        <p className="text-xs text-gray-500">Assigned To: {survivor.assignedTo?.name || 'Unassigned'}</p>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        {dupes.map(duplicate => (
                                            <div key={duplicate.id} className="p-4 border border-gray-200 rounded-xl flex items-center justify-between">
                                                <div>
                                                    <h3 className="font-bold text-gray-900 text-base">{duplicate.name} ({duplicate.id})</h3>
                                                    <p className="text-xs text-gray-500 mb-1">Created: {new Date(duplicate.createdAt).toLocaleDateString()}</p>
                                                    <p className="text-xs text-gray-500">Source: {duplicate.source || 'N/A'}</p>
                                                    <p className="text-xs text-gray-500">Assigned To: {duplicate.assignedTo?.name || 'Unassigned'}</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleMerge(survivor.id, duplicate.id)}
                                                    disabled={merging === duplicate.id}
                                                    className="px-4 py-2 bg-purple-600 text-white font-bold text-xs rounded-xl hover:bg-purple-700 shadow-sm disabled:opacity-50"
                                                >
                                                    {merging === duplicate.id ? 'Merging...' : 'Merge'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
