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
    PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
    PASSWORD_RESET: 'auth.password_reset'
};

module.exports = { audit, AUDIT_ACTIONS };
