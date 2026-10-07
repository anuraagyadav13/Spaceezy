const { asyncHandler, AppError } = require('../utils/errors');
const TaskService = require('../services/taskService');
const { maskContact } = require('../utils/pii');

const getTasks = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await TaskService.getTasks(organizationId, req.query, role, userId);

    res.status(200).json({
        success: true,
        data: {
            ...result,
            tasks: result.tasks.map((t) => ({
                ...t,
                lead: t.lead ? maskContact(t.lead, role) : t.lead
            }))
        },
        message: 'Tasks fetched successfully'
    });
});

const getTaskById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role } = req.auth;
    const task = await TaskService.getTaskById(id, organizationId);

    res.status(200).json({
        success: true,
        data: task && task.lead ? { ...task, lead: maskContact(task.lead, role) } : task,
        message: 'Task fetched successfully'
    });
});

const createTask = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const task = await TaskService.createTask(req.body, organizationId, userId);

    res.status(201).json({
        success: true,
        data: task,
        message: 'Task created successfully'
    });
});

const updateTask = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const task = await TaskService.updateTask(id, req.body, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: task,
        message: 'Task updated successfully'
    });
});

const toggleTaskStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const task = await TaskService.toggleTaskStatus(id, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: task,
        message: 'Task status toggled successfully'
    });
});

const deleteTask = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    await TaskService.deleteTask(id, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: null,
        message: 'Task deleted successfully'
    });
});

const getOverdueTasks = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const tasks = await TaskService.getOverdueTasks(organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: tasks.map((t) => ({ ...t, lead: t.lead ? maskContact(t.lead, role) : t.lead })),
        message: 'Overdue tasks fetched successfully'
    });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const task = await TaskService.updateTaskStatus(id, req.body.status, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: task,
        message: 'Task status updated'
    });
});

const rescheduleTask = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { organizationId, role, userId } = req.auth;
    const task = await TaskService.rescheduleTask(id, req.body, organizationId, role, userId);

    res.status(200).json({
        success: true,
        data: task,
        message: 'Task rescheduled'
    });
});

module.exports = {
    getTasks,
    getTaskById,
    createTask,
    updateTask,
    toggleTaskStatus,
    deleteTask,
    getOverdueTasks,
    updateTaskStatus,
    rescheduleTask
};
