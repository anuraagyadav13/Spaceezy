const { asyncHandler, AppError } = require('../utils/errors');
const WhatsAppService = require('../services/whatsappService');
const WhatsappSettingsService = require('../services/whatsappSettingsService');
const WhatsappNotifyService = require('../services/whatsappNotifyService');
const WhatsappTemplateService = require('../services/whatsappTemplateService');

// Meta template endpoints must work even when providerMode is still 'mock'
// (admins sync/review templates before going live), so they read the saved
// credentials directly instead of the resolved send transport.
const metaCredentials = async (organizationId) => {
    const effective = await WhatsappSettingsService.getEffectiveConfig(organizationId);
    if (!effective || !effective.accessToken) {
        throw new AppError(
            'Save a Meta access token in Integrations before reading templates.',
            409,
            'WHATSAPP_NOT_CONFIGURED'
        );
    }
    return {
        phoneNumberId: effective.phoneNumberId,
        accessToken: effective.accessToken,
        appSecret: effective.appSecret,
        graphVersion: effective.graphVersion,
        wabaId: effective.wabaId
    };
};

const getStatus = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const data = await WhatsAppService.getStatus(organizationId);
    res.status(200).json({ success: true, data, message: 'WhatsApp status fetched' });
});

const listConversations = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await WhatsAppService.listConversations(organizationId, req.query, role, userId);
    res.status(200).json({ success: true, data, message: 'Conversations fetched successfully' });
});

const createConversation = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const conversation = await WhatsAppService.getOrCreateConversation(req.body.leadId, organizationId, userId, role);
    res.status(201).json({ success: true, data: conversation, message: 'Conversation ready' });
});

const getMessages = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await WhatsAppService.listMessages(req.params.id, organizationId, req.query, role, userId);
    res.status(200).json({ success: true, data: result, message: 'Messages fetched successfully' });
});

const updateConversation = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const conversation = await WhatsAppService.updateConversationStatus(req.params.id, organizationId, userId, role, req.body.status);
    res.status(200).json({ success: true, data: conversation, message: 'Conversation updated successfully' });
});

const assignConversation = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsAppService.assignConversation(req.params.id, organizationId, userId, req.body.assignedToId || null);
    res.status(200).json({ success: true, data, message: data.changed ? 'Conversation assigned' : 'Conversation already assigned' });
});

const markConversationRead = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await WhatsAppService.markConversationRead(req.params.id, organizationId, role, userId);
    res.status(200).json({ success: true, data, message: 'Conversation marked as read' });
});

const sendMessage = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const message = await WhatsAppService.sendMessage(req.params.id, req.body, organizationId, userId, role);
    res.status(201).json({ success: true, data: message, message: 'WhatsApp message sent' });
});

const listTemplates = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const data = await WhatsAppService.listTemplates(organizationId, req.query);
    res.status(200).json({ success: true, data, message: 'Templates fetched successfully' });
});

const listLibrary = asyncHandler(async (req, res) => {
    const data = await WhatsAppService.listLibrary();
    res.status(200).json({ success: true, data, message: 'Template library fetched successfully' });
});

const createTemplate = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const template = await WhatsAppService.createTemplate(req.body, organizationId, userId);
    res.status(201).json({ success: true, data: template, message: 'Template created' });
});

const updateTemplate = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const template = await WhatsAppService.updateTemplate(req.params.id, req.body, organizationId);
    res.status(200).json({ success: true, data: template, message: 'Template updated' });
});

// Approved Meta templates for this WABA. This is the missing link that made
// WhatsApp Manager templates invisible in the CRM dropdown.
const listMetaTemplates = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const credentials = await metaCredentials(organizationId);
    const data = await WhatsappTemplateService.listMetaTemplates(credentials, {
        force: req.query.refresh === 'true'
    });
    res.status(200).json({ success: true, data, message: 'Meta templates fetched successfully' });
});

const importMetaTemplate = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const credentials = await metaCredentials(organizationId);
    const data = await WhatsappTemplateService.importMetaTemplate(
        organizationId, userId, credentials, req.body
    );
    res.status(201).json({ success: true, data, message: 'Template imported from Meta' });
});

const syncMetaTemplates = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const credentials = await metaCredentials(organizationId);
    const data = await WhatsappTemplateService.syncFromMeta(
        organizationId, userId, credentials, { force: true }
    );
    res.status(200).json({
        success: true,
        data,
        message: `Synced ${data.imported} new and ${data.updated} existing template(s) from Meta`
    });
});

const getSettings = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const data = await WhatsappSettingsService.getSettings(organizationId);
    res.status(200).json({ success: true, data, message: 'WhatsApp settings fetched successfully' });
});

const saveSettings = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappSettingsService.saveSettings(organizationId, userId, req.body);
    res.status(200).json({ success: true, data, message: 'WhatsApp settings saved successfully' });
});

const rotateSecret = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappSettingsService.rotateSecret(organizationId, userId, req.body.field, req.body.value);
    res.status(200).json({ success: true, data, message: 'Credential rotated successfully' });
});

const removeSecret = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappSettingsService.removeSecret(organizationId, userId, req.params.field);
    res.status(200).json({ success: true, data, message: 'Credential removed successfully' });
});

const testConnection = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappSettingsService.testConnection(organizationId, userId);
    res.status(200).json({ success: true, data, message: 'Meta connection verified' });
});

const latestNotification = asyncHandler(async (req, res) => {
    const { organizationId } = req.auth;
    const data = await WhatsappNotifyService.latestForOrg(organizationId);
    res.status(200).json({ success: true, data, message: 'Latest notification fetched' });
});

const testNotify = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappNotifyService.testNotify(organizationId, userId, req.body && req.body.recipient);
    res.status(200).json({ success: true, data, message: 'Test notification sent' });
});

// Embedded Signup (Coexistence): exchange Meta's short-lived code for the
// permanent business token, discover the phone_number_id from the WABA and
// store everything encrypted. Service performs no number lifecycle calls;
// responses carry only display-safe fields (never code/token/secret).
const completeEmbeddedSignup = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const data = await WhatsappSettingsService.completeEmbeddedSignup(organizationId, userId, {
        code: req.body.code,
        wabaId: req.body.wabaId,
        phoneNumberId: req.body.phoneNumberId,
        event: req.body.event,
    });
    res.status(200).json({ success: true, data, message: 'WhatsApp Business App connected via Embedded Signup' });
});

module.exports = {
    getStatus,
    listConversations,
    createConversation,
    getMessages,
    updateConversation,
    assignConversation,
    markConversationRead,
    sendMessage,
    listTemplates,
    listLibrary,
    createTemplate,
    updateTemplate,
    listMetaTemplates,
    importMetaTemplate,
    syncMetaTemplates,
    getSettings,
    saveSettings,
    rotateSecret,
    removeSecret,
    testConnection,
    latestNotification,
    testNotify,
    completeEmbeddedSignup
};
