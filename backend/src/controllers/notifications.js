const { asyncHandler } = require('../utils/errors');
const NotificationService = require('../services/notificationService');

const getNotifications = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const { unread, page, limit } = req.query;

    const result = await NotificationService.getNotifications(organizationId, userId, {
        unreadOnly: unread === 'true' || unread === '1',
        page,
        limit,
    });

    res.status(200).json({
        success: true,
        data: result,
        message: 'Notifications fetched successfully',
    });
});

const markRead = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;
    const { id } = req.params;

    const notification = await NotificationService.markRead(id, organizationId, userId);

    res.status(200).json({
        success: true,
        data: notification,
        message: 'Notification marked as read',
    });
});

const markAllRead = asyncHandler(async (req, res) => {
    const { organizationId, userId } = req.auth;

    const result = await NotificationService.markAllRead(organizationId, userId);

    res.status(200).json({
        success: true,
        data: result,
        message: 'All notifications marked as read',
    });
});

module.exports = {
    getNotifications,
    markRead,
    markAllRead,
};
