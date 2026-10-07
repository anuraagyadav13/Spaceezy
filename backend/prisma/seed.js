// Location master seed + project location backfill. Idempotent.
//
// The State/UT + District master is the verified India dataset in
// prisma/data/india-locations.json (built by scripts/build-location-master.js
// from the National Portal/Wikipedia district tables; see that script for the
// exact source and validation rules). Regions/localities are the verified
// entries below plus anything added later by admins in
// Dashboard -> Admin -> Location Management.
//
// Existing rows are preserved: states upsert by code, districts align by
// (stateId, name) with an explicit rename map that keeps IDs stable.
//
// Run with: npm run seed   (from backend/)

require('dotenv').config();
const prisma = require('../src/db/prisma');
const MASTER = require('./data/india-locations.json');

// Legacy district rows whose display name differs from the canonical master.
// The row keeps its ID (referencing projects/leads keep working); only the
// label is aligned to the master.
const DISTRICT_RENAMES = {
    'Maharashtra:mumbai': 'Mumbai City'
};

// Verified localities (regions) that belong to the master's districts.
// A region always belongs to a district, never to a state directly.
const REGIONS_BY_DISTRICT = {
    'Maharashtra:Pune': ['Baner', 'Kothrud', 'Hinjewadi', 'Wakad', 'Aundh'],
    'Maharashtra:Mumbai City': ['Andheri West', 'Bandra East', 'Powai', 'Thane'],
    'Uttar Pradesh:Ghaziabad': ['Wave City', 'Vaishali', 'Indirapuram'],
    'Uttar Pradesh:Gautam Buddha Nagar': ['Noida', 'Greater Noida'],
    'Delhi:South Delhi': ['Saket', 'Hauz Khas', 'Greater Kailash'],
    'Delhi:North Delhi': ['Rohini', 'Pitampura'],
    'Haryana:Gurugram': ['Golf Course Road', 'Sector 54', 'DLF Phase 5']
};

const norm = (value) => String(value || '').trim().toLowerCase();

async function seedLocationMaster() {
    let stateCount = 0;
    let districtCount = 0;
    let regionCount = 0;
    let renamedDistricts = 0;

    const preExistingStateCodes = new Set(
        (await prisma.locationState.findMany({ select: { code: true } })).map((s) => s.code)
    );
    let createdStates = 0;
    let createdDistricts = 0;

    for (const stateDef of MASTER.states) {
        // Preserve IDs: upsert on the canonical code.
        const state = await prisma.locationState.upsert({
            where: { code: stateDef.code },
            update: { name: stateDef.name },
            create: { code: stateDef.code, name: stateDef.name }
        });
        if (!preExistingStateCodes.has(stateDef.code)) createdStates += 1;
        stateCount += 1;

        const existing = await prisma.locationDistrict.findMany({
            where: { stateId: state.id },
            select: { id: true, name: true }
        });
        const byNorm = new Map(existing.map((d) => [norm(d.name), d]));

        // Align legacy rows to canonical labels (IDs unchanged).
        for (const district of existing) {
            const renameTo = DISTRICT_RENAMES[`${stateDef.name}:${norm(district.name)}`];
            if (renameTo && renameTo !== district.name) {
                const clash = byNorm.has(norm(renameTo)) && byNorm.get(norm(renameTo)).id !== district.id;
                if (!clash) {
                    await prisma.locationDistrict.update({
                        where: { id: district.id },
                        data: { name: renameTo }
                    });
                    byNorm.delete(norm(district.name));
                    district.name = renameTo;
                    byNorm.set(norm(renameTo), district);
                    renamedDistricts += 1;
                }
            }
        }

        for (const districtName of stateDef.districts) {
            if (byNorm.has(norm(districtName))) continue;
            const created = await prisma.locationDistrict.create({
                data: { stateId: state.id, name: districtName }
            });
            byNorm.set(norm(districtName), created);
            createdDistricts += 1;
        }
        districtCount += stateDef.districts.length;

        // Verified regions for this state's districts.
        for (const [districtName, regionNames] of Object.entries(REGIONS_BY_DISTRICT)) {
            const [regionState, regionDistrict] = districtName.split(':');
            if (regionState !== stateDef.name) continue;
            const district = byNorm.get(norm(regionDistrict));
            if (!district) {
                console.warn(`  Region skipped: district ${districtName} not found in master`);
                continue;
            }
            for (const regionName of regionNames) {
                await prisma.locationRegion.upsert({
                    where: { districtId_name: { districtId: district.id, name: regionName } },
                    update: {},
                    create: { districtId: district.id, name: regionName }
                });
                regionCount += 1;
            }
        }
    }

    const totals = {
        states: await prisma.locationState.count(),
        districts: await prisma.locationDistrict.count(),
        regions: await prisma.locationRegion.count()
    };

    console.log(
        `Location master: master has ${stateCount} states/UTs and ${districtCount} districts ` +
        `(${createdStates} states created, ${createdDistricts} districts created, ${renamedDistricts} districts renamed); ` +
        `${regionCount} verified region entries processed.`
    );
    console.log(
        `Database totals: ${totals.states} states, ${totals.districts} districts, ${totals.regions} regions`
    );
}

