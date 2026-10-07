const express = require('express');
const {
    getStatus,
    initiateCall,
    hangupCall,
    recordOutcome,
    listCalls,
    getCallById,
    getRecording,
    streamRecording
} = require('../controllers/calls');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    idParamsSchema,
    initiateCallSchema,
    outcomeSchema,
    getCallsQuerySchema
} = require('../validators/call');

const router = express.Router();

router.use(requireAuth());

router.get('/status', requirePermission('call:view'), getStatus);
router.get('/', requirePermission('call:view'), validate(getCallsQuerySchema), listCalls);
router.post('/', requirePermission('call:create'), validate(initiateCallSchema), initiateCall);
router.get('/:id', requirePermission('call:view'), validate(idParamsSchema), getCallById);
router.post('/:id/hangup', requirePermission('call:update'), validate(idParamsSchema), hangupCall);
router.post('/:id/outcome', requirePermission('call:update'), validate(outcomeSchema), recordOutcome);
router.get('/:id/recording', requirePermission('recording:view'), validate(idParamsSchema), getRecording);
router.get('/:id/recording/stream', requirePermission('recording:view'), validate(idParamsSchema), streamRecording);

module.exports = router;
