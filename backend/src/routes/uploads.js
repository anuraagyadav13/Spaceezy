const express = require('express');
const { asyncHandler } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { uploadImage, toMediaPath } = require('../services/storageService');

const router = express.Router();

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Authenticated image upload for CRM media (project/property images and
// profile photos). Body is raw bytes — the app-level JSON parser ignores this
// content type.
router.post(
    '/images',
    requireAuth(),
    express.raw({ type: ACCEPTED_TYPES, limit: '6mb' }),
    asyncHandler(async (req, res) => {
        const buffer = Buffer.isBuffer(req.body) ? req.body : null;
        if (!buffer || !buffer.length) {
            return next400(res);
        }

        // Profile photos are displayed on every CRM page, not on a public
        // listing, so they must be reachable through /media. S3 URLs are
        // rewritten to the private-bucket proxy path; local disk uploads are
        // already /media/... and pass through unchanged.
        const isAvatar = req.query.purpose === 'avatar';

        try {
            const { url, key } = await uploadImage({
                buffer,
                organizationId: req.auth.organizationId,
            });
            return res.status(201).json({
                success: true,
                data: { url: isAvatar ? toMediaPath(url) : url, key },
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
