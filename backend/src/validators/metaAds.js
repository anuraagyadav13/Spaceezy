const { z } = require('zod');

const DATE_PRESETS = [
    'today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'last_90d',
    'this_month', 'last_month', 'this_quarter', 'lifetime', 'last_year',
];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const listAdAccountsSchema = {
    query: z.object({
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

const listCampaignsSchema = {
    query: z.object({
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }),
};

const insightsQuerySchema = {
    query: z.object({
        level: z.enum(['campaign', 'adset', 'ad']).optional(),
        adAccountId: z.string().regex(/^\d+$/, 'must be a numeric ad account ID').optional(),
        campaignIds: z.string().regex(/^[\d,]+$/, 'must be comma-separated numeric IDs').optional(),
        datePreset: z.enum(DATE_PRESETS).optional(),
        since: isoDate.optional(),
        until: isoDate.optional(),
        limit: z.string().regex(/^\d+$/).optional(),
        after: z.string().max(500).optional(),
    }).superRefine((q, ctx) => {
        if (q.datePreset && (q.since || q.until)) {
            ctx.addIssue({ code: 'custom', path: ['datePreset'], message: 'datePreset cannot be combined with since/until' });
        }
        if (!q.datePreset && !q.since && !q.until) {
            ctx.addIssue({ code: 'custom', path: ['datePreset'], message: 'datePreset or since/until is required' });
        }
        if ((q.since && !q.until) || (!q.since && q.until)) {
            ctx.addIssue({ code: 'custom', path: ['until'], message: 'since and until are required together' });
        }
        if (q.since && q.until && q.since > q.until) {
            ctx.addIssue({ code: 'custom', path: ['since'], message: 'since must not be after until' });
        }
    }),
};

module.exports = {
    listAdAccountsSchema,
    listCampaignsSchema,
    insightsQuerySchema,
};
