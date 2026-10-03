import { useQuery } from "@tanstack/react-query";
import { fetchLeads, fetchEmployeeLeads } from "../../../lib/api/leads";
import { useAuth } from "../auth/hooks/useAuth";

export const useLeads = () => {
    const { user } = useAuth();
    const normalizedRole = String(user?.role ?? "").toUpperCase();
    const isEmployeeRole = ["SALES_MANAGER", "SALES_EXECUTIVE", "CHANNEL_PARTNER"].includes(normalizedRole);
    const employeeId = isEmployeeRole ? user?.id : null;

    return useQuery({
        queryKey: ["leads", normalizedRole, employeeId],
        queryFn: () => {
            if (isEmployeeRole && employeeId) {
                return fetchEmployeeLeads(employeeId);
            }
            return fetchLeads();
        },
    });
};
