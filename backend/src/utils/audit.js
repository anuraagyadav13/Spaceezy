const prisma = require('../db/prisma');

// Lightweight audit trail for sensitive actions. Never logs passwords,
// API secrets, webhook secrets or raw message bodies.
const audit = async (organizationId, actorId, action, entityType = null, entityId = null, metadata = null) => {
    try {
        await prisma.auditLog.create({
            data: { organizationId, actorId: actorId || null, action, entityType, entityId, metadata }
        });
    } catch (err) {
        // Auditing must never break the primary flow.
        console.error('[audit] failed to write audit log:', err.message);
    }
};

const AUDIT_ACTIONS = {
    CALL_INITIATED: 'call.initiated',
    CALL_ENDED: 'call.ended',
    PII_VIEWED: 'pii.viewed',
    RECORDING_ACCESSED: 'recording.accessed',
    RECORDING_DOWNLOADED: 'recording.downloaded',
    FOLLOWUP_RESCHEDULED: 'followup.rescheduled',
    FOLLOWUP_CHANGED: 'followup.changed',
    ASSIGNMENT_CHANGED: 'assignment.changed',
    WHATSAPP_SENT: 'whatsapp.sent',
    WHATSAPP_INBOUND: 'whatsapp.inbound',
    WHATSAPP_SETTINGS_UPDATED: 'whatsapp.settings_updated',
    WHATSAPP_SECRET_ROTATED: 'whatsapp.secret_rotated',
    WHATSAPP_SECRET_REMOVED: 'whatsapp.secret_removed',
    WHATSAPP_CONVERSATION_ASSIGNED: 'whatsapp.conversation_assigned',
    WHATSAPP_CONVERSATION_STATUS: 'whatsapp.conversation_status',
    WHATSAPP_CONNECTION_TESTED: 'whatsapp.connection_tested',
    WHATSAPP_EMBEDDED_SIGNUP: 'whatsapp.embedded_signup',
    WHATSAPP_NOTIFY_TEST: 'whatsapp.notify_test',
    META_LEAD_SYNC: 'meta.lead_sync',
    META_SETTINGS_UPDATED: 'meta.settings_updated',
    META_OAUTH_CONNECTED: 'meta.oauth_connected',
    META_ASSETS_SYNCED: 'meta.assets_synced',
    META_SECRET_ROTATED: 'meta.secret_rotated',
    META_SECRET_REMOVED: 'meta.secret_removed',
    META_CONNECTION_TESTED: 'meta.connection_tested',
    META_LEAD_FORMS_UPDATED: 'meta.lead_forms_updated',
    META_LEAD_MAPPING_UPDATED: 'meta.lead_mapping_updated',
    META_LEADS_BACKFILLED: 'meta.leads_backfilled',
    META_LEAD_SYNC_RETRIED: 'meta.lead_sync_retried',
    // Phase 3+4 — campaign / ad set / audience management. Status changes
    // get their own action so activation events are greppable in the audit
    // trail (activation is the only path that can start ad spend).
    // Phase 5 — creative library, ads and previews.
    META_MEDIA_UPLOADED: 'meta.media_uploaded',
    META_MEDIA_DELETED: 'meta.media_deleted',
    META_CREATIVE_CREATED: 'meta.creative_created',
    META_CREATIVE_UPDATED: 'meta.creative_updated',
    META_CREATIVE_DELETED: 'meta.creative_deleted',
    META_AD_CREATED: 'meta.ad_created',
    META_AD_UPDATED: 'meta.ad_updated',
    META_AD_STATUS: 'meta.ad_status',
    META_AD_DUPLICATED: 'meta.ad_duplicated',
    META_AD_DELETED: 'meta.ad_deleted',
    META_CAMPAIGN_CREATED: 'meta.campaign_created',
    META_CAMPAIGN_UPDATED: 'meta.campaign_updated',
    META_CAMPAIGN_STATUS: 'meta.campaign_status',
    META_ADSET_CREATED: 'meta.adset_created',
    META_ADSET_UPDATED: 'meta.adset_updated',
    META_ADSET_STATUS: 'meta.adset_status',
    META_AUDIENCE_CREATED: 'meta.audience_created',
    META_AUDIENCE_UPDATED: 'meta.audience_updated',
    META_AUDIENCE_DELETED: 'meta.audience_deleted',
    PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
    PASSWORD_RESET: 'auth.password_reset'
};

module.exports = { audit, AUDIT_ACTIONS };
