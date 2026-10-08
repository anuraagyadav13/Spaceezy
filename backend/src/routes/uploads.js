const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { uploadImage } = require('../services/storageService');

const router = express.Router();

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Authenticated image upload for CRM media (project/property images).
// Body is raw bytes — the app-level JSON parser ignores this content type.
router.post(
    '/images',
    requireAuth(),
    express.raw({ type: ACCEPTED_TYPES, limit: '6mb' }),
    asyncHandler(async (req, res) => {
        const buffer = Buffer.isBuffer(req.body) ? req.body : null;
        if (!buffer || !buffer.length) {
            return next400(res);
        }

        try {
            const { url, key } = await uploadImage({
                buffer,
                organizationId: req.auth.organizationId,
            });
            return res.status(201).json({
                success: true,
                data: { url, key },
                message: 'Image uploaded',
            });
        } catch (err) {
            if (err.statusCode) {
                return res.status(err.statusCode).json({
                    success: false,
                    message: err.message,
                    code: err.code,
                });
            }
            // Storage/provider failure — do not leak AWS details to clients.
            console.error('S3 upload failed:', err.name || 'Error', err.message);
            return res.status(502).json({
                success: false,
                message: 'Image upload failed. Please try again.',
                code: 'STORAGE_UPLOAD_FAILED',
            });
        }
    })
);

function next400(res) {
    res.status(400).json({
        success: false,
        message: 'No image received.',
        code: 'VALIDATION_ERROR',
    });
}

module.exports = router;
