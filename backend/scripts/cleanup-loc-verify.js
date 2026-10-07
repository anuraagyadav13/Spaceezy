// Removes location-master verification test artifacts (projects/leads whose
// names start with "LOC Verify"). Properties of those projects are removed
// first so project deletion never hits an FK. Idempotent.
//
// Run with: node scripts/cleanup-loc-verify.js   (from backend/)

require('dotenv').config();
const prisma = require('../src/db/prisma');

async function main() {
    const projects = await prisma.project.findMany({
        where: { name: { startsWith: 'LOC Verify' } },
        select: { id: true, name: true }
    });

    for (const project of projects) {
        const removed = await prisma.property.deleteMany({ where: { projectId: project.id } });
        await prisma.project.delete({ where: { id: project.id } }).catch(() => null);
        console.log(`Removed project "${project.name}" (${removed.count} properties)`);
    }

    const leads = await prisma.lead.deleteMany({
        where: { name: 'LOC Verify Lead' }
    });
    if (leads.count > 0) console.log(`Removed ${leads.count} verification lead(s)`);

    const totals = {
        states: await prisma.locationState.count(),
        districts: await prisma.locationDistrict.count(),
        regions: await prisma.locationRegion.count()
    };
    console.log(
        `Cleanup done. Location master totals: ${totals.states} states, ${totals.districts} districts, ${totals.regions} regions`
    );
}

main()
    .catch((error) => {
        console.error('Cleanup failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
