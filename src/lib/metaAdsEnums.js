// src/lib/metaAdsEnums.js
// Phase 3+4 — Meta campaign / ad set / audience form vocabulary.
//
// The enum arrays mirror GET /meta-ads/options (which serves them straight
// from the backend validators, the single source of truth). Pages pass the
// server payload as `initialData` to useQuery and fall back to these copies
// so a first render never offers a value the API would reject. They contain
// only creation-valid Marketing API values — no invented parameters.

// Exact Phase 2.5A disconnected copy — do not reword (contract string).
export const META_DISCONNECTED_MESSAGE =
    "Meta account not connected — configure Meta App credentials to enable live integration.";

// Connected-state honesty note: everything on screen comes from Meta.
export const META_LIVE_DATA_NOTE =
    "Live data from the Meta Marketing API — no sample campaigns or audiences are shown.";

// Status reasons that mean "no usable Meta connection" — the ONLY reasons
// that disable discovery queries. NO_AD_ACCOUNT_SELECTED and
// PERMISSION_DENIED still carry a usable token, so Pages / Ad accounts /
// Instagram discovery runs and reports Meta's answer honestly instead of
// being silently switched off (the old circular gate: discovery required
// an ad-account selection that discovery itself was supposed to produce).
export const META_DISCOVERY_BLOCKED_REASONS = ["MISSING_CONFIG", "TOKEN_EXPIRED", "META_TOKEN_INVALID"];

export const isMetaDiscoveryEnabled = (statusData, canView) =>
    Boolean(
        canView &&
            statusData &&
            !statusData.tokenExpired &&
            !META_DISCOVERY_BLOCKED_REASONS.includes(statusData.reason)
    );

export const CAMPAIGN_OBJECTIVES = [
    "APP_INSTALLS", "BRAND_AWARENESS", "CONVERSIONS", "EVENT_RESPONSES",
    "LEAD_GENERATION", "LINK_CLICKS", "LOCAL_AWARENESS", "MESSAGES",
    "OFFER_CLAIMS", "OUTCOME_APP_PROMOTION", "OUTCOME_AWARENESS",
    "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC",
    "PAGE_LIKES", "POST_ENGAGEMENT", "PRODUCT_CATALOG_SALES", "REACH",
    "STORE_VISITS", "VIDEO_VIEWS",
];

export const OBJECTIVE_LABELS = {
    APP_INSTALLS: "App installs",
    BRAND_AWARENESS: "Brand awareness",
    CONVERSIONS: "Conversions",
    EVENT_RESPONSES: "Event responses",
    LEAD_GENERATION: "Lead generation (legacy)",
    LINK_CLICKS: "Link clicks (legacy)",
    LOCAL_AWARENESS: "Local awareness",
    MESSAGES: "Messages",
    OFFER_CLAIMS: "Offer claims",
    OUTCOME_APP_PROMOTION: "App promotion",
    OUTCOME_AWARENESS: "Awareness",
    OUTCOME_ENGAGEMENT: "Engagement",
    OUTCOME_LEADS: "Leads",
    OUTCOME_SALES: "Sales",
    OUTCOME_TRAFFIC: "Traffic",
    PAGE_LIKES: "Page likes (legacy)",
    POST_ENGAGEMENT: "Post engagement (legacy)",
    PRODUCT_CATALOG_SALES: "Product catalog sales (legacy)",
    REACH: "Reach (legacy)",
    STORE_VISITS: "Store visits (legacy)",
    VIDEO_VIEWS: "Video views (legacy)",
};

export const SPECIAL_AD_CATEGORIES = [
    "NONE", "EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS",
    "ONLINE_GAMBLING_AND_GAMING", "FINANCIAL_PRODUCTS_SERVICES",
];

export const SPECIAL_AD_CATEGORY_LABELS = {
    NONE: "None",
    EMPLOYMENT: "Employment",
    HOUSING: "Housing",
    CREDIT: "Credit",
    ISSUES_ELECTIONS_POLITICS: "Issues, elections or politics",
    ONLINE_GAMBLING_AND_GAMING: "Online gambling and gaming",
    FINANCIAL_PRODUCTS_SERVICES: "Financial products and services",
};

// billing_event minus deprecated CLICKS and read-only NONE.
export const BILLING_EVENTS = [
    "APP_INSTALLS", "IMPRESSIONS", "LINK_CLICKS", "OFFER_CLAIMS", "PAGE_LIKES",
    "POST_ENGAGEMENT", "PURCHASE", "LISTING_INTERACTION", "THRUPLAY",
];

