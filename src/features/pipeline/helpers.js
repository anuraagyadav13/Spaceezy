export const SOURCE_OPTIONS = ["Website", "Google Ads", "Meta / Instagram", "Referral", "Walk-in"];

export const CONTACT_CHANNELS = [
    { value: "CALL", label: "Call" },
    { value: "WHATSAPP", label: "WhatsApp" },
    { value: "EMAIL", label: "Email" },
    { value: "MANUAL", label: "Manual note" }
];

export const DATE_PRESETS = [
    { value: "this-month", label: "This month" },
    { value: "last-month", label: "Last month" },
    { value: "7d", label: "Last 7 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "custom", label: "Custom range" }
];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
});

export const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (Number.isNaN(num)) return "—";
    return currencyFormatter.format(num);
};

export const formatCompactCurrency = (value) => {
    const num = Number(value);
    if (!num) return "₹0";
    if (num >= 10000000) return `₹${(num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1)} Cr`;
    if (num >= 100000) return `₹${(num / 100000).toFixed(num % 100000 === 0 ? 0 : 1)} L`;
    if (num >= 1000) return `₹${(num / 1000).toFixed(0)}K`;
    return `₹${num}`;
};

export const formatShortDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export const formatDateTime = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
};

export const formatRelativeTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const diffMs = date.getTime() - Date.now();
    const isFuture = diffMs > 0;
    const absMs = Math.abs(diffMs);
    const minutes = Math.floor(absMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const prefix = isFuture ? "in " : "";
    const suffix = isFuture ? "" : " ago";
    if (minutes < 1) return isFuture ? "now" : "just now";
    if (minutes < 60) return `${prefix}${minutes}m${suffix}`;
    if (hours < 24) return `${prefix}${hours}h${suffix}`;
    if (days < 30) return `${prefix}${days}d${suffix}`;
    return formatShortDate(dateString);
};

const dayStartISO = (year, month, day) => new Date(year, month, day).toISOString();

const parseDayStart = (value) => {
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

export const dateRangeFromPreset = (preset, customFrom, customTo) => {
    const now = new Date();
    switch (preset) {
        case "last-month": {
            const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return { from: firstOfLastMonth.toISOString(), to: firstOfThisMonth.toISOString() };
        }
        case "7d": {
            return {
                from: dayStartISO(now.getFullYear(), now.getMonth(), now.getDate() - 6),
                to: dayStartISO(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            };
        }
        case "90d": {
            return {
                from: dayStartISO(now.getFullYear(), now.getMonth(), now.getDate() - 89),
                to: dayStartISO(now.getFullYear(), now.getMonth(), now.getDate() + 1)
            };
        }
        case "custom": {
            const range = {};
            if (customFrom) range.from = parseDayStart(customFrom).toISOString();
            if (customTo) range.to = dayStartISO(
                parseDayStart(customTo).getFullYear(),
                parseDayStart(customTo).getMonth(),
                parseDayStart(customTo).getDate() + 1
            );
            return range;
        }
        default:
            return {};
    }
};

export const buildPipelineQueryParams = (filters) => {
    const params = {};
    if (filters.search) params.search = filters.search.trim();
    if (filters.projectId) params.projectId = filters.projectId;
    if (filters.source) params.source = filters.source;
    if (filters.assignedTo) params.assignedTo = filters.assignedTo;
    if (filters.stage) params.stage = filters.stage;
    Object.assign(params, dateRangeFromPreset(filters.preset, filters.from, filters.to));
    return params;
};

export const pipelineUrlParams = (filters) => {
    const params = new URLSearchParams();
    if (filters.preset && filters.preset !== "this-month") params.set("preset", filters.preset);
    if (filters.search) params.set("search", filters.search);
    if (filters.projectId) params.set("projectId", filters.projectId);
    if (filters.source) params.set("source", filters.source);
    if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);
    if (filters.stage) params.set("stage", filters.stage);
    if (filters.preset === "custom") {
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
    }
    return params;
};

export const filtersFromSearchParams = (searchParams) => ({
    search: searchParams.get("search") || "",
    preset: searchParams.get("preset") || "this-month",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
    projectId: searchParams.get("projectId") || "",
    source: searchParams.get("source") || "",
    assignedTo: searchParams.get("assignedTo") || "",
    stage: searchParams.get("stage") || ""
});
