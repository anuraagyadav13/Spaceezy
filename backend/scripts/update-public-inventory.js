'use strict';

// Production data fix (idempotent, dry-run first):
//   1. Unpublish "Grand Carnesia" from the PUBLIC website only.
//      (isPublic -> false. The project, its units, leads and bookings stay
//      in the CRM untouched; it simply disappears from /public/projects.)
//   2. Set the public starting price of "Eligo Wave City" to ₹1.40 Cr.
//
// Nothing is deleted and no other column is written.
//
// Usage (from the backend/ directory, so .env is picked up):
//   node scripts/update-public-inventory.js            # dry run (default)
//   node scripts/update-public-inventory.js --apply    # perform the writes
//
// Optional overrides:
//   ELIGO_STARTING_PRICE=14500000
//
// Exit codes: 0 = done / nothing to do, 1 = error (nothing was written when
// a target could not be resolved unambiguously).

require('dotenv').config();
const prisma = require('../src/db/prisma');

const APPLY = process.argv.includes('--apply');

const INDIAN_RUPEES = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
});

// The two production records, identified by their live public slug first
// (stable) and by exact name as a fallback. If a lookup matches anything
// other than exactly ONE project the script aborts without writing.
const UNPUBLISH = {
    key: 'grand-carnesia',
    name: 'Grand Carnesia',
    slug: 'grand-carnesia-e215b6',
};

const PRICE_UPDATE = {
    key: 'eligo-wave-city',
    name: 'Eligo Wave City',
    slug: 'eligo-wave-city-c28c62',
    startingPrice: Number(process.env.ELIGO_STARTING_PRICE || 14000000),
};

const money = (value) => (value === null || value === undefined
    ? '—'
    : INDIAN_RUPEES.format(Number(value)));

async function resolveProject(target) {
    let project = target.slug
        ? await prisma.project.findUnique({
            where: { publicSlug: target.slug },
            select: {
                id: true, name: true, publicSlug: true, isPublic: true,
                status: true, startingPrice: true, maximumPrice: true,
            },
        })
        : null;

    if (!project) {
        const matches = await prisma.project.findMany({
            where: { name: target.name },
            select: {
                id: true, name: true, publicSlug: true, isPublic: true,
                status: true, startingPrice: true, maximumPrice: true,
            },
        });
        if (matches.length === 1) project = matches[0];
        else if (matches.length > 1) {
            throw new Error(
                `"${target.name}" matched ${matches.length} projects — refusing to guess. `
                + `Set the slug in the script. IDs: ${matches.map((m) => m.id).join(', ')}`
            );
        }
    }

    if (!project) {
        throw new Error(
            `Project not found: "${target.name}" (slug: ${target.slug || 'n/a'}). `
            + 'Nothing was written.'
        );
    }
    return project;
}

async function plan() {
    const actions = [];

    const grand = await resolveProject(UNPUBLISH);
    if (grand.isPublic) {
        actions.push({
            type: 'unpublish',
            project: grand,
            before: `isPublic=true (${grand.publicSlug || 'no slug'})`,
            after: 'isPublic=false',
            run: () => prisma.project.update({
                where: { id: grand.id },
                data: { isPublic: false },
                select: { id: true, isPublic: true },
            }),
        });
    } else {
        console.log(`SKIP unpublish: "${grand.name}" is already not public.`);
    }

    const eligo = await resolveProject(PRICE_UPDATE);
    const targetPrice = PRICE_UPDATE.startingPrice;
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
        throw new Error(`Invalid ELIGO_STARTING_PRICE: ${process.env.ELIGO_STARTING_PRICE}`);
    }
    const currentPrice = eligo.startingPrice === null || eligo.startingPrice === undefined
        ? null
        : Number(eligo.startingPrice);
    if (currentPrice !== targetPrice) {
        actions.push({
            type: 'price',
            project: eligo,
            before: `startingPrice=${money(currentPrice)}`,
            after: `startingPrice=${money(targetPrice)}`,
            run: () => prisma.project.update({
                where: { id: eligo.id },
                data: { startingPrice: targetPrice },
                select: { id: true, startingPrice: true },
            }),
        });
    } else {
        console.log(`SKIP price: "${eligo.name}" already starts at ${money(targetPrice)}.`);
    }

    return { actions, projects: { grand, eligo } };
}

(async () => {
    console.log(APPLY ? 'MODE: APPLY (writing)' : 'MODE: DRY RUN (no writes) — pass --apply to perform the changes');

    const { actions, projects } = await plan();
    const { grand, eligo } = projects;

    const units = await prisma.property.count({ where: { projectId: grand.id } });
    console.log('');
    console.log(`Grand Carnesia  id=${grand.id}  units=${units}  status=${grand.status}`);
    console.log(`  public now: isPublic=${grand.isPublic}  slug=${grand.publicSlug || '—'}`);
    console.log(`Eligo Wave City id=${eligo.id}  status=${eligo.status}`);
    console.log(`  public now: startingPrice=${money(eligo.startingPrice)}  slug=${eligo.publicSlug || '—'}`);
    console.log('');

    if (actions.length === 0) {
        console.log('Nothing to do — both records already match the target state.');
    } else {
        for (const action of actions) {
            console.log(`PLANNED ${action.type.toUpperCase()}: "${action.project.name}"`);
            console.log(`  before: ${action.before}`);
            console.log(`  after:  ${action.after}`);
        }

        if (APPLY) {
            for (const action of actions) {
                const result = await action.run();
                console.log(`APPLIED ${action.type.toUpperCase()}: "${action.project.name}" -> ${JSON.stringify(result)}`);
            }
        }
    }

    console.log('');
    console.log('Public site: https://spaceezy.com/projects');
    console.log(APPLY
        ? 'DONE — verify the public projects API shows only Eligo Wave City at ₹1.40 Cr.'
        : 'DRY RUN ONLY — nothing was written. Re-run with --apply to perform the changes.');

    await prisma.$disconnect();
    process.exit(0);
})().catch(async (err) => {
    console.error('ERROR:', err && err.message ? err.message : err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
});
