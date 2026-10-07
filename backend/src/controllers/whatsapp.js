const { asyncHandler } = require('../utils/errors');
const WhatsAppService = require('../services/whatsappService');

const getStatus = asyncHandler(async (req, res) => {
    const data = await WhatsAppService.getStatus();
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

module.exports = {
    getStatus,
    listConversations,
    createConversation,
    getMessages,
    sendMessage,
    listTemplates,
    createTemplate,
    updateTemplate
};
