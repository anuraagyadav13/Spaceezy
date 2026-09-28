import { getLeads, addLead, updateLeadStage, getLeadsByEmployee } from "../store";

// Temporary implementation using local storage store
// Once backend is ready, this will use apiClient

export const fetchLeads = async () => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    return getLeads();
};

export const fetchEmployeeLeads = async (employeeId) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return getLeadsByEmployee(employeeId);
};

export const createLead = async (data) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    addLead(data);
    return data;
};

export const updateLeadStatus = async ({ id, status }) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    updateLeadStage(id, status);
    return { id, status };
};
