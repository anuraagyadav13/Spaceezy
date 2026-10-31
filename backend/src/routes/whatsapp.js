const express = require('express');
const rateLimit = require('express-rate-limit');
const {
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
    updateConversationSchema,
    assignConversationSchema,
    markReadSchema,
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

// Shared-inbox mutations (send, close/reopen, assign, mark-read) share one
// generous per-IP budget: comfortably above what an agent produces in an
// active session, still enough to stop scripted abuse of the write paths
// (audit rows, provider calls). Same response shape as settingsLimiter.
const conversationActionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 120,
    message: { success: false, message: 'Too many messaging actions, please slow down and try again shortly.', code: 'TOO_MANY_REQUESTS' },
    standardHeaders: true,
    legacyHeaders: false,
});

const adminOnly = () => requireRole(['SUPER_ADMIN', 'ADMIN']);

router.get('/status', requirePermission('whatsapp:view'), getStatus);
router.get('/conversations', requirePermission('whatsapp:view'), validate(listConversationsQuerySchema), listConversations);
router.post('/conversations', requirePermission('whatsapp:create'), validate(createConversationSchema), createConversation);
router.get('/conversations/:id', requirePermission('whatsapp:view'), validate({ ...idParamsSchema, ...listMessagesQuerySchema }), getMessages);
router.post('/conversations/:id/messages', requirePermission('whatsapp:create'), conversationActionLimiter, validate(sendMessageSchema), sendMessage);
// Shared-inbox conversation management (all scope-checked inside the service):
// close/reopen needs whatsapp:create (executives: own threads only);
// assignment reuses lead assignment → lead:assign (admins/managers only);
// mark-read needs whatsapp:view + conversation scope. All three share the
// send route's mutation budget.
router.patch('/conversations/:id', requirePermission('whatsapp:create'), conversationActionLimiter, validate({ ...idParamsSchema, ...updateConversationSchema }), updateConversation);
router.post('/conversations/:id/assign', requirePermission('lead:assign'), conversationActionLimiter, validate({ ...idParamsSchema, ...assignConversationSchema }), assignConversation);
router.post('/conversations/:id/read', requirePermission('whatsapp:view'), conversationActionLimiter, validate({ ...idParamsSchema, ...markReadSchema }), markConversationRead);
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
