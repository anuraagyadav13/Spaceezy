'use strict';

// One-time/backfill script: assigns public share tokens (Property) and
// public slugs (Project) to rows created before the public-share feature.
// Idempotent — only touches rows where the column is NULL.
//
// Usage: node scripts/backfill-public-tokens.js

require('dotenv').config();
const prisma = require('../src/db/prisma');
const { generatePublicToken, generatePublicSlug } = require('../src/utils/publicLink');

async function backfillTokens() {
    const rows = await prisma.property.findMany({
        where: { publicToken: null },
        select: { id: true },
    });
    let done = 0;
    for (const row of rows) {
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await prisma.property.update({
                    where: { id: row.id },
                    data: { publicToken: generatePublicToken() },
                });
                done++;
                break;
            } catch (err) {
                if (err.code === 'P2002') continue;
                throw err;
            }
        }
    }
    console.log(`Property tokens backfilled: ${done} / ${rows.length}`);
    return { total: rows.length, done };
}

async function backfillSlugs() {
    const rows = await prisma.project.findMany({
        where: { publicSlug: null },
        select: { id: true, name: true },
    });
    let done = 0;
    for (const row of rows) {
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await prisma.project.update({
                    where: { id: row.id },
                    data: { publicSlug: generatePublicSlug(row.name) },
                });
                done++;
                break;
            } catch (err) {
                if (err.code === 'P2002') continue;
                throw err;
            }
        }
    }
    console.log(`Project slugs backfilled: ${done} / ${rows.length}`);
    return { total: rows.length, done };
}

(async () => {
    const tokens = await backfillTokens();
    const slugs = await backfillSlugs();

    const orphanTokens = await prisma.property.count({ where: { publicToken: null } });
    const orphanSlugs = await prisma.project.count({ where: { publicSlug: null } });
    console.log(`Remaining NULL publicToken: ${orphanTokens}, NULL publicSlug: ${orphanSlugs}`);

    const ok = tokens.done === tokens.total && slugs.done === slugs.total
        && orphanTokens === 0 && orphanSlugs === 0;
    console.log(ok ? 'BACKFILL OK' : 'BACKFILL FAILED');
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
})().catch(async (err) => {
    console.error('Backfill error:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
});
