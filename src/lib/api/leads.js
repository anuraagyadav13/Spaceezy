import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchLeads = async (params = {}) => {
    const response = await apiClient.get('/leads', { params });
    return unwrapList(response, 'leads');
};

export const fetchLeadById = async (id) => {
    const response = await apiClient.get(`/leads/${id}`);
    return response;
};

// No need for separate employee leads endpoint since the backend scopes based on the role
export const fetchEmployeeLeads = async () => {
    const response = await apiClient.get('/leads');
    return unwrapList(response, 'leads');
};

export const createLead = async (data = {}) => {
    const payload = { ...data };

    const assignedToValue = typeof payload.assignedTo === 'string' ? payload.assignedTo.trim() : payload.assignedTo;
    const assignedToIdValue = typeof payload.assignedToId === 'string' ? payload.assignedToId.trim() : payload.assignedToId;
    const finalAssignedToId = (assignedToIdValue || assignedToValue || '').trim();

    if (finalAssignedToId) {
        payload.assignedToId = finalAssignedToId;
    } else {
        delete payload.assignedToId;
    }

    delete payload.assignedTo;

    if (payload.stage && !payload.status) {
        payload.status = payload.stage;
    }

    delete payload.stage;
    delete payload.project;
    delete payload.budget;

    const response = await apiClient.post('/leads', payload);
    return response;
};

export const updateLeadStatus = async ({ id, status, ...data }) => {
    const response = await apiClient.patch(`/leads/${id}`, { status, ...data });
    return response;
};

export const deleteLead = async (id) => {
    const response = await apiClient.delete(`/leads/${id}`);
    return response;
};

// --- Matching ---

export const fetchMatchingProperties = async (leadId) => {
    const response = await apiClient.get(`/leads/${leadId}/matching`);
    return response;
};

export const addInterestedProperty = async (leadId, propertyId) => {
    const response = await apiClient.post(`/leads/${leadId}/interested-properties`, { propertyId });
    return response;
};

export const removeInterestedProperty = async (leadId, propertyId) => {
    const response = await apiClient.delete(`/leads/${leadId}/interested-properties/${propertyId}`);
    return response;
};

// --- Follow-ups ---

export const fetchFollowups = async (params = {}) => {
    const response = await apiClient.get('/leads/follow-ups', { params });
    return response;
};

export const toggleFollowupStatus = async (id) => {
    const response = await apiClient.patch(`/leads/follow-ups/${id}/toggle`);
    return response;
};

// --- Activities ---

export const fetchLeadActivities = async (params = {}) => {
    const response = await apiClient.get('/leads/activities', { params });
    return response;
};

// --- Bulk assign ---

export const bulkAssignLeads = async (leadIds, assignedToId) => {
    const response = await apiClient.patch('/leads/bulk-assign', { leadIds, assignedToId });
    return response;
};

// --- Duplicates ---

export const fetchDuplicates = async (params = {}) => {
    const response = await apiClient.get('/leads/duplicates', { params });
    return response;
};

export const mergeLeads = async (survivorId, duplicateLeadId) => {
    const response = await apiClient.post(`/leads/${survivorId}/merge`, { duplicateLeadId });
    return response;
};
