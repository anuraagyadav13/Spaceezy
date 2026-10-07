"use client";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadById } from "../../../../../lib/api/leads";
import { fetchUsers } from "../../../../../lib/api/users";
import { usePermissions } from "../../../../../features/auth/hooks/usePermissions";
import { useAuth } from "../../../../../features/auth/hooks/useAuth";
import LeadForm from "../../../../../features/leads/components/LeadForm";

export default function EditLeadPage() {
    const router = useRouter();
    const params = useParams();
    const { hasPermission } = usePermissions();
    const { user } = useAuth();
    const canViewEmployees = hasPermission("employee:view");

    const {
        data: lead,
        isLoading,
        isError,
        error
    } = useQuery({
        queryKey: ["lead", params.id],
        queryFn: () => fetchLeadById(params.id),
        retry: 1
    });

    const {
        data: usersData,
        isLoading: usersLoading
    } = useQuery({
        queryKey: ["users", "lead-edit-options"],
        queryFn: () => fetchUsers({ limit: 50 }),
        enabled: canViewEmployees,
        staleTime: 5 * 60 * 1000,
        retry: 1
    });

    if (isLoading || (canViewEmployees && usersLoading)) {
        return <div className="p-8 text-center text-gray-500">Loading lead...</div>;
    }

    if (isError || !lead) {
        const status = error?.status;
        return (
            <div className="p-8 text-center">
                <p className="text-gray-700 font-bold mb-2">
                    {status === 404 ? "Lead not found" : "Failed to load this lead"}
                </p>
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 text-sm font-bold text-purple-600 hover:bg-purple-50 rounded-xl"
                >
                    Go back
                </button>
            </div>
        );
    }

    const users = usersData?.users || usersData || [];
    const employeeList = canViewEmployees
        ? (Array.isArray(users) ? users : [])
        : (user ? [{ id: user.id, name: user.name, role: user.role }] : []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-50/50 p-6 sm:p-8 space-y-6 custom-scrollbar overflow-y-auto">
            <div className="flex items-center gap-3">
                <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-400 hover:bg-gray-100 rounded-xl">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Edit Lead</h1>
                    <p className="text-sm text-gray-500">
                        Update contact details, assignment and the property requirement for {lead.name}.
                    </p>
                </div>
            </div>

            <div className="max-w-3xl bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-sm">
                <LeadForm
                    lead={lead}
                    employees={employeeList}
                    onSuccess={() => router.push(`/dashboard/leads/${params.id}`)}
                    onCancel={() => router.back()}
                />
            </div>
        </div>
    );
}
