'use strict';

const crypto = require('crypto');

// Opaque public token: 32 lowercase hex chars (16 random bytes).
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const MAX_TOKEN_LENGTH = 64;

function generatePublicToken() {
    return crypto.randomBytes(16).toString('hex');
}

function isValidPublicToken(token) {
    return typeof token === 'string' && token.length <= MAX_TOKEN_LENGTH && TOKEN_PATTERN.test(token);
}

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

function generatePublicSlug(name) {
    const base = slugify(name) || 'project';
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${base}-${suffix}`;
}

// Canonical public website URL. FRONTEND_URL is the only configurable origin —
// no hardcoded domains anywhere in the codebase.
function buildPublicPropertyUrl(token) {
    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/properties/${encodeURIComponent(token)}`;
}

function buildPublicProjectUrl(slug) {
    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/projects/${encodeURIComponent(slug)}`;
}

// Canonical public availability wording — single source of truth used by every
// public DTO so the website and the WhatsApp share message never drift.
function publicAvailability(status) {
    switch (status) {
        case 'AVAILABLE': return 'Available';
        case 'RESERVED': return 'Limited Availability';
        case 'SOLD': return 'Sold';
        default: return 'Available';
    }
}

// Only absolute http(s) URLs can render outside the browser session. Images
// uploaded in-app may be stored as blob: object URLs — filter them out of
// public DTOs instead of leaking dead links to visitors.
function publicImages(images) {
    if (!Array.isArray(images)) return [];
    return images.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
}

module.exports = {
    TOKEN_PATTERN,
    MAX_TOKEN_LENGTH,
    generatePublicToken,
    isValidPublicToken,
    slugify,
    generatePublicSlug,
    buildPublicPropertyUrl,
    buildPublicProjectUrl,
    publicAvailability,
    publicImages
};
