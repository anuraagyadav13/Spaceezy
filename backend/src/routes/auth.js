const express = require('express');
const { login, logout, getMe } = require('../controllers/auth');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { loginSchema } = require('../validators/auth');

const router = express.Router();

router.post('/login', validate(loginSchema), login);
router.post('/logout', requireAuth(), logout);
router.get('/me', requireAuth(), getMe);

module.exports = router;
