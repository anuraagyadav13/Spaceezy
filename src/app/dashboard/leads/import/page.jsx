"use client";
import { useState } from "react";
import { UploadCloud, Download } from "lucide-react";

export default function ImportLeadsPage() {


    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Bulk Import Leads</h1>
                <p className="text-sm text-gray-500">Upload CSV/Excel spreadsheets with column mapping and duplicate detection preview.</p>
            </div>

            <div className="max-w-3xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:bg-gray-50 cursor-pointer">
                    <UploadCloud size={44} className="mx-auto text-purple-600 mb-3" />
                    <h3 className="font-bold text-gray-900 text-lg">Click to select CSV file</h3>
                    <p className="text-xs text-gray-500 mt-1">Supports .csv, .xlsx files (Max 10MB)</p>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <button className="text-xs font-bold text-purple-600 flex items-center gap-1.5 hover:underline">
                        <Download size={14} /> Download Sample Template CSV
                    </button>
                    <button 
                        onClick={() => alert("Simulated import completed! 12 leads imported.")}
                        className="px-6 py-2.5 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-purple-700"
                    >
                        Simulate Import
                    </button>
                </div>
            </div>
        </div>
    );
}
