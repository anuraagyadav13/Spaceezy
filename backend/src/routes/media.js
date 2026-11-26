// Public image delivery.
//
// Production (S3 configured): the bucket stays fully private — images are
// streamed through this endpoint with the server's IAM credentials, never via
// direct object URLs. Only keys under the configured upload prefix with an
// allow-listed image extension and an image/* content type are served, so
// non-image objects (diagnostics, backups, etc.) can never be exposed, and a
// key must belong to a published listing or a profile photo.
//
// Local dev (no S3): images are stored under backend/uploads and served from
// this same route, restricted to the "images/" namespace.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getConfig, diskRoot } = require('../services/storageService');
const { isPublishedMediaKey, isAvatarMediaKey } = require('../utils/publicMedia');

const router = express.Router();

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const CONTENT_TYPES = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
};
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MAX_KEY_LENGTH = 1024;

let s3Client = null;
const getClient = (region) => {
    if (!s3Client) s3Client = new S3Client({ region });
    return s3Client;
};

const sendJson = (res, status, code, message) =>
    res.status(status).json({ success: false, code, message });

router.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.set('Allow', 'GET, HEAD');
        return sendJson(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
    return handleImage(req, res).catch((err) => {
        console.error('Media proxy failure:', err.name || 'Error', err.message);
        res.set('Cache-Control', 'no-store');
        if (!res.headersSent) {
            sendJson(res, 502, 'STORAGE_FETCH_FAILED', 'Image could not be loaded.');
        } else {
            res.destroy();
        }
    });
});

// Local-dev disk mode. Keys are always server-generated image keys under
// `images/`; the resolved path is kept inside the uploads root so a crafted
// key can never escape it. The browser-visible key stays `/media/<key>`.
const serveDiskImage = async (req, res, key) => {
    if (
        !key ||
        key.length > MAX_KEY_LENGTH ||
        !key.startsWith('images/') ||
        key.includes('..') ||
        key.includes('\0') ||
        !IMAGE_EXT.test(key)
    ) {
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    const root = diskRoot();
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) {
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    let stat;
    try {
        stat = await fs.promises.stat(full);
    } catch {
        res.set('Cache-Control', 'public, max-age=60');
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }
    if (!stat.isFile()) {
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    const ext = path.extname(full).slice(1).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
        res.status(304).end();
        return undefined;
    }

    res.set({
        'Content-Type': contentType,
        'Cache-Control': CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(stat.size),
        'ETag': etag,
        'Last-Modified': stat.mtime.toUTCString(),
    });

    if (req.method === 'HEAD') {
        res.status(200).end();
        return undefined;
    }

    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(full);
        stream.on('error', reject);
        stream.pipe(res);
        res.on('finish', resolve);
    });
    return undefined;
};

const handleImage = async (req, res) => {
    let key;
    try {
        key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    } catch {
        return sendJson(res, 400, 'VALIDATION_ERROR', 'Invalid image key.');
    }

    const config = getConfig();
    // Local dev without S3: images live on disk under backend/uploads and are
    // served from the same /media route so the whole upload flow works without
    // AWS. Only the "images/" namespace is exposed — never PDF documents.
    if (!config) return serveDiskImage(req, res, key);

    if (
        !key ||
        key.length > MAX_KEY_LENGTH ||
        !key.startsWith(`${config.prefix}/`) ||
        key.includes('..') ||
        key.includes('\0') ||
        !IMAGE_EXT.test(key)
    ) {
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    // A valid-looking key is still private unless it is referenced by a
    // published project or unit (or is a user's profile photo). Everything
    // else (CRM-only drafts, archived listings, orphan uploads) answers
    // exactly like a missing object.
    if (!(await isPublishedMediaKey(key)) && !(await isAvatarMediaKey(key))) {
        res.set('Cache-Control', 'public, max-age=60');
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    let out;
    try {
        out = await getClient(config.region).send(
            new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
    } catch (err) {
        const status = err && err.$metadata && err.$metadata.httpStatusCode;
        if (err && (err.name === 'NoSuchKey' || err.name === 'NotFound' || status === 404)) {
            res.set('Cache-Control', 'public, max-age=60');
            return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
        }
        throw err;
    }

    const contentType = out.ContentType || '';
    if (!contentType.startsWith('image/')) {
        // Never serve a non-image object, even under the upload prefix.
        res.set('Cache-Control', 'public, max-age=60');
        return sendJson(res, 404, 'NOT_FOUND', 'Image not found.');
    }

    const etag = out.ETag || null;
    const lastModified = out.LastModified || null;
    const ifNoneMatch = req.headers['if-none-match'];
    if (etag && ifNoneMatch && ifNoneMatch.split(',').some((t) => t.trim() === etag)) {
        res.status(304).end();
        return undefined;
    }

    res.set({
        'Content-Type': contentType,
        'Cache-Control': CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
    });
    if (out.ContentLength != null) res.set('Content-Length', String(out.ContentLength));
    if (etag) res.set('ETag', etag);
    if (lastModified) res.set('Last-Modified', lastModified.toUTCString());

    if (req.method === 'HEAD') {
        res.status(200).end();
        return undefined;
    }

    const body = out.Body;
    if (!body || typeof body.pipe !== 'function') {
        throw new Error('Unexpected S3 body stream.');
    }
    res.status(200);
    await new Promise((resolve, reject) => {
        body.on('error', reject);
        res.on('close', () => {
            if (typeof body.destroy === 'function') body.destroy();
        });
        body.pipe(res);
        res.on('finish', resolve);
    });
    return undefined;
};

module.exports = router;
