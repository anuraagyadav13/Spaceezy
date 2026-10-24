'use strict';

// Dynamic PDF quotation renderer — BROKER PAYOUT QUOTE layout.
//
// Renders the commercial quotation (itemised cost breakdown / brokerage &
// agency terms / broker commission payout schedule / terms) straight from
// the Project + Property records, exactly like the brochure philosophy: the
// WhatsApp "Property Quotation" send attaches a real, always-current PDF
// instead of a static file that goes stale after every price edit.
//
// - Public link: GET /api/v1/public/quotations?projectId=..&unit=..&by=..
//   (buildQuotationUrl below is the single builder; `by`/`customer` are
//   display-only params sanitized at render time).
// - EDITABLE VALUES: the composer sends `quote` JSON — the cost rows
//   (name / basis / amount), the brokerage percentage, the GST rate on the
//   brokerage and the payout schedule ratios. Every field is re-validated
//   here (nothing from the URL is trusted). Moving the brokerage % moves the
//   fee, the GST on it and every payout instalment with it. When no values
//   are supplied the sheet falls back to the stored project charges, so an
//   untouched send still prints a complete, honest document.
// - Money rows are REAL values only (unit price + project charge sheet +
//   the employee's own edits). Unknown rows simply do not render and an
//   unknown total prints "On request".
// - Per the CRM rule, the PDF never prints the unit's house number —
//   configuration / tower / floor identify the apartment instead.
// - Fonts are PDF standard faces (Helvetica family) — no font files to ship.

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const prisma = require('../db/prisma');
const { slugify, buildPublicApiUrl } = require('../utils/publicLink');
const { AppError } = require('../utils/errors');

// A4 portrait in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44;
const CONTENT_W = PAGE_W - M * 2; // 507.28
// Hard ceiling for every content draw — pdfkit silently appends a page the
// moment a laid-out run would render past the bottom margin.
const CONTENT_BOTTOM = PAGE_H - 62;

// Brand palette — the broker payout quote: deep navy bands, gold badge,
// soft blue total strips on white.
const C = {
    navy: '#1F3A68',
    navyInk: '#16305A',
    gold: '#E0A526',
    goldInk: '#3B2C05',
    bandText: '#C9D2E8',
    ink: '#111827',
    gray: '#6B7280',
    line: '#E5E7EB',
    wash: '#F5F6FA',
    totalBg: '#E4EBF6',
    noticeBg: '#FDF3DF',
    noticeInk: '#7A5B10',
    white: '#FFFFFF',
};

const VALIDITY_DAYS = 15;

// Brokerage defaults — the sample sheet's commercial terms. The employee
// overrides all three per send (see sanitizeQuote).
const DEFAULT_BROKER_PCT = 1.00;
const DEFAULT_GST_PCT = 18.00;
const DEFAULT_PAYOUTS = [
    { label: 'On Token Booking / Expression of Interest (Received)', ratio: 20 },
    { label: 'On Execution of Agreement to Sell / Sale Deed (Within 30 Days)', ratio: 50 },
    { label: 'On Final Registry & Handover / Full Dues Clearance', ratio: 30 },
];

