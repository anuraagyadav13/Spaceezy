// Public media allow-list.
//
// /media is the public image route for the website. It must never expose an
// uploaded file that is not attached to a published project or unit (a CRM
// draft, an archived listing, a deleted file). The allow-list is rebuilt from
// the same public visibility rules the API uses, and cached for 60 s so an
// image request does not issue a database query every time.

const prisma = require('../db/prisma');
const { toMediaPath } = require('../services/storageService');

const PUBLIC_PROJECT_WHERE = { isPublic: true, status: { not: 'INACTIVE' } };
const CACHE_MS = 60_000;

let cache = { at: 0, keys: null };
// Profile photos are served through the same private /media route. A user's
// avatar is not part of a published listing, so it needs its own allow-list:
// every avatar currently referenced by a user record. Kept separate from the
// listing keys so a profile edit never invalidates the whole published set.
let avatarCache = { at: 0, keys: null };

async function publishedMediaKeys() {
    if (cache.keys && Date.now() - cache.at < CACHE_MS) return cache.keys;

    const [projects, properties] = await Promise.all([
        prisma.project.findMany({ where: PUBLIC_PROJECT_WHERE, select: { images: true } }),
        prisma.property.findMany({
            where: { isPublic: true, project: { is: PUBLIC_PROJECT_WHERE } },
            select: { images: true },
        }),
    ]);

    const keys = new Set();
    for (const row of [...projects, ...properties]) {
        for (const url of Array.isArray(row.images) ? row.images : []) {
            const path = toMediaPath(url);
            if (typeof path === 'string' && path.startsWith('/media/')) {
                const key = path.slice('/media/'.length);
                if (key && !key.startsWith('/')) keys.add(key);
            }
        }
    }
    cache = { at: Date.now(), keys };
    return keys;
}

async function isPublishedMediaKey(key) {
    if (!key || typeof key !== 'string') return false;
    return (await publishedMediaKeys()).has(key);
}

async function avatarMediaKeys() {
    if (avatarCache.keys && Date.now() - avatarCache.at < CACHE_MS) return avatarCache.keys;

    const users = await prisma.user.findMany({
        where: { avatar: { not: null } },
        select: { avatar: true },
    });

    const keys = new Set();
    for (const row of users) {
        const path = toMediaPath(row.avatar);
        if (typeof path === 'string' && path.startsWith('/media/')) {
            const key = path.slice('/media/'.length);
            if (key && !key.startsWith('/')) keys.add(key);
        }
    }
    avatarCache = { at: Date.now(), keys };
    return keys;
}

async function isAvatarMediaKey(key) {
    if (!key || typeof key !== 'string') return false;
    return (await avatarMediaKeys()).has(key);
}

function resetMediaCache() {
    cache = { at: 0, keys: null };
    avatarCache = { at: 0, keys: null };
}

module.exports = {
    isPublishedMediaKey,
    isAvatarMediaKey,
    publishedMediaKeys,
    avatarMediaKeys,
    resetMediaCache,
    PUBLIC_PROJECT_WHERE
};
