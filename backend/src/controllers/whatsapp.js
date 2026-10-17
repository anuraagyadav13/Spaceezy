const { asyncHandler } = require('../utils/errors');
const WhatsAppService = require('../services/whatsappService');
const WhatsappSettingsService = require('../services/whatsappSettingsService');
const WhatsappNotifyService = require('../services/whatsappNotifyService');

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

module.exports = {
    getStatus,
    listConversations,
    createConversation,
    getMessages,
    sendMessage,
    listTemplates,
    listLibrary,
    createTemplate,
    updateTemplate,
    getSettings,
    saveSettings,
    rotateSecret,
    removeSecret,
    testConnection,
    latestNotification,
    testNotify
};
