"use client";

export default function ImportLeadsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Bulk Import Leads</h1>
                <p className="text-sm text-gray-500">Upload CSV/Excel spreadsheets with column mapping and duplicate detection preview.</p>
            </div>

            <div className="max-w-3xl bg-white p-8 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="font-bold text-gray-900 text-sm">Not implemented</p>
                    <p className="text-xs text-gray-500 mt-1">
                        The backend has no lead bulk-import endpoint yet. Leads can be created individually
                        through the CRM or automatically via the public enquiry form and Meta Lead Ads sync.
                    </p>
                </div>
            </div>
        </div>
    );
}
