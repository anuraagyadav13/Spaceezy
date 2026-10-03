"use client";

export default function UntouchedLeadsPage() {

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Untouched Leads SLA Queue</h1>
                <p className="text-sm text-gray-500">This SLA queue is not backed by a dedicated backend endpoint in the current CRM.</p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
                Not implemented — backend capability missing for untouched lead SLA tracking.
            </div>
        </div>
    );
}
