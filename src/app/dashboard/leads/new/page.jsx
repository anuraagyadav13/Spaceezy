"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchUsers } from "../../../../lib/api/users";
import { showToast } from "../../../../lib/toast";
import { usePermissions } from "../../../../features/auth/hooks/usePermissions";
import { useAuth } from "../../../../features/auth/hooks/useAuth";
import LeadForm from "../../../../features/leads/components/LeadForm";

export default function NewLeadPage() {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const { user } = useAuth();
    const canViewEmployees = hasPermission("employee:view");
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        if (!canViewEmployees) return;
        let active = true;
        const loadEmployees = async () => {
            try {
                const data = await fetchUsers({ limit: 50 });
                const list = data?.users || data || [];
                if (active) setEmployees(Array.isArray(list) ? list : []);
            } catch (err) {
                showToast(`Failed to load users: ${err.message}`, "error");
            }
        };
        loadEmployees();
        return () => {
            active = false;
        };
    }, [canViewEmployees]);

    // Without employee:view the lead is assigned to the current user.
    const employeeList = canViewEmployees
        ? employees
        : (user ? [{ id: user.id, name: user.name, role: user.role }] : []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Add New Lead</h1>
                    <p className="text-sm text-gray-500">Capture a new lead enquiry and its property requirement.</p>
                </div>
            </div>

            <div className="max-w-3xl bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
                <LeadForm
                    employees={employeeList}
                    onSuccess={() => router.push("/dashboard/leads")}
                    onCancel={() => router.back()}
                />
            </div>
        </div>
    );
}
