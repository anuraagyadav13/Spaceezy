const express = require('express');
const {
    getTasks,
    getTaskById,
    createTask,
    updateTask,
    toggleTaskStatus,
    deleteTask,
    getOverdueTasks,
    updateTaskStatus,
    rescheduleTask
} = require('../controllers/tasks');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    idParamsSchema,
    getTasksQuerySchema,
    createTaskSchema,
    updateTaskSchema,
    taskStatusSchema,
    rescheduleTaskSchema
} = require('../validators/task');

const router = express.Router();

router.use(requireAuth());

router.get('/overdue', requirePermission('task:view'), getOverdueTasks);
router.get('/', requirePermission('task:view'), validate(getTasksQuerySchema), getTasks);
router.post('/', requirePermission('task:create'), validate(createTaskSchema), createTask);
router.get('/:id', requirePermission('task:view'), validate(idParamsSchema), getTaskById);
router.patch('/:id', requirePermission('task:update'), validate(updateTaskSchema), updateTask);
router.patch('/:id/status', requirePermission('task:update'), validate({ ...idParamsSchema, ...taskStatusSchema }), updateTaskStatus);
router.patch('/:id/reschedule', requirePermission('task:update'), validate({ ...idParamsSchema, ...rescheduleTaskSchema }), rescheduleTask);
router.patch('/:id/toggle', requirePermission('task:update'), validate(idParamsSchema), toggleTaskStatus);
router.delete('/:id', requirePermission('task:delete'), validate(idParamsSchema), deleteTask);

module.exports = router;
