require('dotenv').config();
const p = require('../src/db/prisma');
(async () => {
    const ss = await p.locationState.findMany({ orderBy: { code: 'asc' } });
    console.log('states:', ss.length);
    for (const s of ss) {
        const dc = await p.locationDistrict.count({ where: { stateId: s.id } });
        console.log(' ', s.code, s.name, s.id, 'districts=' + dc);
    }
    const d = await p.locationDistrict.findMany();
    console.log('districts total:', d.length);
    console.log(d.map((x) => x.name + '@' + x.stateId.slice(0, 8) + '#' + x.id.slice(0, 8)).join(', '));
    const r = await p.locationRegion.findMany({ include: { district: { select: { name: true } } } });
    console.log('regions total:', r.length);
    console.log(r.map((x) => x.name + '@' + x.district.name + '#' + x.id.slice(0, 8)).join(', '));
    const unlinked = await p.project.findMany({ where: { stateId: null }, select: { name: true, city: true, state: true } });
    console.log('unlinked projects:', unlinked.length);
    console.log(unlinked.map((u) => `${u.city} | ${u.state} | ${u.name}`).join('\n'));
    const linked = await p.project.findMany({ where: { stateId: { not: null } }, select: { id: true, name: true, stateId: true, districtId: true, regionId: true } });
    console.log('linked projects:', linked.length);
    console.log(linked.map((x) => `${x.name} #${x.id.slice(0, 8)} st=${x.stateId ? x.stateId.slice(0, 8) : '-'} di=${x.districtId ? x.districtId.slice(0, 8) : '-'} re=${x.regionId ? x.regionId.slice(0, 8) : '-'}`).join('\n'));
    await p.$disconnect();
})();
