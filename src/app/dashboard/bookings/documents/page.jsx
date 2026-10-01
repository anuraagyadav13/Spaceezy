"use client";
import { FileCheck, Upload } from "lucide-react";

export default function DocumentsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Customer KYC & Agreement Documents</h1>
                <p className="text-sm text-gray-500">Aadhaar, PAN, buyer-seller agreements, and registry documents.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="font-bold text-gray-900 text-sm">Sneha Gupta — Agreement & PAN Card</p>
                        <p className="text-xs text-gray-500">Booking BK-1 • Verified KYC</p>
                    </div>
                    <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">Verified</span>
                </div>
            </div>
        </div>
    );
}
