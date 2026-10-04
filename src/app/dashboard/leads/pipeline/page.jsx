"use client";
import { Suspense } from "react";
import LeadPipelineDashboard from "../../../../features/pipeline/components/LeadPipelineDashboard";

function PipelineFallback() {
    return (
        <div className="p-8 text-gray-400 font-medium">Loading pipeline...</div>
    );
}

export default function LeadPipelinePage() {
    return (
        <Suspense fallback={<PipelineFallback />}>
            <LeadPipelineDashboard />
        </Suspense>
    );
}
