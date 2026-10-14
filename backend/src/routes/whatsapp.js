const express = require('express');
const {
    getStatus,
    listConversations,
    createConversation,
    getMessages,
    sendMessage,
    listTemplates,
    listLibrary,
    createTemplate,
    updateTemplate
} = require('../controllers/whatsapp');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    idParamsSchema,
    createConversationSchema,
    listConversationsQuerySchema,
    listMessagesQuerySchema,
    sendMessageSchema,
    createTemplateSchema,
    updateTemplateSchema,
    listTemplatesQuerySchema
} = require('../validators/whatsapp');

const router = express.Router();

router.use(requireAuth());

router.get('/status', requirePermission('whatsapp:view'), getStatus);
router.get('/conversations', requirePermission('whatsapp:view'), validate(listConversationsQuerySchema), listConversations);
router.post('/conversations', requirePermission('whatsapp:create'), validate(createConversationSchema), createConversation);
router.get('/conversations/:id', requirePermission('whatsapp:view'), validate({ ...idParamsSchema, ...listMessagesQuerySchema }), getMessages);
router.post('/conversations/:id/messages', requirePermission('whatsapp:create'), validate(sendMessageSchema), sendMessage);
router.get('/templates', requirePermission('whatsapp:view'), validate(listTemplatesQuerySchema), listTemplates);
router.get('/templates/library', requirePermission('whatsapp:view'), listLibrary);
router.post('/templates', requirePermission('whatsapp:manage'), validate(createTemplateSchema), createTemplate);
router.patch('/templates/:id', requirePermission('whatsapp:manage'), validate({ ...idParamsSchema, ...updateTemplateSchema }), updateTemplate);

module.exports = router;