export const BILLING_EVENT_LABELS = {
    APP_INSTALLS: "App installs",
    IMPRESSIONS: "Impressions",
    LINK_CLICKS: "Link clicks",
    OFFER_CLAIMS: "Offer claims",
    PAGE_LIKES: "Page likes",
    POST_ENGAGEMENT: "Post engagement",
    PURCHASE: "Purchases",
    LISTING_INTERACTION: "Listing interactions",
    THRUPLAY: "ThruPlay video views",
};

// optimization_goal minus read-only NONE / deprecated CLICKS.
export const OPTIMIZATION_GOALS = [
    "AD_RECALL_LIFT", "APP_INSTALLS", "CONVERSATIONS", "ENGAGED_USERS",
    "EVENT_RESPONSES", "IMPRESSIONS", "LANDING_PAGE_VIEWS", "LEAD_GENERATION",
    "LINK_CLICKS", "OFFSITE_CONVERSIONS", "PAGE_LIKES", "POST_ENGAGEMENT",
    "QUALITY_LEAD", "REACH", "THRUPLAY", "VALUE",
];

export const OPTIMIZATION_GOAL_LABELS = {
    AD_RECALL_LIFT: "Ad recall lift",
    APP_INSTALLS: "App installs",
    CONVERSATIONS: "Conversations",
    ENGAGED_USERS: "Engaged users",
    EVENT_RESPONSES: "Event responses",
    IMPRESSIONS: "Impressions",
    LANDING_PAGE_VIEWS: "Landing page views",
    LEAD_GENERATION: "Lead generation",
    LINK_CLICKS: "Link clicks",
    OFFSITE_CONVERSIONS: "Offsite conversions",
    PAGE_LIKES: "Page likes",
    POST_ENGAGEMENT: "Post engagement",
    QUALITY_LEAD: "Quality lead",
    REACH: "Reach",
    THRUPLAY: "ThruPlay video views",
    VALUE: "Purchase value",
};

export const PUBLISHER_PLATFORMS = ["facebook", "instagram", "threads", "messenger", "audience_network"];
export const DEVICE_PLATFORMS = ["mobile", "desktop"];

export const FACEBOOK_POSITIONS = [
    "feed", "right_hand_column", "marketplace", "video_feeds", "story", "search",
    "instream_video", "facebook_reels", "facebook_reels_overlay", "profile_feed", "notification",
];
export const INSTAGRAM_POSITIONS = [
    "stream", "story", "explore", "explore_home", "reels", "profile_feed",
    "ig_search", "profile_reels",
];

export const PLATFORM_LABELS = {
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads",
    messenger: "Messenger",
    audience_network: "Audience Network",
};

// Human labels for the placement values the wizard exposes as checkboxes.
export const POSITION_LABELS = {
    feed: "Feed",
    right_hand_column: "Right column",
    marketplace: "Marketplace",
    video_feeds: "Video feeds",
    story: "Stories",
    search: "Search",
    instream_video: "In-stream video",
    facebook_reels: "Facebook Reels",
    facebook_reels_overlay: "Reels overlay",
    profile_feed: "Profile feed",
    notification: "Notifications",
    stream: "Stream",
    explore: "Explore",
    explore_home: "Explore home",
    reels: "Reels",
    ig_search: "Instagram search",
    profile_reels: "Profile Reels",
};

export const GENDER_OPTIONS = [
    { value: "", label: "All genders" },
    { value: "1", label: "Male" },
    { value: "2", label: "Female" },
];

// Meta currency subunits (paise for INR). Every budget input on this UI is
// major units; the API contract is minor units — always convert with
// toMinorUnits before sending and fromMinorUnits when displaying.
export const toMinorUnits = (value) => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (raw === "") return null;
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const [whole, fraction = ""] = raw.split(".");
    const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
    return Number.isSafeInteger(minor) ? minor : null;
};

export const fromMinorUnits = (minor) => {
    if (minor === null || minor === undefined || minor === "") return null;
    const value = Number(minor);
    if (!Number.isFinite(value)) return null;
    return value / 100;
};

