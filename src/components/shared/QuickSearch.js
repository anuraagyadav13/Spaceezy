// src/components/shared/QuickSearch.js
// A working replacement for the old decorative "Search dialogues" box.
// Takes a pre-built index of {label, sublabel, type, href} and filters
// it client-side as the person types, with a dropdown of jump-to results.
"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export default function QuickSearch({ items, placeholder = "Search..." }) {
    const [query, setQuery] = useState("");
    const router = useRouter();

    const results = useMemo(() => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return items
            .filter((item) => item.label.toLowerCase().includes(q) || (item.sublabel || "").toLowerCase().includes(q))
            .slice(0, 6);
    }, [query, items]);

    const handleSelect = (item) => {
        setQuery("");
        router.push(item.href);
    };

    return (
        <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-11 pr-9 py-3 bg-white rounded-2xl text-[13px] outline-none shadow-[0_2px_10px_rgba(0,0,0,0.02)] placeholder:text-gray-400"
            />
            {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <X size={14} />
                </button>
            )}
            {query && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden max-h-64 overflow-y-auto z-50">
                    {results.length > 0 ? (
                        results.map((item, i) => (
                            <button
                                key={i}
                                onClick={() => handleSelect(item)}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2 border-b border-gray-50 last:border-0"
                            >
                                <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-gray-900 truncate">{item.label}</p>
                                    {item.sublabel && <p className="text-[11px] text-gray-400 truncate">{item.sublabel}</p>}
                                </div>
                                <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full shrink-0">{item.type}</span>
                            </button>
                        ))
                    ) : (
                        <p className="px-4 py-3 text-[13px] text-gray-400">No matches for &quot;{query}&quot;</p>
                    )}
                </div>
            )}
        </div>
    );
}