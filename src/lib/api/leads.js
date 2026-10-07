import apiClient from "./client";

const unwrapList = (payload, listKey) => payload?.[listKey] ?? payload;

export const fetchLeads = async (params = {}) => {
    const response = await apiClient.get('/leads', { params });
    return unwrapList(response, 'leads');
};

// Full paginated envelope ({ leads, total, pages }) for counts/stats.
export const fetchLeadsPage = async (params = {}) => {
    const response = await apiClient.get('/leads', { params });
    return response;
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

    const response = await apiClient.post('/leads', payload);
    return response;
};

export const updateLeadStatus = async ({ id, status, ...data }) => {
    const response = await apiClient.patch(`/leads/${id}`, { status, ...data });
    return response;
};

// Full lead edit (contact details, assignment, project refs + requirement).
export const updateLead = async ({ id, ...data }) => {
    const response = await apiClient.patch(`/leads/${id}`, data);
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

// Authoritative WhatsApp proposal message built from database values
// (project, configuration, tower, unit, area, location, price, availability).
export const buildPropertyProposal = async (leadId, propertyIds) => {
    const response = await apiClient.post(`/leads/${leadId}/proposal`, { propertyIds });
    return response; // { body, unitCount }
};

// Public property share: server builds the WhatsApp message including the
// unit's public URL. Rejects with 409 PROPERTY_NOT_PUBLISHED when the unit or
// its project is not published on the public website.
export const sharePropertyOnWhatsApp = async (leadId, propertyId) => {
    const response = await apiClient.post(`/leads/${leadId}/property-share`, { propertyId });
    return response; // { body, publicUrl, publicToken, property }
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

// --- Pipeline aggregate ---

export const fetchPipelineDashboard = async (params = {}) => {
    const cleanParams = {};
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            cleanParams[key] = value;
        }
    });
    const response = await apiClient.get('/leads/pipeline', { params: cleanParams });
    return response;
};

// --- Self-claim (SALES_EXECUTIVE only) ---

export const fetchClaimableLeads = async (params = {}) => {
    const cleanParams = {};
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            cleanParams[key] = value;
        }
    });
    const response = await apiClient.get('/leads/claimable', { params: cleanParams });
    return response;
};

export const claimLead = async (id) => {
    const response = await apiClient.post(`/leads/${id}/claim`);
    return response;
};

// --- Stage transitions & lead actions ---

export const transitionLeadStage = async ({ id, target, ...payload }) => {
    const response = await apiClient.post(`/leads/${id}/stage`, { target, ...payload });
    return response;
};

export const logLeadContact = async ({ id, ...data }) => {
    const response = await apiClient.post(`/leads/${id}/contact`, data);
    return response;
};

export const scheduleLeadFollowUp = async ({ id, ...data }) => {
    const response = await apiClient.post(`/leads/${id}/follow-ups`, data);
    return response;
};

export const createLeadBooking = async ({ id, ...data }) => {
    const response = await apiClient.post(`/leads/${id}/bookings`, data);
    return response;
};
