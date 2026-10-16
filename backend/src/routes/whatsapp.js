const express = require('express');
const rateLimit = require('express-rate-limit');
const {
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
} = require('../controllers/whatsapp');
const { requireAuth, requirePermission, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    idParamsSchema,
    createConversationSchema,
    listConversationsQuerySchema,
    listMessagesQuerySchema,
    sendMessageSchema,
    createTemplateSchema,
    updateTemplateSchema,
    listTemplatesQuerySchema,
    saveSettingsSchema,
    rotateSecretSchema,
    secretFieldParamsSchema,
    testNotifySchema
} = require('../validators/whatsapp');

const router = express.Router();

router.use(requireAuth());

// Credential-sensitive operations share a modest rate limit (per IP).
const settingsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many settings requests, please try again later.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminOnly = () => requireRole(['SUPER_ADMIN', 'ADMIN']);

router.get('/status', requirePermission('whatsapp:view'), getStatus);
router.get('/conversations', requirePermission('whatsapp:view'), validate(listConversationsQuerySchema), listConversations);
router.post('/conversations', requirePermission('whatsapp:create'), validate(createConversationSchema), createConversation);
router.get('/conversations/:id', requirePermission('whatsapp:view'), validate({ ...idParamsSchema, ...listMessagesQuerySchema }), getMessages);
router.post('/conversations/:id/messages', requirePermission('whatsapp:create'), validate(sendMessageSchema), sendMessage);
router.get('/templates', requirePermission('whatsapp:view'), validate(listTemplatesQuerySchema), listTemplates);
router.get('/templates/library', requirePermission('whatsapp:view'), listLibrary);
router.post('/templates', requirePermission('whatsapp:manage'), validate(createTemplateSchema), createTemplate);
router.patch('/templates/:id', requirePermission('whatsapp:manage'), validate({ ...idParamsSchema, ...updateTemplateSchema }), updateTemplate);

// Integration settings (administrator-only; secrets never leave the server).
router.get('/settings', adminOnly(), getSettings);
router.put('/settings', adminOnly(), settingsLimiter, validate(saveSettingsSchema), saveSettings);
router.post('/settings/rotate', adminOnly(), settingsLimiter, validate(rotateSecretSchema), rotateSecret);
router.delete('/settings/secrets/:field', adminOnly(), settingsLimiter, validate(secretFieldParamsSchema), removeSecret);
router.post('/settings/test-connection', adminOnly(), settingsLimiter, testConnection);
router.get('/settings/notifications/latest', adminOnly(), latestNotification);
router.post('/settings/notify-test', adminOnly(), settingsLimiter, validate(testNotifySchema), testNotify);

module.exports = router;
