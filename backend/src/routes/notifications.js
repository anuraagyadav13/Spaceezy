const express = require('express');
const {
    getNotifications,
    markRead,
    markAllRead,
} = require('../controllers/notifications');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Self-scoped: every endpoint operates only on the authenticated user's own
// notifications, so no separate permission is required beyond being logged in.
router.use(requireAuth());

router.get('/', getNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);

module.exports = router;
