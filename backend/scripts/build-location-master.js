// Builds backend/prisma/data/india-locations.json — the canonical India
// location master (State/UT -> District) used by prisma/seed.js.
//
// Source: Wikipedia "List of districts in India"
//   (https://en.wikipedia.org/wiki/List_of_districts_in_India),
//   which itself cites the Census of India district codes and the National
//   Portal of India. The article's own per-state Overview counts are used to
//   cross-validate the parsed section tables, and the parsed result is checked
//   against the official 28 States + 8 Union Territories name list.
//
// Regions/localities are intentionally NOT part of this dataset (no single
// authoritative nationwide locality source); verified localities live in the
// seed and new ones are added by admins via the Location Management UI.
//
// Run: node scripts/build-location-master.js   (from backend/)

const fs = require('fs');
const path = require('path');

const WIKI_URL = 'https://en.wikipedia.org/wiki/List_of_districts_in_India?action=raw';

// The official current list of 28 States + 8 Union Territories (spec list).
const OFFICIAL_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
    'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
    'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
    'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
    'Ladakh', 'Lakshadweep', 'Puducherry'
];

// Section heading -> display name overrides.
const DISPLAY_NAME = {
    'National Capital Territory of Delhi': 'Delhi',
    'Andaman and Nicobar': 'Andaman and Nicobar Islands'
};

const cleanWiki = (value) => String(value || '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/''/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u2020\u2021\u2024*†‡]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const norm = (value) => String(value || '').trim().toLowerCase();

async function main() {
    const res = await fetch(WIKI_URL, { headers: { 'User-Agent': 'SpaceezyLocationMaster/1.0 (seed data builder)' } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const wikitext = await res.text();

    // 1) Overview table: state name -> expected district count (cross-check).
    const expected = {};
    const overviewBlock = wikitext.slice(wikitext.indexOf('== Overview =='), wikitext.indexOf('== Naming =='));
    const overviewRe = /\|\s*\[\[[^\]|]+\|([^\]]+)\]\]\s*\n\|\s*(\d+)/g;
    for (const m of overviewBlock.matchAll(overviewRe)) {
        expected[cleanWiki(m[1])] = Number(m[2]);
    }

    // 2) Section tables: === Name (CODE) === followed by wikitable rows.
    // Rows appear in two formats in the source: all cells on one line
    // ("| 1 || AB || [[X district|X]] || ...") or one cell per line
    // ("|1\n|AB\n|[[X district|X]]\n..."). Split on either separator.
    const lines = wikitext.split('\n');
    const states = [];
    let current = null;
    const warnings = [];

    const splitCells = (rowText) => rowText
        .split(/\|\||\n\s*\|/)
        .map((c, i) => (i === 0 ? c.replace(/^\|/, '') : c))
        .map((c) => c.trim());

    for (const line of lines) {
        const heading = line.match(/^=== (.+?) \(([A-Z]{2})\) ===$/);
        if (heading) {
            const display = DISPLAY_NAME[heading[1]] || heading[1];
            current = { name: display, code: heading[2], body: [], districts: [] };
            states.push(current);
            continue;
        }
        if (/^(==+)[^=]/.test(line)) { current = null; continue; }
        if (current) current.body.push(line);
    }

    for (const state of states) {
        const body = state.body.join('\n');
        const tables = body.match(/\{\|[\s\S]*?\|\}/g) || [];
        for (const table of tables) {
            const rows = table.split(/^\|-.*$/m).slice(1); // drop everything before first |-
            for (const row of rows) {
                const cleaned = row.replace(/^\|\+.*$/m, '').trim();
                if (!cleaned || cleaned.startsWith('!')) continue; // header row
                const cells = splitCells(cleaned);
                if (cells.length < 3) continue;
                const district = cleanWiki(cells[2]);
                if (!district || /^(#|Code|District|Headquarters|States|Union territories)$/i.test(district)) continue;
                if (/^\d[\d,.]*$/.test(district)) {
                    warnings.push(`${state.name}: row 3rd cell looks numeric, skipped: ${district}`);
                    continue;
                }
                state.districts.push(district);
            }
        }
        delete state.body;
    }

    // 3) Validation.
    const errors = [];
    if (states.length !== 36) errors.push(`Expected 36 states/UTs, parsed ${states.length}`);

    const parsedNames = states.map((s) => s.name).sort();
    const officialSorted = [...OFFICIAL_STATES].sort();
    for (const name of officialSorted) {
        if (!parsedNames.includes(name)) errors.push(`Missing official state/UT: ${name}`);
    }
    for (const name of parsedNames) {
        if (!officialSorted.includes(name)) errors.push(`Unexpected state/UT not in official list: ${name}`);
    }

    let totalDistricts = 0;
    for (const state of states) {
        if (state.districts.length === 0) errors.push(`${state.name}: no districts parsed`);
        const unique = new Set(state.districts.map(norm));
        if (unique.size !== state.districts.length) errors.push(`${state.name}: duplicate district names`);
        totalDistricts += state.districts.length;

        const want = expected[state.name];
        if (want !== undefined && want !== state.districts.length) {
            // The article's summary (Overview) table can lag behind its own
            // detailed per-state tables; the detailed tables (with census
            // district codes) are authoritative here. Record the discrepancy.
            warnings.push(`${state.name}: detail table has ${state.districts.length} districts, Overview table says ${want} (kept detail table)`);
        }
    }

    if (totalDistricts < 770) errors.push(`Only ${totalDistricts} districts parsed (expected 770+)`);

    if (errors.length) {
        console.error('VALIDATION FAILED:');
        for (const e of errors) console.error(' -', e);
        process.exit(1);
    }
    if (warnings.length) {
        console.warn('WARNINGS:');
        for (const w of warnings) console.warn(' -', w);
    }

    const payload = {
        source: WIKI_URL.replace('?action=raw', ''),
        retrievedAt: new Date().toISOString(),
        note: 'State/UT + District master for India. District codes are the Census/ISO style codes published with the source article. Regions/localities are managed separately (seed + admin UI).',
        stateCount: states.length,
        districtCount: totalDistricts,
        states
    };

    const outPath = path.join(__dirname, '..', 'prisma', 'data', 'india-locations.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');

    console.log(`OK: ${states.length} states/UTs, ${totalDistricts} districts -> ${outPath}`);
    for (const s of states) console.log(`   ${s.code}  ${s.name}: ${s.districts.length}`);
}

main().catch((err) => {
    console.error('Build failed:', err.message);
    process.exit(1);
});