async function backfillProjectLocations() {
    const projects = await prisma.project.findMany({
        where: { stateId: null },
        select: { id: true, name: true, city: true, state: true, locality: true }
    });

    const states = await prisma.locationState.findMany({ select: { id: true, name: true } });
    const districts = await prisma.locationDistrict.findMany({ select: { id: true, name: true, stateId: true } });
    const regions = await prisma.locationRegion.findMany({ select: { id: true, name: true, districtId: true } });

    let linked = 0;
    const unmapped = [];

    for (const project of projects) {
        const data = {};

        // District: legacy `city` text -> canonical district name
        let district = null;
        if (project.city) {
            const candidates = districts.filter((d) => norm(d.name) === norm(project.city));
            if (project.state) {
                const state = states.find((s) => norm(s.name) === norm(project.state));
                district = state ? candidates.find((c) => c.stateId === state.id) || null : null;
            } else if (candidates.length === 1) {
                district = candidates[0];
            }
        }

        // State: district first, then legacy `state` text -> canonical state name
        let stateId = district ? district.stateId : null;
        if (!stateId && project.state) {
            const state = states.find((s) => norm(s.name) === norm(project.state));
            if (state) stateId = state.id;
        }

        if (!stateId && !district) {
            if (project.city || project.state || project.locality) unmapped.push(project.name);
            continue; // no location text at all -> leave untouched, never guess
        }

        if (stateId) data.stateId = stateId;
        if (district) data.districtId = district.id;

        // Region: legacy `locality` text -> canonical region inside the district
        if (district && project.locality) {
            const region = regions.find(
                (r) => r.districtId === district.id && norm(r.name) === norm(project.locality)
            );
            if (region) data.regionId = region.id;
        }

        // Denormalize canonical names into the legacy free-text columns
        if (stateId) {
            const state = states.find((s) => s.id === stateId);
            if (state) data.state = state.name;
        }
        if (district) data.city = district.name;
        if (data.regionId) {
            const region = regions.find((r) => r.id === data.regionId);
            if (region) data.locality = region.name;
        }

        if (Object.keys(data).length > 0) {
            await prisma.project.update({ where: { id: project.id }, data });
            linked += 1;
        }
    }

    console.log(`Project location backfill: ${linked} of ${projects.length} projects linked`);
    if (unmapped.length > 0) {
        console.log(`Unmapped (kept as-is, no location text or no confident match): ${unmapped.join(', ')}`);
    }
}

async function main() {
    console.log(`Seeding canonical location master from ${MASTER.source} (retrieved ${MASTER.retrievedAt})...`);
    await seedLocationMaster();

    console.log('Backfilling project locations...');
    await backfillProjectLocations();

    console.log('Seed complete.');
}

main()
    .catch((error) => {
        console.error('Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
