"use client";
import { useEffect, useState } from "react";
import { DollarSign, Building2 } from "lucide-react";
import { fetchProperties } from "../../../../lib/api/properties";
import { showToast } from "../../../../lib/toast";

export default function PricingPage() {
    const [props, setProps] = useState([]);

    useEffect(() => {
        const loadData = async () => {
            try {
                const data = await fetchProperties({ limit: 100 });
                setProps(data.properties || data || []);
            } catch (err) {
                showToast(`Failed to load pricing data: ${err.message}`, "error");
            }
        };
        loadData();
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Inventory Pricing & Rate Cards</h1>
                <p className="text-sm text-gray-500">Base pricing, agreement values, and price sheet configurations across developments.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 font-bold text-gray-500 uppercase">
                            <th className="p-4">Property / Development</th>
                            <th className="p-4">Category</th>
                            <th className="p-4">Base Rate Sheet</th>
                            <th className="p-4 text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {props.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-gray-900">{p.name}</td>
                                <td className="p-4 text-gray-600">{p.type}</td>
                                <td className="p-4 font-black text-purple-700">{p.price}</td>
                                <td className="p-4 text-right"><span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded">{p.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
