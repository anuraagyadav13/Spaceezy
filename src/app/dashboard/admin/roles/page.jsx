"use client";
import { useEffect, useMemo, useState } from "react";
import { Shield, Lock } from "lucide-react";
import { ROLE_PERMISSIONS } from "../../../../features/auth/hooks/usePermissions";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";

const ROLE_META = {
    SUPER_ADMIN: { title: "Super Admin", color: "text-purple-600", icon: Shield, desc: "Platform-level administration across every organization." },
    ADMIN: { title: "Owner Admin", color: "text-purple-600", icon: Shield, desc: "Full organization administration: inventory, bookings, team, and settings." },
    SALES_MANAGER: { title: "Sales Manager", color: "text-blue-600", icon: Lock, desc: "Manages leads and team assignment; booking creation and updates." },
    SALES_EXECUTIVE: { title: "Sales Executive", color: "text-emerald-600", icon: Lock, desc: "Access limited to assigned leads, site visits, and softphone dialer." },
    CHANNEL_PARTNER: { title: "Channel Partner", color: "text-orange-600", icon: Lock, desc: "External partner: view projects/inventory and create leads." }
};

export default function RolesPermissionsPage() {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchUsers({ limit: 1000 })
            .then((data) => setUsers(data.users || data || []))
            .catch((err) => showToast(`Failed to load team members: ${err.message}`, "error"));
    }, []);

    const roleCounts = useMemo(() => {
        const counts = {};
        for (const u of Array.isArray(users) ? users : []) {
            counts[u.role] = (counts[u.role] || 0) + 1;
        }
        return counts;
    }, [users]);

    const roles = Object.keys(ROLE_PERMISSIONS);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Roles & Access Control Permissions</h1>
                <p className="text-sm text-gray-500">Rendered from the live permission matrix enforced by the backend.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map((role) => {
                    const meta = ROLE_META[role] || { title: role, color: "text-gray-600", icon: Lock, desc: "" };
                    const Icon = meta.icon;
                    const permissions = ROLE_PERMISSIONS[role];
                    return (
                        <div key={role} className="p-5 bg-white rounded-3xl border border-gray-200 shadow-sm space-y-3">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-900 text-sm">{meta.title}</h3>
                                <Icon size={16} className={meta.color} />
                            </div>
                            <p className="text-xs text-gray-500">{meta.desc}</p>
                            <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                                <span>{permissions.length} permissions</span>
                                <span>{roleCounts[role] || 0} team member{(roleCounts[role] || 0) === 1 ? "" : "s"}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {permissions.slice(0, 8).map((p) => (
                                    <span key={p} className="text-[10px] font-bold bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded">{p}</span>
                                ))}
                                {permissions.length > 8 && (
                                    <span className="text-[10px] font-bold text-gray-400 px-1 py-0.5">+{permissions.length - 8} more</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
