"use client";
import { UploadCloud, Download } from "lucide-react";

export default function BulkImportInventoryPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Bulk Import Inventory Units</h1>
                <p className="text-sm text-gray-500">Batch upload unit pricing, floor plans, and tower mapping via CSV.</p>
            </div>

            <div className="max-w-2xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-6">
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center hover:bg-gray-50 cursor-pointer">
                    <UploadCloud size={44} className="mx-auto text-purple-600 mb-3" />
                    <h3 className="font-bold text-gray-900 text-lg">Click to select CSV/Excel spreadsheet</h3>
                    <p className="text-xs text-gray-500 mt-1">Supports bulk unit creation with field validation</p>
                </div>
            </div>
        </div>
    );
}