// Display helper for a Meta subunit amount: 500000 → "₹5,000.00".
export const formatMinor = (minor) => {
    const major = fromMinorUnits(minor);
    if (major === null) return "—";
    return `₹${major.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// "IN, us" → ["IN", "US"]; invalid tokens are dropped, never guessed.
export const parseCountryCodes = (input) => {
    const tokens = Array.isArray(input) ? input : String(input || "").split(/[\s,;]+/);
    const seen = new Set();
    const codes = [];
    for (const token of tokens) {
        const code = String(token || "").trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(code) && !seen.has(code)) {
            seen.add(code);
            codes.push(code);
        }
    }
    return codes;
};

// Server-shaped targeting input → Meta's targeting spec. Used for the
// wizard's review preview (the backend rebuilds the authoritative payload;
// this keeps the review honest about what will be sent).
export const buildTargetingPayload = (form = {}) => {
    const targeting = { geo_locations: { countries: parseCountryCodes(form.countries) } };
    if (form.ageMin) targeting.age_min = Number(form.ageMin);
    if (form.ageMax) targeting.age_max = Number(form.ageMax);
    if (form.gender) targeting.genders = [Number(form.gender)];
    if (Array.isArray(form.customAudiences) && form.customAudiences.length > 0) {
        targeting.custom_audiences = form.customAudiences.map((id) => ({ id: String(id) }));
    }
    if (Array.isArray(form.excludedCustomAudiences) && form.excludedCustomAudiences.length > 0) {
        targeting.excluded_custom_audiences = form.excludedCustomAudiences.map((id) => ({ id: String(id) }));
    }
    if (Array.isArray(form.publisherPlatforms) && form.publisherPlatforms.length > 0) {
        targeting.publisher_platforms = [...form.publisherPlatforms];
    }
    if (Array.isArray(form.devicePlatforms) && form.devicePlatforms.length > 0) {
        targeting.device_platforms = [...form.devicePlatforms];
    }
    if (Array.isArray(form.facebookPositions) && form.facebookPositions.length > 0) {
        targeting.facebook_positions = [...form.facebookPositions];
    }
    if (Array.isArray(form.instagramPositions) && form.instagramPositions.length > 0) {
        targeting.instagram_positions = [...form.instagramPositions];
    }
    return targeting;
};

// Status badge styling keyed by Meta's effective_status (falls back to
// status). Unknown values render neutrally — never invent a meaning.
export const statusBadgeClass = (status) => {
    switch (String(status || "").toUpperCase()) {
        case "ACTIVE":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case "PAUSED":
            return "bg-amber-50 text-amber-700 border-amber-200";
        case "DELETED":
            return "bg-red-50 text-red-700 border-red-200";
        case "ARCHIVED":
            return "bg-gray-100 text-gray-600 border-gray-200";
        case "PENDING_REVIEW":
        case "PENDING_BILLING_INFO":
        case "WITH_ISSUES":
            return "bg-blue-50 text-blue-700 border-blue-200";
        default:
            return "bg-gray-50 text-gray-500 border-gray-200";
    }
};

export const statusLabel = (status) => {
    const raw = String(status || "");
    if (!raw) return "Unknown";
    return raw
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};

// ---------------------------------------------------------------------------
// Phase 5 — creative library vocabulary. These mirror GET /meta-ads/options
// (served straight from the backend validators, the single source of truth);
// pages pass the server payload as `initialData` and fall back to these
// copies so a first render never offers a value the API would reject.
// ---------------------------------------------------------------------------

export const CTA_TYPES = [
    "APPLY_NOW", "BOOK_NOW", "BUY", "CALL_NOW", "CHAT_NOW", "CONTACT_US",
    "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "MESSAGE_PAGE", "ORDER_NOW",
    "SHOP_NOW", "SIGN_UP", "SUBSCRIBE", "WATCH_MORE",
];

// Button labels a real-estate advertiser recognises (Meta renders these on
// the ad itself — the label set is display copy, not an API contract).
export const CTA_LABELS = {
    APPLY_NOW: "Apply Now",
    BOOK_NOW: "Book Now",
    BUY: "Buy",
    CALL_NOW: "Call Now",
    CHAT_NOW: "Chat Now",
    CONTACT_US: "Contact Us",
    DOWNLOAD: "Download",
    GET_QUOTE: "Get a Quote",
    LEARN_MORE: "Learn More",
    MESSAGE_PAGE: "Message Page",
    ORDER_NOW: "Order Now",
    SHOP_NOW: "Shop Now",
    SIGN_UP: "Sign Up",
    SUBSCRIBE: "Subscribe",
    WATCH_MORE: "Watch More",
};

// Recommended creative copy limits (documented Meta creative caps). The
// backend enforces them server-side; the editor shows live counters.
export const CREATIVE_LIMITS = {
    message: 90,
    headline: 25,
    description: 300,
    name: 100,
    url: 1000,
};

export const AD_FORMATS = [
    "DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "RIGHT_COLUMN_STANDARD",
    "INSTAGRAM_STANDARD", "INSTAGRAM_STORY", "INSTAGRAM_REELS",
    "FACEBOOK_STORY_MOBILE", "FACEBOOK_REELS_MOBILE",
];

// Mirrors the backend PREVIEW_FORMAT_INFO — label + compatibility class.
// `documented` formats appear in Meta's page-post compatibility list;
// `extended` formats are valid enum values accepted for other ad types and
// are surfaced behind an explicit toggle in the preview screen.
export const PREVIEW_FORMAT_INFO = [
    { format: "DESKTOP_FEED_STANDARD", label: "Facebook Feed (desktop)", compatibility: "documented" },
    { format: "MOBILE_FEED_STANDARD", label: "Facebook Feed (mobile)", compatibility: "documented" },
    { format: "INSTAGRAM_STANDARD", label: "Instagram Feed", compatibility: "documented" },
    { format: "INSTAGRAM_STORY", label: "Instagram Story", compatibility: "documented" },
    { format: "RIGHT_COLUMN_STANDARD", label: "Facebook Right Column", compatibility: "documented" },
    { format: "FACEBOOK_STORY_MOBILE", label: "Facebook Story", compatibility: "extended" },
    { format: "INSTAGRAM_REELS", label: "Instagram Reels", compatibility: "extended" },
    { format: "FACEBOOK_REELS_MOBILE", label: "Facebook Reels", compatibility: "extended" },
];

export const PREVIEW_FORMAT_LABELS = PREVIEW_FORMAT_INFO.reduce(
    (acc, entry) => ({ ...acc, [entry.format]: entry.label }),
    {}
);

// Documented upload gates — mirrored from the backend validators so the
// picker can reject a file before a wasted round-trip.
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/gif"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// Meta preview responses carry provider iframe HTML (valid 24 h). The UI
// NEVER injects that HTML — it extracts the iframe src and renders a
// sandboxed <iframe>. Anything that is not a well-formed http(s) URL
// yields null (shown as an honest "preview unavailable" state).
export const extractPreviewFrameSrc = (html) => {
    if (typeof html !== "string" || html === "") return null;
    const match = html.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
    if (!match) return null;
    try {
        const url = new URL(match[1]);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url.toString();
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// Phase 6 — analytics presentation helpers. Every formatter is null-safe:
// unknown (null) metrics render as "—" and are never coerced to zero.
// ---------------------------------------------------------------------------

// Meta Insights returns money in MAJOR units of the account currency
// (e.g. "1500.5"), unlike budgets/bids (minor units). INR renders with ₹;
// any other account currency renders as "1,234.56 CUR".
export const formatMoney = (value, currency) => {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    const code = String(currency || "INR").toUpperCase();
    const symbol = code === "INR" ? "₹" : "";
    const suffix = symbol ? "" : ` ${code}`;
    return `${symbol}${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
};

export const formatMetricNumber = (value, maxFractionDigits = 0) => {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return num.toLocaleString("en-IN", { maximumFractionDigits: maxFractionDigits });
};

// Metrics already arrive as percentages (ctr is clicks/impressions × 100).
export const formatPercent = (value, digits = 2) => {
    if (value === null || value === undefined || value === "") return "—";
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return `${num.toFixed(digits)}%`;
};

// Cost-per-X helpers: null denominators stay "—" (never ₹0.00).
export const formatCost = (value, currency) => formatMoney(value, currency);

export const ANALYTICS_DATE_PRESETS = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last_7d", label: "Last 7 days" },
    { value: "last_14d", label: "Last 14 days" },
    { value: "last_30d", label: "Last 30 days" },
    { value: "last_90d", label: "Last 90 days" },
    { value: "this_month", label: "This month" },
    { value: "last_month", label: "Last month" },
    { value: "this_quarter", label: "This quarter" },
    { value: "last_year", label: "Last year" },
    { value: "lifetime", label: "All time" },
];

// Advisory recommendations — plain-language labels for the six engine
// types. The response itself carries automated:false + the disclaimer.
export const RECOMMENDATION_SEVERITY_LABELS = {
    warning: "Needs attention",
    opportunity: "Opportunity",
};

export const RECOMMENDATION_TYPE_LABELS = {
    SPEND_WITHOUT_LEADS: "Spending without leads",
    ABOVE_MEDIAN_COST_PER_LEAD: "Cost per lead above average",
    LOW_ENGAGEMENT: "Low engagement",
    BUDGET_INCREASE_CANDIDATE: "Strong performer",
    HIGH_PERFORMING_CREATIVE: "Top creative",
    LOW_PERFORMING_CREATIVE: "Weak creative",
};

// Human labels for the analytics performance levels.
export const PERFORMANCE_LEVEL_LABELS = {
    account: "Account",
    campaign: "Campaigns",
    adset: "Ad sets",
    ad: "Advertisements",
};

// Small shared date helper: YYYY-MM-DD for the date inputs.
export const isoDay = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
};
