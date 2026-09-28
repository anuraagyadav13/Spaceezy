import { useQuery } from "@tanstack/react-query";
import { fetchLeads, fetchEmployeeLeads } from "../../../lib/api/leads";
import { getCurrentEmployeeId, getRole, ROLES } from "../../../lib/auth";

export const useLeads = () => {
    const role = getRole();
    const employeeId = getCurrentEmployeeId();

    return useQuery({
        queryKey: ["leads", role, employeeId],
        queryFn: () => {
            if (role === ROLES.EMPLOYEE && employeeId) {
                return fetchEmployeeLeads(employeeId);
            }
            return fetchLeads();
        },
    });
};
