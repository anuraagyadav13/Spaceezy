import apiClient from "./client";

export const fetchMetaStatus = async () => {
    const response = await apiClient.get("/meta-ads/status");
    return response;
};

export const fetchMetaAdAccounts = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/ad-accounts", { params });
    return response;
};

export const fetchMetaCampaigns = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/campaigns", { params });
    return response;
};

export const fetchMetaInsights = async (params = {}) => {
    const response = await apiClient.get("/meta-ads/insights", { params });
    return response;
};

// Join campaign rows with level=campaign insight rows. Unknown metrics stay
// null (rendered as "—"); they are never coerced to zero.
export const mergeCampaignStats = (campaigns = [], insightRows = []) => {
    const byId = new Map();
    for (const row of insightRows || []) {
        if (row && row.campaignId) byId.set(String(row.campaignId), row);
    }
    return (campaigns || []).map((campaign) => {
        const stats = byId.get(String(campaign.id)) || null;
        return { campaign, stats };
    });
};

// Aggregate insight rows into KPI totals. A total is null when every
// contributing value is unknown (never 0-for-unknown).
export const sumInsights = (rows = []) => {
    const pick = (key) => (rows || []).map((r) => (r ? r[key] : null)).filter((v) => v !== null && v !== undefined);
    const sum = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0));
    const spendValues = pick("spend");
    const leadValues = pick("leads");
    const spend = sum(spendValues);
    const leads = sum(leadValues);
    return {
        spend,
        impressions: sum(pick("impressions")),
        reach: sum(pick("reach")),
        clicks: sum(pick("clicks")),
        leads,
        costPerLead: spend !== null && leads ? spend / leads : null,
    };
};

export const DATE_PRESETS = [
    { value: "last_7d", label: "Last 7 days" },
    { value: "last_14d", label: "Last 14 days" },
    { value: "last_30d", label: "Last 30 days" },
    { value: "last_90d", label: "Last 90 days" },
];

export const CAMPAIGN_STATUSES = [
    { value: "", label: "All statuses" },
    { value: "ACTIVE", label: "Active" },
    { value: "PAUSED", label: "Paused" },
    { value: "ARCHIVED", label: "Archived" },
];
