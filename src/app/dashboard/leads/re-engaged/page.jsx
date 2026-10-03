"use client";

export default function ReEngagedLeadsPage() {

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Re-engaged Leads Queue</h1>
                    <p className="text-sm text-gray-500">This queue is not backed by a dedicated backend endpoint in the current CRM.</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 text-sm text-gray-600">
                Not implemented — backend capability missing for re-engagement tracking.
            </div>
        </div>
    );
}
