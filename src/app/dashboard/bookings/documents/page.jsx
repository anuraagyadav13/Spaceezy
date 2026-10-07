"use client";
import Link from "next/link";
import { FileCheck } from "lucide-react";
import { PermissionGate } from "../../../../features/auth/components/PermissionGate";

export default function DocumentsPage() {
    return (
        <PermissionGate
            permission="booking:view"
            fallback={
                <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 items-center justify-center text-center">
                    <FileCheck size={36} className="text-gray-300 mb-3" />
                    <p className="text-sm font-bold text-gray-700">You do not have permission to view documents.</p>
                </div>
            }
        >
            <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Customer KYC & Agreement Documents</h1>
                    <p className="text-sm text-gray-500">Aadhaar, PAN, buyer-seller agreements, and registry documents.</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                    <div className="p-8 text-center">
                        <FileCheck size={32} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-sm font-bold text-gray-700">No documents on file yet</p>
                        <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                            Document storage is not enabled for this workspace. Once enabled, KYC and agreement files will attach to
                            customer and booking records here with access restricted to your organization.
                        </p>
                        <div className="mt-5 flex justify-center gap-3">
                            <Link href="/dashboard/customers" className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100">
                                View customers
                            </Link>
                            <Link href="/dashboard/bookings" className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200">
                                View bookings
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </PermissionGate>
    );
}
