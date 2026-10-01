"use client";
import { Shield, Lock } from "lucide-react";

export default function RolesPermissionsPage() {
    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Roles & Access Control Permissions</h1>
                <p className="text-sm text-gray-500">Configure role-based access restrictions for sales employees vs owner admin.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-900 text-sm">Owner Admin</h3>
                            <Shield size={16} className="text-purple-600" />
                        </div>
                        <p className="text-xs text-gray-500">Full system permissions across inventory, bookings, and team analytics.</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-900 text-sm">Sales Executive</h3>
                            <Lock size={16} className="text-blue-600" />
                        </div>
                        <p className="text-xs text-gray-500">Access limited to assigned leads, site visits, and softphone dialer.</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-900 text-sm">Field Agent</h3>
                            <Lock size={16} className="text-emerald-600" />
                        </div>
                        <p className="text-xs text-gray-500">Mobile access for property site visit check-ins and outcome submission.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
