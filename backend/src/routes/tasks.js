const express = require('express');
const { getTasks, getTaskById, createTask, updateTask, toggleTaskStatus, deleteTask, getOverdueTasks } = require('../controllers/tasks');
const { requireAuth, requirePermission } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { getTasksQuerySchema, createTaskSchema, updateTaskSchema } = require('../validators/task');

const router = express.Router();

router.use(requireAuth());

router.get('/overdue', requirePermission('task:view'), getOverdueTasks);
router.get('/', requirePermission('task:view'), validate(getTasksQuerySchema), getTasks);
router.post('/', requirePermission('task:create'), validate(createTaskSchema), createTask);
router.get('/:id', requirePermission('task:view'), getTaskById);
router.patch('/:id', requirePermission('task:update'), validate(updateTaskSchema), updateTask);
router.patch('/:id/toggle', requirePermission('task:update'), toggleTaskStatus);
router.delete('/:id', requirePermission('task:delete'), deleteTask);

module.exports = router;
