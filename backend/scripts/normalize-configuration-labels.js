'use strict';

// One-time normalisation of free-text configuration labels onto the
// controlled vocabulary (`src/utils/propertyRequirement.js`).
//
// Dry run by default — prints every change and exits without writing.
//
//   node scripts/normalize-configuration-labels.js            # dry run
//   node scripts/normalize-configuration-labels.js --apply    # write
//
// Idempotent: a second run finds nothing to change. It only rewrites
// Configuration.name and Property.configuration; no rows are created or
// deleted and no other column is touched. Take a database backup first.

require('dotenv').config();
const prisma = require('../src/db/prisma');
const { canonicalConfigurationLabel } = require('../src/utils/propertyRequirement');

const APPLY = process.argv.includes('--apply');

async function main() {
    const configurations = await prisma.configuration.findMany({
        select: { id: true, name: true, project: { select: { name: true } } },
        orderBy: { createdAt: 'asc' }
    });

    const configChanges = configurations
        .map((row) => ({
            id: row.id,
            project: row.project ? row.project.name : '(unknown project)',
            from: row.name,
            to: canonicalConfigurationLabel(row.name)
        }))
        .filter((row) => row.to && row.to !== row.from);

    const properties = await prisma.property.findMany({
        where: { configuration: { not: null } },
        select: { id: true, configuration: true, project: { select: { name: true } } }
    });

    const propertyChanges = properties
        .map((row) => ({
            id: row.id,
            project: row.project ? row.project.name : '(unknown project)',
            from: row.configuration,
            to: canonicalConfigurationLabel(row.configuration)
        }))
        .filter((row) => row.to && row.to !== row.from);

    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}`);
    console.log(`Configurations to rename: ${configChanges.length}`);
    for (const row of configChanges) console.log(`  [project: ${row.project}] "${row.from}" -> "${row.to}"`);
    console.log(`Units to relabel: ${propertyChanges.length}`);
    for (const row of propertyChanges) console.log(`  [project: ${row.project}] "${row.from}" -> "${row.to}"`);

    if (!APPLY) {
        console.log('\nNothing written. Re-run with --apply to persist these changes.');
        return;
    }

    await prisma.$transaction(async (tx) => {
        for (const row of configChanges) {
            await tx.configuration.update({ where: { id: row.id }, data: { name: row.to } });
        }
        for (const row of propertyChanges) {
            await tx.property.update({ where: { id: row.id }, data: { configuration: row.to } });
        }
    });

    console.log(`\nApplied ${configChanges.length + propertyChanges.length} change(s).`);
}

main()
    .catch((error) => {
        console.error('Normalisation failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