// Brokerage terms printed on page 2 — the payout conditions of the quote.
const BROKERAGE_TERMS = [
    'Dynamic Ready-Move Tracking: the CRM automatically tracks milestone realization for completed inventories.',
    'Invoice Submission: brokerage invoices must be raised immediately upon the execution of each respective payment stage.',
    'Tax Compliance: all commission disbursements are subject to applicable TDS deduction as per Indian Income Tax regulations.'
];

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Indian grouping with paise, e.g. 13545000 => "Rs 1,35,45,000.00". ASCII on
// purpose: PDF standard fonts are WinAnsi-encoded and the rupee sign falls
// outside it.
const amt = (n) => `Rs ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inr = (v) => {
    const n = num(v);
    if (!isNum(n) || n <= 0) return '';
    return `Rs ${n.toLocaleString('en-IN')}`;
};
// Two-decimal percentage, e.g. 1 => "1.00%". Editable rates arrive as 12.5.
const pct = (n) => `${Number(n).toFixed(2)}%`;
const fmtDate = (d) => {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Display-only params: strip control characters, cap length. Never trusted
// for anything beyond printing.
const cleanParam = (v, max = 40) => String(v || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

// Per-send add-on line items (floor rise, modular kitchen, membership
// upgrades …) — legacy shape kept for older clients; the composer now sends
// the full editable `quote` instead. Every item is re-validated here (the
// public render route parses an unsigned query param, so nothing from the
// URL is trusted): capped count, sanitized name, bounded positive amount.
const MAX_ADDONS = 8;
const MAX_ADDON_AMOUNT = 999999999;

function sanitizeAddons(raw) {
    let list = raw;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { return []; }
    }
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list) {
        if (out.length >= MAX_ADDONS) break;
        if (!item || typeof item !== 'object') continue;
        const name = cleanParam(item.name);
        const amount = Number(item.amount);
        if (!name || !isNum(amount) || amount <= 0 || amount > MAX_ADDON_AMOUNT) continue;
        out.push({ name, amount });
    }
    return out;
}

// Full editable quotation payload — cost rows, brokerage %, GST % and the
// payout schedule. Accepted as an object (send payload) or its JSON URL
// form (public render). Returns null when nothing usable is present so the
// caller falls back to the stored-charge defaults. Bounds mirror the send
// validator; nothing from the URL is trusted beyond these.
const MAX_ROWS = 12;
const MAX_PAYOUTS = 6;

function sanitizeQuote(raw) {
    let q = raw;
    if (typeof q === 'string') {
        if (!q) return null;
        try { q = JSON.parse(q); } catch { return null; }
    }
    if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
    const out = {};

    if (Array.isArray(q.rows)) {
        const rows = [];
        for (const r of q.rows) {
            if (rows.length >= MAX_ROWS) break;
            if (!r || typeof r !== 'object') continue;
            const name = cleanParam(r.name, 60);
            const amount = Number(r.amount);
            if (!name || !isNum(amount) || amount < 0 || amount > MAX_ADDON_AMOUNT) continue;
            rows.push({ name, basis: cleanParam(r.basis, 90) || 'As applicable', amount });
        }
        if (rows.length > 0) out.rows = rows;
    }

    const rate = (value, fallback) => {
        const n = Number(value);
        return isNum(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : fallback;
    };
    if (q.brokerPct !== undefined) out.brokerPct = rate(q.brokerPct, DEFAULT_BROKER_PCT);
    if (q.gstPct !== undefined) out.gstPct = rate(q.gstPct, DEFAULT_GST_PCT);
    // Builder-direct flats carry no commission: `brokerageOn: false` pulls
    // the fee, its GST and the payout schedule off the sheet — the PDF then
    // prints "not applicable" instead of a row of zeros. Only an explicit
    // false turns it off; legacy payloads without the flag keep the
    // brokerage exactly as before.
    if (q.brokerageOn !== undefined) {
        out.brokerageOn = !(q.brokerageOn === false || q.brokerageOn === 'false' || q.brokerageOn === 0);
    }

    if (Array.isArray(q.payouts)) {
        const payouts = [];
        for (const p of q.payouts) {
            if (payouts.length >= MAX_PAYOUTS) break;
            if (!p || typeof p !== 'object') continue;
            const label = cleanParam(p.label, 90);
            const ratio = Number(p.ratio);
            if (!label || !isNum(ratio) || ratio < 0 || ratio > 100) continue;
            payouts.push({ label, ratio: Math.round(ratio * 100) / 100 });
        }
        if (payouts.length > 0) out.payouts = payouts;
    }

    return Object.keys(out).length > 0 ? out : null;
}

// Deterministic per target — re-fetching the same URL (Meta retries, CRM
// previews) must print the same reference, never a drifting random number.
function quotationRef(projectId, propertyId) {
    const digest = crypto.createHash('md5').update(`${projectId}:${propertyId || 'project'}`).digest();
    const n = (digest.readUInt16BE(0) % 9000) + 1000;
    return `QT-${new Date().getFullYear()}-${n}`;
}

const PROJECT_SELECT = {
    id: true,
    name: true,
    projectType: true,
    startingPrice: true,
    maximumPrice: true,
    pricePerSqFt: true,
    priceUnit: true,
    plcCharges: true,
    parkingCharges: true,
    clubCharges: true,
    maintenanceCharges: true,
    otherCharges: true,
    publicSlug: true,
    organization: { select: { name: true } }
};

const PROPERTY_SELECT = {
    id: true,
    projectId: true,
    configuration: true,
    bhk: true,
    tower: true,
    floor: true,
    area: true,
    areaSaleable: true,
    price: true
};

async function buildQuotationData({ organizationId, projectId, propertyId } = {}) {
    if (!projectId) {
        throw new AppError('projectId is required', 400, 'VALIDATION_ERROR');
    }
    const project = await prisma.project.findFirst({
        where: { id: projectId, ...(organizationId ? { organizationId } : {}) },
        select: PROJECT_SELECT
    });
    if (!project) throw new AppError('Project not found', 404, 'NOT_FOUND');

    let property = null;
    if (propertyId) {
        property = await prisma.property.findFirst({
            where: { id: propertyId, projectId: project.id, ...(organizationId ? { organizationId } : {}) },
            select: PROPERTY_SELECT
        });
        if (!property) throw new AppError('Unit not found', 404, 'NOT_FOUND');
    }
    return { project, property };
}

// Single builder for the quotation's public URL — used by the WhatsApp send
// (attachment metadata + provider document send) and the composer preview.
// `addons` (legacy per-send add-ons) and `quote` (the full editable sheet:
// rows / brokerage % / GST % / payout ratios) travel as JSON in the URL and
// are fully re-validated at render time. An oversized payload is dropped
// rather than producing a link Meta cannot fetch.
function buildQuotationUrl(projectId, propertyId, { by, customer, addons, quote } = {}) {
    const params = new URLSearchParams({ projectId });
    if (propertyId) params.set('unit', propertyId);
    const sender = cleanParam(by);
    const client = cleanParam(customer);
    if (sender) params.set('by', sender);
    if (client) params.set('customer', client);
    const validAddons = sanitizeAddons(addons);
    if (validAddons.length > 0) params.set('addons', JSON.stringify(validAddons));
    const validQuote = sanitizeQuote(quote);
    if (validQuote) {
        const encoded = JSON.stringify(validQuote);
        if (encoded.length <= 4000) params.set('quote', encoded);
    }
    return buildPublicApiUrl(`/public/quotations?${params.toString()}`);
}

function filenameFor(project) {
    return `${slugify(project.name) || 'project'}-quotation.pdf`;
}

// The default cost sheet — real stored money only. BSP is the unit's own
// price, or the project's starting price on project-level quotations.
// maintenanceCharges is a MONTHLY figure (the brochure prints it "/mo") —
// it must never be summed into the one-time property total, so it stays out
// of the itemised sheet entirely.
function defaultCostRows(project, property) {
    const base = property ? num(property.price) : num(project.startingPrice);
    const perSqft = inr(project.pricePerSqFt);
    const rows = [{
        name: 'Basic Sale Price (BSP)',
        basis: perSqft ? `${perSqft}/sq. ft.` : 'As per current price list',
        amount: base
    }];
    const charge = (name, basis, value) => {
        const n = num(value);
        if (isNum(n) && n > 0) rows.push({ name, basis, amount: n });
    };
    charge('Preferential Location Charges (PLC)', 'Fixed charge', project.plcCharges);
    charge('Mandatory Covered Car Parking', 'Fixed charge', project.parkingCharges);
    charge('Clubhouse Amenities Membership', 'One-time charge', project.clubCharges);
    charge('Other Statutory / Utility Charges', 'As applicable', project.otherCharges);
    return rows;
}

// The effective sheet: the employee's edited rows win outright; otherwise the
// stored charges, with legacy add-ons appended after them.
function costRows(project, property, addons = [], quote = null) {
    if (quote && Array.isArray(quote.rows) && quote.rows.length > 0) return quote.rows;
    const rows = defaultCostRows(project, property);
    for (const addon of sanitizeAddons(addons)) {
        rows.push({ name: addon.name, basis: 'Add-on (as agreed)', amount: addon.amount });
    }
    return rows;
}

// Commercial terms of the payout: brokerage % of the NET BASE VALUE (the BSP
// row), GST on that brokerage, then the payout schedule splitting the total
// payable by ratio. Every percentage is employee-editable per send, so
// nudging the brokerage % reprices the fee, its GST and each instalment.
// `brokerageOn: false` (builder-direct flats carry no commission) zeroes the
// whole payout model — the sheet then prints "not applicable" instead of a
// table of zeros.
function commercialTerms(rows, quote) {
    const brokerPct = quote && isNum(quote.brokerPct) ? quote.brokerPct : DEFAULT_BROKER_PCT;
    const gstPct = quote && isNum(quote.gstPct) ? quote.gstPct : DEFAULT_GST_PCT;
    const payouts = (quote && Array.isArray(quote.payouts) && quote.payouts.length > 0)
        ? quote.payouts
        : DEFAULT_PAYOUTS;
    const brokerageOn = !(quote && quote.brokerageOn === false);

    const bsp = rows.find((r) => /basic sale price|\bbsp\b/i.test(r.name));
    const base = bsp && isNum(bsp.amount) && bsp.amount > 0
        ? bsp.amount
        : (rows[0] && isNum(rows[0].amount) && rows[0].amount > 0 ? rows[0].amount : null);

    let fee = base != null ? (base * brokerPct) / 100 : null;
    let gst = fee != null ? (fee * gstPct) / 100 : null;
    let total = fee != null ? fee + gst : null;
    if (!brokerageOn) {
        fee = 0;
        gst = 0;
        total = 0;
    }
    const ratioSum = payouts.reduce((sum, p) => sum + (isNum(p.ratio) ? p.ratio : 0), 0);
    return { base, brokerPct, gstPct, fee, gst, total, payouts, ratioSum, brokerageOn };
}

function sectionRule(doc, y) {
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1.2).strokeColor(C.navy).stroke();
}

function sectionTitle(doc, text, y) {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.navy).text(text, M, y, { lineBreak: false });
    return y + 17;
}

function miniHeader(doc, brand, rightText) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.navy);
    doc.text(brand, M, 30, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.gold);
    doc.text(rightText, M, 33, { width: CONTENT_W, align: 'right', lineBreak: false });
    doc.moveTo(M, 50).lineTo(PAGE_W - M, 50).lineWidth(0.75).strokeColor(C.line).stroke();
}

// Footer stamped at the very end on each buffered page. Like the brochure's
// footer: two plain lineBreak:false runs with the right edge computed by hand
// — passing width/align here is what makes pdfkit auto-append a blank page
// for every footer (the "blank pages" bug).
function stampFooter(doc, page, total) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.gray);
    doc.text('Spaceezy Real Estate Brokerage Solutions — Ready-to-Move Brokerage Payout Quote',
        M, PAGE_H - 40, { lineBreak: false });
    const label = `Page ${page} of ${total}`;
    doc.text(label, PAGE_W - M - doc.widthOfString(label), PAGE_H - 40, { lineBreak: false });
}

// Two rows of label/value pairs — the commercial identity of the document in
// one scan. House numbers are deliberately absent: the configuration, tower
// and floor identify the apartment.
function drawMetaGrid(doc, y, cells) {
    const colW = CONTENT_W / 2;
    for (let row = 0; row * 2 < cells.length; row += 1) {
        for (let col = 0; col < 2 && row * 2 + col < cells.length; col += 1) {
            const { label, value } = cells[row * 2 + col];
            const x = M + col * colW;
            doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.gray);
            doc.characterSpacing = 0.5;
            doc.text(label.toUpperCase(), x, y + row * 30, { width: colW - 10, lineBreak: false });
            doc.characterSpacing = 0;
            doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ink);
            // Values ellipsize in place rather than touching the next column.
            let text = String(value);
            const w = colW - 12;
            if (doc.widthOfString(text) > w) {
                while (text.length > 4 && doc.widthOfString(`${text}…`) > w) text = text.slice(0, -1);
                text = `${text}…`;
            }
            doc.text(text, x, y + row * 30 + 11, { width: w, lineBreak: false });
        }
    }
    return y + Math.ceil(cells.length / 2) * 30 + 6;
}

// Shared table header band — navy strip, white letterspaced caption.
function tableHeader(doc, y, cols) {
    doc.roundedRect(M, y, CONTENT_W, 22, 3).fill(C.navy);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white);
    doc.characterSpacing = 0.5;
    for (const col of cols) {
        doc.text(col.label, col.x + (col.align === 'right' ? 0 : 7), y + 7.5, {
            width: col.w - 7,
            align: col.align,
            lineBreak: false
        });
    }
    doc.characterSpacing = 0;
    return y + 22;
}

// Section 1 — itemised property cost breakdown. Row heights adapt to wrapped
// names/bases, and the table continues onto a fresh page (with its header
// re-drawn) when the editable sheet runs long.
function drawCostTable(doc, y, rows) {
    const cols = [
        { label: '#', x: M, w: 24, align: 'left' },
        { label: 'COST ELEMENT / COMPONENT', x: M + 24, w: 206, align: 'left' },
        { label: 'CALCULATION BASIS', x: M + 230, w: 152, align: 'left' },
        { label: 'AMOUNT (INR)', x: M + 382, w: CONTENT_W - 382, align: 'right' }
    ];
    y = tableHeader(doc, y, cols);

    let total = 0;
    let hasUnpriced = false;
    rows.forEach((row, i) => {
        doc.font('Helvetica-Bold').fontSize(8.5);
        const nameH = doc.heightOfString(row.name, { width: cols[1].w - 12 });
        doc.font('Helvetica').fontSize(7.5);
        const basisH = doc.heightOfString(row.basis, { width: cols[2].w - 12 });
        const rowH = Math.max(26, Math.ceil(Math.max(nameH, basisH)) + 10);
        if (y + rowH > CONTENT_BOTTOM) {
            doc.addPage();
            y = tableHeader(doc, M, cols);
        }
        if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill(C.wash);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink);
        doc.text(String(i + 1).padStart(2, '0'), cols[0].x + 7, y + 8, { width: cols[0].w - 7, lineBreak: false });
        doc.text(row.name, cols[1].x + 7, y + 6, { width: cols[1].w - 12 });
        doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
            .text(row.basis, cols[2].x + 7, y + 6, { width: cols[2].w - 12 });
        if (isNum(row.amount)) {
            total += row.amount;
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
                .text(amt(row.amount), cols[3].x, y + 8, { width: cols[3].w, align: 'right', lineBreak: false });
        } else {
            hasUnpriced = true;
            doc.font('Helvetica').fontSize(8).fillColor(C.gray)
                .text('On request', cols[3].x, y + 8, { width: cols[3].w, align: 'right', lineBreak: false });
        }
        y += rowH;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.4).strokeColor(C.line).stroke();
    });

    if (y + 32 > CONTENT_BOTTOM) {
        doc.addPage();
        y = M;
    }
    // Total band — honest about an unpriced BSP instead of faking a sum.
    doc.roundedRect(M, y + 6, CONTENT_W, 28, 4).fill(C.totalBg);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy);
    doc.text('TOTAL NET PROPERTY VALUE (Inclusive of Taxes)', M + 11, y + 15, { lineBreak: false });
    const totalText = hasUnpriced
        ? (total > 0 ? `${amt(total)} + items on request` : 'On request')
        : amt(total);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy)
        .text(totalText, M, y + 14, { width: CONTENT_W - 11, align: 'right', lineBreak: false });
    return { y: y + 40, total, hasUnpriced };
}

// Section 2 — commercial brokerage & agency terms. The percentages come from
// the employee's edits, so this table is what repricing writes to.
function drawBrokerageTable(doc, y, terms) {
    // Builder-direct deal — no commission exists to itemise: one clear note
    // replaces the fee/GST rows (a table of zeros would read like a real
    // charge) and the total band states NIL.
    if (terms.brokerageOn === false) {
        const boxH = 44;
        doc.lineWidth(0.5).roundedRect(M, y, CONTENT_W, boxH, 4).fillAndStroke(C.wash, C.line);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy);
        doc.text('NOT APPLICABLE — NO BROKERAGE OR GST ON THIS DEAL', M + 11, y + 10, { lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(C.gray);
        doc.text('Direct builder booking — no professional brokerage fee, GST or commission payout applies.', M + 11, y + 26, { lineBreak: false });
        y += boxH;
        doc.roundedRect(M, y + 6, CONTENT_W, 28, 4).fill(C.totalBg);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.navy);
        doc.text('TOTAL BROKERAGE PAYABLE (By Authorized Seller/Client)', M + 11, y + 15, { lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy);
        doc.text('NIL', M, y + 14, { width: CONTENT_W - 11, align: 'right', lineBreak: false });
        return y + 40;
    }
    const cols = [
        { label: 'SERVICE DESCRIPTION', x: M, w: 248, align: 'left' },
        { label: 'FEE PERCENTAGE / RATE', x: M + 248, w: 128, align: 'right' },
        { label: 'FEE RECEIVABLE (INR)', x: M + 376, w: CONTENT_W - 376, align: 'right' }
    ];
    y = tableHeader(doc, y, cols);
    const org = terms.orgName;

    const rows = [
        {
            name: `${org} Professional Brokerage Fee`,
            rate: `${pct(terms.brokerPct)} of Net Base Value`,
            value: terms.fee
        },
        {
            name: 'Applicable GST on Professional Brokerage',
            rate: `${pct(terms.gstPct)} Statutory Rate`,
            value: terms.gst
        }
    ];
    rows.forEach((row, i) => {
        const rowH = 26;
        if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill(C.wash);
        doc.font('Helvetica').fontSize(8.5).fillColor(C.ink);
        doc.text(row.name, cols[0].x + 7, y + 8, { width: cols[0].w - 12, lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(C.gray)
            .text(row.rate, cols[1].x, y + 8.5, { width: cols[1].w, align: 'right', lineBreak: false });
        if (isNum(row.value)) {
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
                .text(amt(row.value), cols[2].x, y + 8, { width: cols[2].w, align: 'right', lineBreak: false });
        } else {
            doc.font('Helvetica').fontSize(8).fillColor(C.gray)
                .text('On request', cols[2].x, y + 8.5, { width: cols[2].w, align: 'right', lineBreak: false });
        }
        y += rowH;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.4).strokeColor(C.line).stroke();
    });

    doc.roundedRect(M, y + 6, CONTENT_W, 28, 4).fill(C.totalBg);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.navy);
    doc.text('TOTAL BROKERAGE PAYABLE (By Authorized Seller/Client)', M + 11, y + 15, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy)
        .text(isNum(terms.total) ? amt(terms.total) : 'On request', M, y + 14, {
            width: CONTENT_W - 11,
            align: 'right',
            lineBreak: false
        });
    return y + 40;
}

// Section 3 — broker commission payout schedule. Each instalment is its
// ratio of the TOTAL BROKERAGE PAYABLE, so a repriced brokerage moves the
// whole schedule with it.
function drawPayoutTable(doc, y, terms) {
    // No commission → no instalments: a single note stands in for the
    // schedule, for the same reason as the section-2 note above.
    if (terms.brokerageOn === false) {
        const boxH = 44;
        doc.lineWidth(0.5).roundedRect(M, y, CONTENT_W, boxH, 4).fillAndStroke(C.wash, C.line);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy);
        doc.text('NOT APPLICABLE — NO COMMISSION PAYOUT ON THIS DEAL', M + 11, y + 10, { lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(C.gray);
        doc.text('The payout schedule applies only when a brokerage fee is charged on the deal.', M + 11, y + 26, { lineBreak: false });
        return y + boxH + 6;
    }
    const cols = [
        { label: 'STAGE', x: M, w: 34, align: 'left' },
        { label: 'BROKERAGE PAYOUT MILESTONE EVENT', x: M + 34, w: 246, align: 'left' },
        { label: 'PAYOUT RATIO (%)', x: M + 280, w: 86, align: 'right' },
        { label: 'COMMISSION RECEIVABLE (INR)', x: M + 366, w: CONTENT_W - 366, align: 'right' }
    ];
    y = tableHeader(doc, y, cols);

    terms.payouts.forEach((p, i) => {
        const rowH = 26;
        if (y + rowH + 34 > CONTENT_BOTTOM) {
            doc.addPage();
            y = tableHeader(doc, M, cols);
        }
        if (i % 2 === 1) doc.rect(M, y, CONTENT_W, rowH).fill(C.wash);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink);
        doc.text(String(i + 1).padStart(2, '0'), cols[0].x + 7, y + 8, { width: cols[0].w - 7, lineBreak: false });
        doc.font('Helvetica').fontSize(8.5)
            .text(p.label, cols[1].x + 7, y + 8, { width: cols[1].w - 12, lineBreak: false });
        doc.font('Helvetica').fontSize(8.5).fillColor(C.gray)
            .text(pct(p.ratio), cols[2].x, y + 8, { width: cols[2].w, align: 'right', lineBreak: false });
        if (isNum(terms.total)) {
            doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink)
                .text(amt((terms.total * p.ratio) / 100), cols[3].x, y + 8, {
                    width: cols[3].w,
                    align: 'right',
                    lineBreak: false
                });
        } else {
            doc.font('Helvetica').fontSize(8).fillColor(C.gray)
                .text('As per agreement', cols[3].x, y + 8.5, { width: cols[3].w, align: 'right', lineBreak: false });
        }
        y += rowH;
        doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.4).strokeColor(C.line).stroke();
    });

    doc.roundedRect(M, y + 6, CONTENT_W, 28, 4).fill(C.totalBg);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.navy);
    doc.text('TOTAL BROKERAGE PAYOUT RECOVERY', M + 11, y + 15, { lineBreak: false });
    doc.text(pct(terms.ratioSum), M, y + 15, { width: 420, align: 'right', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.navy)
        .text(isNum(terms.total) ? amt(terms.total) : 'On request', M, y + 14, {
            width: CONTENT_W - 11,
            align: 'right',
            lineBreak: false
        });
    return y + 40;
}

function drawBrokerageTerms(doc, y, brokerageOn = true) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.navy);
    doc.text(
        brokerageOn === false ? 'BROKERAGE TERMS & CONDITIONS' : 'CRITICAL BROKERAGE TERMS & CONDITIONS',
        M, y, { lineBreak: false }
    );
    y += 14;
    if (brokerageOn === false) {
        // One honest line instead of commission payout conditions that no
        // longer apply to this deal.
        const note = 'Not applicable — no brokerage or GST is charged on this direct builder booking; the standard project payment terms govern the transaction.';
        doc.font('Helvetica').fontSize(8).fillColor(C.gray);
        const h = doc.heightOfString(note, { width: CONTENT_W - 8, lineGap: 2 });
        doc.text(note, M + 2, y, { width: CONTENT_W - 8, lineGap: 2 });
        return y + h + 4;
    }
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.ink);
    for (const bullet of BROKERAGE_TERMS) {
        const h = Math.min(doc.heightOfString(`• ${bullet}`, { width: CONTENT_W - 8, lineGap: 2 }), 40);
        if (y + h > CONTENT_BOTTOM) {
            doc.addPage();
            y = M;
        }
        doc.text(`• ${bullet}`, M + 2, y, { width: CONTENT_W - 8, lineGap: 2, height: h, ellipsis: true });
        y += h + 5;
    }
    return y;
}

function drawSignatures(doc, y) {
    const colW = (CONTENT_W - 40) / 2;
    const blocks = [
        ['Prepared & Validated by', 'Spaceezy CRM Core'],
        ['Approved by Management / Finance Desk', '']
    ];
    blocks.forEach(([title, name], i) => {
        const x = M + i * (colW + 40);
        doc.moveTo(x, y).lineTo(x + colW, y).lineWidth(0.7).strokeColor(C.ink).stroke();
        doc.font('Helvetica').fontSize(7.5).fillColor(C.gray);
        doc.text(title, x, y + 5, { width: colW, lineBreak: false });
        if (name) {
            doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink);
            doc.text(name, x, y + 16, { width: colW, lineBreak: false });
        }
    });
    return y + 40;
}

async function generateQuotation({ projectId, propertyId, by, customer, organizationId, addons, quote } = {}) {
    const { project, property } = await buildQuotationData({ organizationId, projectId, propertyId });
    const sender = cleanParam(by);
    const client = cleanParam(customer);
    const ref = quotationRef(project.id, property ? property.id : null);
    const generated = new Date();
    const expiry = new Date(generated.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    const orgName = cleanParam(project.organization?.name, 40) || 'Spaceezy';
    const validQuote = sanitizeQuote(quote);
    const rows = costRows(project, property, addons, validQuote);
    const terms = commercialTerms(rows, validQuote);
    // Brand strings on the document print the plain brand — never the stored
    // org name, which can carry tenant/demo text on live installs.
    terms.orgName = 'Spaceezy';

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: M,
            bufferPages: true,
            info: {
                Title: `${project.name} — Broker Payout Quote`,
                Author: orgName,
                Subject: 'Brokerage payout quotation',
                Creator: 'Spaceezy CRM'
            }
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: filenameFor(project), ref }));
        doc.on('error', reject);
        try {
            // --- Page 1: header, notice, identity, cost + brokerage tables ---
            doc.roundedRect(M, 28, CONTENT_W, 56, 6).fill(C.navy);
            doc.font('Helvetica-Bold').fontSize(16).fillColor(C.white);
            // Brand heading — prints the brand only. The stored org name can
            // carry tenant/demo text (e.g. "SpaceEzy Demo Organization")
            // which has no place on a customer-facing quote.
            doc.text('SPACEEZY', M + 14, 40, { lineBreak: false });
            doc.font('Helvetica').fontSize(7.5).fillColor(C.bandText);
            doc.text('READY-MOVE PROPERTY BROKERAGE & PAYOUT QUOTATION', M + 14, 62, { lineBreak: false });

            // Validity notice — the one thing that must never be missed.
            let y = 96;
            // The window mirrors VALIDITY_DAYS — the same constant the
            // Expiry Date below is computed from. ⚠ is outside the PDF
            // WinAnsi charset, so the triangle is drawn as vector art next
            // to the text; the run of text itself stays printable.
            const notice = `CRITICAL VALIDITY NOTICE: This commercial quotation is strictly valid for a period of ${VALIDITY_DAYS} days from the generation date. Prices, inventories, and promotional offers are subject to change or withdrawal thereafter.`;
            doc.font('Helvetica-Bold').fontSize(7.5);
            const noticeH = Math.min(doc.heightOfString(notice, { width: CONTENT_W - 52, lineGap: 2.5 }), 56);
            doc.roundedRect(M, y, CONTENT_W, noticeH + 14, 6).fill(C.noticeBg);
            // ⚠ warning triangle: apex up, ink fill, white exclamation
            // struck through the middle.
            const triY = y + 8;
            doc.save();
            doc.moveTo(M + 17, triY)
                .lineTo(M + 26, triY + 15)
                .lineTo(M + 8, triY + 15)
                .closePath()
                .fill(C.noticeInk);
            doc.restore();
            doc.font('Helvetica-Bold').fontSize(8).fillColor(C.white);
            doc.text('!', M + 16, triY + 5, { lineBreak: false });
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.noticeInk).text(notice, M + 34, y + 7, {
                width: CONTENT_W - 47,
                lineBreak: true,
                lineGap: 2.5,
                height: noticeH,
                ellipsis: true
            });
            y += noticeH + 26;

            const area = property ? (num(property.areaSaleable) || num(property.area)) : null;
            const config = property
                ? (property.configuration || (property.bhk ? `${property.bhk} BHK` : '—'))
                : (project.projectType || '—');
            y = drawMetaGrid(doc, y, [
                { label: 'Quotation Ref', value: ref },
                { label: 'Client Name', value: client || 'Valued Customer' },
                { label: 'Generation Date', value: fmtDate(generated) },
                {
                    label: 'Project & Tower',
                    value: property && property.tower ? `${project.name}, Tower ${property.tower}` : project.name
                },
                { label: 'Expiry Date', value: fmtDate(expiry) },
                {
                    label: 'Unit Type / Floor',
                    // House numbers stay inside the CRM: configuration + floor.
                    value: property && property.floor != null ? `${config} · Floor ${property.floor}` : config
                },
                { label: 'Sales Consultant', value: sender || 'Sales Desk' },
                {
                    label: 'Super Area Type',
                    value: area ? `${Number(area).toLocaleString('en-IN')} Sq. Ft. (${config})` : config
                }
            ]);

            y = sectionTitle(doc, '1. ITEMIZED PROPERTY COST BREAKDOWN (READY-MOVE)', y);
            sectionRule(doc, y - 4);
            y += 4;
            const cost = drawCostTable(doc, y, rows);
            y = cost.y + 8;
            if (y < CONTENT_BOTTOM) {
                doc.font('Helvetica').fontSize(7).fillColor(C.gray);
                doc.text(
                    cost.hasUnpriced
                        ? 'Basic sale price is available on request — other applicable charges are shown above.'
                        : 'Amounts reflect the current price list at generation time. Statutory charges are additional.',
                    M, y, { lineBreak: false }
                );
                y += 20;
            } else {
                y = CONTENT_BOTTOM;
            }

            if (y + 150 > CONTENT_BOTTOM) {
                doc.addPage();
                y = M + 10;
            }
            y = sectionTitle(doc, '2. COMMERCIAL BROKERAGE & AGENCY TERMS', y);
            sectionRule(doc, y - 4);
            y += 4;
            y = drawBrokerageTable(doc, y, terms);

            // --- Page 2: payout schedule, terms, signatures ---
            doc.addPage();
            miniHeader(doc, 'SPACEEZY', `BROKER PAYOUT QUOTE · ${ref}`);
            y = 70;
            y = sectionTitle(doc, '3. BROKER COMMISSION PAYOUT SCHEDULE (READY-MOVE / RESALE PLAN)', y);
            sectionRule(doc, y - 4);
            y += 4;
            y = drawPayoutTable(doc, y, terms) + 12;
            y = drawBrokerageTerms(doc, y, terms.brokerageOn) + 16;
            if (y + 60 > CONTENT_BOTTOM) {
                doc.addPage();
                y = M + 20;
            }
            drawSignatures(doc, y);

            const range = doc.bufferedPageRange();
            for (let i = 0; i < range.count; i += 1) {
                doc.switchToPage(range.start + i);
                stampFooter(doc, i + 1, range.count);
            }
        } catch (err) {
            reject(err);
            return;
        }
        doc.end();
    });
}

module.exports = {
    buildQuotationData,
    buildQuotationUrl,
    generateQuotation,
    sanitizeAddons,
    sanitizeQuote,
    VALIDITY_DAYS
};
