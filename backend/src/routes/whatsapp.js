const express = require('express');
const {
    getStatus,
    listConversations,
    createConversation,
    getMessages,
    sendMessage,
    listTemplates,
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
router.get('/conversations/:id', requirePermission('whatsapp:view'), validate(idParamsSchema), getMessages);
router.post('/conversations/:id/messages', requirePermission('whatsapp:create'), validate(sendMessageSchema), sendMessage);
router.get('/templates', requirePermission('whatsapp:view'), validate(listTemplatesQuerySchema), listTemplates);
router.post('/templates', requirePermission('whatsapp:manage'), validate(createTemplateSchema), createTemplate);
router.patch('/templates/:id', requirePermission('whatsapp:manage'), validate(idParamsSchema), updateTemplate);

module.exports = router;
