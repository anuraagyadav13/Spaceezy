// Phase 17: quotation PDF pipeline — public render + WhatsApp attachment +
// quotation record filing + the house-number-free message contract.
//
// Covers the "Send Quotation" feature end to end at the contract level:
// - GET /public/quotations renders a real two-page PDF (%PDF magic, correct
//   filename, content headers) from live project + optional unit data;
// - validation: malformed ids / oversized display params answer 400, unknown
//   project and unknown unit both answer 404 (no existence oracle);
// - money rows are REAL stored values only — the monthly maintenance figure
//   is never summed into the one-time property total;
// - the PDF never prints a house number (A-101 / A-102): tower, floor,
//   configuration and area identify the apartment instead;
// - a send with `attachment.kind: 'quotation'` persists the public quotation
//   link + filename and files a SENT Quotation record (the existing pipeline
//   entity booking conversion reads) with the same money the PDF prints;
// - `pdf: false` sends text alone — no attachment, no quotation record;
// - without `kind` nothing attaches and an explicit `brochure` kind is
//   rejected with 400: brochure PDFs are never sent to clients (removed),
//   even when the project has one on file;
// - template catalog contract: no body declares {{property_name}} (house
//   numbers never go out), the Property Quotation entry exists, and a stale
//   provisioned row renders against the current catalog definition.
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    lead: { findFirst: jest.fn() },
    leadActivity: { create: jest.fn() },
    project: { findFirst: jest.fn() },
    property: { findFirst: jest.fn(), findMany: jest.fn() },
    quotation: { create: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppMessage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    whatsappSettings: { findUnique: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');
const { resetWhatsAppProvider } = require('../src/providers/whatsapp');
const MockWhatsAppProvider = require('../src/providers/whatsapp/mockProvider');
const { generateQuotation, buildQuotationUrl } = require('../src/services/quotationPdf');
const { listCatalog, getCatalogEntry } = require('../src/services/templateCatalog');

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const UNIT = '33333333-3333-4333-8333-333333333333';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV = 'fffffff1-ffff-4fff-8fff-ffffffffffff';
const ADMIN_ID = 'admin-user-1';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const cookie = (jar) => `spaceezy_session=${jar}`;

const convRow = (overrides = {}) => ({
  id: CONV,
  organizationId: ORG,
  leadId: LEAD,
  customerId: null,
  provider: 'mock',
  providerContactId: '919876543210',
  status: 'ACTIVE',
  lastMessageAt: new Date(),
  lead: { id: LEAD, name: 'Kamal', phone: '919876543210', status: 'NEW', assignedToId: ADMIN_ID },
  customer: null,
  ...overrides,
});

// Shapes consumed by PROJECT_SELECT / PROPERTY_SELECT and the render code.
const projectRow = (overrides = {}) => ({
  id: PROJECT,
  name: 'Skyline Residency',
  projectType: 'Residential',
  startingPrice: '6800000',
  pricePerSqFt: '7158',
  priceUnit: null,
  plcCharges: '250000',
  parkingCharges: '400000',
  clubCharges: '150000',
  // Monthly figure (the brochure prints it "/mo") — must never be summed
  // into the quotation's one-time property total.
  maintenanceCharges: '4500',
  otherCharges: '50000',
  publicSlug: 'skyline-residency-ee27e7',
  organization: { name: 'Spaceezy Realty' },
  ...overrides,
});

const unitRow = (overrides = {}) => ({
  id: UNIT,
  projectId: PROJECT,
  configuration: '2 BHK',
  bhk: 2,
  tower: 'A',
  floor: 3,
  area: 950,
  areaSaleable: 950,
  price: '6800000',
  ...overrides,
});

// Minimal PDF text extraction for assertions: inflate content streams, join
// pdfkit's hex/literal TJ fragments with no separator (kerning splits runs),
// one string per BT/ET text block. Mirrors phase16's helper.
const zlib = require('zlib');
function pdfText(pdf) {
  const s = pdf.toString('latin1');
  const parts = [];
  let from = 0;
  for (;;) {
    let i = s.indexOf('stream', from);
    if (i < 0) break;
    if (s.slice(i - 3, i) === 'end') { from = i + 6; continue; }
    let start = i + 6;
    if (s[start] === '\r') start += 1;
    if (s[start] === '\n') start += 1;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    let content = '';
    try { content = zlib.inflateSync(pdf.subarray(start, end)).toString('latin1'); } catch { /* fonts/images */ }
    if (content.includes('BT')) {
      for (const bt of content.split('BT').slice(1)) {
        const et = bt.indexOf('ET');
        const seg = et >= 0 ? bt.slice(0, et) : bt;
        const run = [];
        const tj = /\[([^\]]*)\]\s*TJ/g;
        let m;
        while ((m = tj.exec(seg))) {
          for (const h of m[1].match(/<([0-9A-Fa-f]+)>/g) || []) {
            run.push(Buffer.from(h.slice(1, -1), 'hex').toString('latin1'));
          }
          for (const l of m[1].match(/\((?:\\[\s\S]|[^\\()])*\)/g) || []) {
            run.push(l.slice(1, -1).replace(/\\([()\\])/g, '$1'));
          }
        }
        if (run.length > 0) parts.push(run.join(''));
      }
    }
    from = end + 9;
  }
  return parts.join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_PROVIDER = 'mock';
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  resetWhatsAppProvider();
  mockSession('ADMIN', ADMIN_ID);
  prisma.organization.findFirst.mockResolvedValue({ id: ORG });
  prisma.user.findFirst.mockResolvedValue({ name: 'Priya Sharma' });
  prisma.whatsappSettings.findUnique.mockResolvedValue(null);
  prisma.whatsappSettings.findMany.mockResolvedValue([]);
  prisma.whatsAppConversation.findFirst.mockResolvedValue(convRow());
  prisma.whatsAppMessage.create.mockImplementation(async ({ data }) => ({
    id: 'msg-1',
    createdAt: new Date(),
    ...data,
  }));
  prisma.whatsAppMessage.findMany.mockResolvedValue([]);
  prisma.whatsAppMessage.count.mockResolvedValue(0);
  prisma.leadActivity.create.mockResolvedValue({ id: 'act-1' });
  prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  prisma.quotation.create.mockResolvedValue({ id: 'q-1' });
  prisma.project.findFirst.mockResolvedValue(projectRow());
  prisma.property.findFirst.mockResolvedValue(unitRow());
});

afterEach(() => {
  jest.restoreAllMocks();
});

const quotationUrl = (extra = '') => `/api/v1/public/quotations?projectId=${PROJECT}${extra}`;

describe('Phase 17: quotation PDF render', () => {
  test('renders a two-page, house-number-free quotation from live data', async () => {
    const { buffer, filename, ref } = await generateQuotation({
      projectId: PROJECT,
      propertyId: UNIT,
      by: 'Priya Sharma',
      customer: 'Kamal',
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(filename).toBe('skyline-residency-quotation.pdf');
    expect(ref).toMatch(/^QT-\d{4}-\d{4}$/);
    expect((buffer.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length).toBe(2);

    const text = pdfText(buffer);
    expect(text).toContain('BROKER PAYOUT QUOTE'); // page-2 running header (page-1 gold badge removed)
    expect(text).toContain('READY-MOVE PROPERTY BROKERAGE & PAYOUT QUOTATION');
    expect(text).toContain(ref);
    expect(text).toContain('Priya Sharma'); // sales consultant line
    expect(text).toContain('Kamal'); // customer line
    expect(text).toContain('CRITICAL VALIDITY NOTICE'); // replaced the old internal notice
    expect(text).not.toContain('INTERNAL CRM NOTICE');
    expect(text).toContain('Basic Sale Price');
    // Real stored money only: unit price + the project's charge sheet.
    expect(text).toContain('Rs 68,00,000.00');
    expect(text).toContain('Rs 2,50,000.00'); // PLC
    expect(text).toContain('Rs 4,00,000.00'); // parking
    expect(text).toContain('Rs 1,50,000.00'); // clubhouse
    expect(text).toContain('Rs 50,000.00'); // other statutory
    expect(text).toContain('TOTAL NET PROPERTY VALUE');
    expect(text).toContain('Rs 76,50,000.00'); // 68L + 2.5L + 4L + 1.5L + 0.5L
    // Monthly maintenance is NOT part of the one-time property total.
    expect(text).not.toContain('Maintenance');
    expect(text).not.toContain('Rs 4,500.00');
    // Brokerage terms: 1% of the net base value (68L) + 18% GST on it.
    expect(text).toContain('COMMERCIAL BROKERAGE & AGENCY TERMS');
    expect(text).toContain('1.00% of Net Base Value');
    expect(text).toContain('Rs 68,000.00'); // brokerage fee
    expect(text).toContain('18.00% Statutory Rate');
    expect(text).toContain('Rs 12,240.00'); // GST on brokerage
    expect(text).toContain('TOTAL BROKERAGE PAYABLE');
    expect(text).toContain('Rs 80,240.00');
    // Payout schedule splits the total brokerage payable by ratio.
    expect(text).toContain('BROKER COMMISSION PAYOUT SCHEDULE');
    expect(text).toContain('20.00%');
    expect(text).toContain('Rs 16,048.00'); // 20% of 80,240
    expect(text).toContain('TOTAL BROKERAGE PAYOUT RECOVERY');
    expect(text).toContain('100.00%');
    expect(text).toContain('Page 1 of 2');
    expect(text).toContain('Page 2 of 2');
    // House numbers never appear anywhere in the document.
    expect(text).not.toContain('A-101');
    expect(text).not.toContain('A-102');
    // The apartment is identified by tower / floor / area instead.
    expect(text).toContain('Tower A');
    expect(text).toContain('Floor 3');
    expect(text).toContain('950 Sq. Ft.');
  });

  test('reference is deterministic per target across renders', async () => {
    const first = await generateQuotation({ projectId: PROJECT, propertyId: UNIT });
    const second = await generateQuotation({ projectId: PROJECT, propertyId: UNIT });
    expect(second.ref).toBe(first.ref);

    const projectScoped = await generateQuotation({ projectId: PROJECT });
    expect(projectScoped.ref).not.toBe(first.ref);
    expect(projectScoped.ref).toMatch(/^QT-\d{4}-\d{4}$/);
  });

  test('project-level render prices from the starting price and stays two pages', async () => {
    const { buffer, ref } = await generateQuotation({ projectId: PROJECT });
    expect((buffer.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length).toBe(2);
    const text = pdfText(buffer);
    expect(text).toContain('Rs 68,00,000.00'); // startingPrice
    expect(text).toContain(ref);
    expect(text).not.toContain('A-101');
  });

  test('per-send add-on values render as cost rows and join the total', async () => {
    const { buffer } = await generateQuotation({
      projectId: PROJECT,
      propertyId: UNIT,
      addons: [
        { name: 'Floor rise', amount: 200000 },
        { name: 'Modular kitchen package', amount: 150000 },
        // Invalid entries never render (nothing from the URL is trusted).
        { name: 'Sneaky discount', amount: -100000 },
        { name: 'x'.repeat(120), amount: 999999999999 },
      ],
    });

    const text = pdfText(buffer);
    expect(text).toContain('Floor rise');
    expect(text).toContain('Modular kitchen package');
    expect(text).toContain('Rs 2,00,000.00');
    expect(text).toContain('Rs 1,50,000.00');
    expect(text).not.toContain('Sneaky discount');
    // Total now includes the add-ons: 68L + 2.5L + 4L + 1.5L + 0.5L + 2L + 1.5L.
    expect(text).toContain('Rs 80,00,000.00');
    expect((buffer.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length).toBe(2);
  });

  test('editable rows replace the stored sheet and recompute the brokerage', async () => {
    const { buffer } = await generateQuotation({
      projectId: PROJECT,
      propertyId: UNIT,
      quote: {
        rows: [
          { name: 'Basic Sale Price (BSP)', basis: 'Rs 8,500/sq. Ft.', amount: 14025000 },
          { name: 'Preferential Location Charges (PLC)', basis: 'Floor + Park Facing', amount: 330000 },
          { name: 'Mandatory Covered Car Parking', basis: 'Fixed (1 Reserve Bay)', amount: 350000 },
          { name: 'Clubhouse Amenities Membership', basis: 'Fixed One-Time Charge', amount: 200000 },
          { name: 'EDC & IDC (Infrastructure Dev.)', basis: 'Fixed Rs 120 per Sq. Ft.', amount: 198000 },
          { name: 'Power Backup Installation (5 KVA)', basis: 'Fixed Infrastructure Unit Cost', amount: 95000 },
          { name: 'Fire Fighting & Safety Levies', basis: 'Fixed Mandatory Statutory Fee', amount: 45000 },
          { name: 'Interest-Free Maintenance Security (IFMS)', basis: 'Rs 100 per Sq. Ft. (At Handover)', amount: 165000 },
          { name: 'Estimated GST / Stamp Duty', basis: 'Ready-Move Standard Rate', amount: 755375 },
          // Junk the renderer must never trust.
          { name: '', amount: 100 },
          { name: 'Too expensive', amount: 1e13 },
        ],
      },
    });

    const text = pdfText(buffer);
    // The edited rows print verbatim; the junk rows are dropped.
    expect(text).toContain('Rs 1,40,25,000.00');
    expect(text).toContain('Mandatory Covered Car Parking');
    expect(text).toContain('EDC & IDC (Infrastructure Dev.)');
    expect(text).toContain('Interest-Free Maintenance Security (IFMS)');
    expect(text).not.toContain('Too expensive');
    // TOTAL NET PROPERTY VALUE = sum of the edited rows.
    expect(text).toContain('Rs 1,61,63,375.00');
    // The stored charges are replaced, not appended.
    expect(text).not.toContain('Rs 68,00,000.00');
    // Brokerage defaults to 1% of the NET BASE VALUE (the BSP row).
    expect(text).toContain('Rs 1,40,250.00');
    expect(text).toContain('Rs 25,245.00'); // 18% GST on the fee
    expect(text).toContain('Rs 1,65,495.00'); // total brokerage payable
    // Default payout ratios split that total.
    expect(text).toContain('Rs 33,099.00'); // 20%
    expect(text).toContain('Rs 82,747.50'); // 50%
    // 30% of the total payable — note the reference sample's own column
    // summed to 165,295; the rendered instalments always add up exactly.
    expect(text).toContain('Rs 49,648.50'); // 30%
    expect((buffer.toString('latin1').match(/\/Type \/Page(?!s)/g) || []).length).toBe(2);
  });

  test('raising the brokerage % reprices the fee, its GST and every instalment', async () => {
    const rows = [{ name: 'Basic Sale Price (BSP)', basis: 'Fixed', amount: 1000000 }];
    const base = await generateQuotation({ projectId: PROJECT, quote: { rows, brokerPct: 1, gstPct: 18 } });
    const raised = await generateQuotation({ projectId: PROJECT, quote: { rows, brokerPct: 2.5, gstPct: 18 } });

    const baseText = pdfText(base.buffer);
    expect(baseText).toContain('1.00% of Net Base Value');
    expect(baseText).toContain('Rs 10,000.00'); // 1% of 10L
    expect(baseText).toContain('Rs 1,800.00'); // 18% GST
    expect(baseText).toContain('Rs 11,800.00'); // total payable
    expect(baseText).toContain('Rs 2,360.00'); // 20% instalment

    const raisedText = pdfText(raised.buffer);
    expect(raisedText).toContain('2.50% of Net Base Value');
    expect(raisedText).toContain('Rs 25,000.00'); // 2.5% of 10L
    expect(raisedText).toContain('Rs 4,500.00'); // 18% GST on the new fee
    expect(raisedText).toContain('Rs 29,500.00'); // new total payable
    expect(raisedText).toContain('Rs 5,900.00'); // 20% instalment of the new total
  });

  test('editable payout ratios drive the schedule and its total row', async () => {
    const { buffer } = await generateQuotation({
      projectId: PROJECT,
      quote: {
        rows: [{ name: 'Basic Sale Price (BSP)', basis: 'Fixed', amount: 1000000 }],
        brokerPct: 1,
        gstPct: 18,
        payouts: [
          { label: 'On booking', ratio: 40 },
          { label: 'On registry', ratio: 60 },
        ],
      },
    });
    const text = pdfText(buffer);
    expect(text).toContain('On booking');
    expect(text).toContain('On registry');
    expect(text).toContain('40.00%');
    expect(text).toContain('60.00%');
    expect(text).toContain('Rs 4,720.00'); // 40% of 11,800
    expect(text).toContain('Rs 7,080.00'); // 60% of 11,800
    // The total row shows the actual ratio sum, not a hardcoded 100%.
    expect(text).toContain('100.00%');
  });

  test('brokerage can be removed for builder-direct deals', async () => {
    const { buffer } = await generateQuotation({
      projectId: PROJECT,
      propertyId: UNIT,
      quote: {
        rows: [{ name: 'Basic Sale Price (BSP)', basis: 'Fixed', amount: 1000000 }],
        brokerPct: 1.25,
        gstPct: 18,
        brokerageOn: false,
      },
    });
    const text = pdfText(buffer);
    // Sections 2 and 3 state "not applicable" instead of printing money.
    expect(text).toContain('NOT APPLICABLE');
    expect(text).toContain('NO BROKERAGE OR GST');
    expect(text).toContain('NO COMMISSION PAYOUT');
    expect(text).toContain('TOTAL BROKERAGE PAYABLE');
    expect(text).toContain('NIL');
    expect(text).not.toContain('of Net Base Value');
    expect(text).not.toContain('Statutory Rate');
    expect(text).not.toContain('Rs 12,500.00'); // no 1.25% fee
    expect(text).not.toContain('Rs 2,250.00'); // no GST on it
    expect(text).not.toContain('TOTAL BROKERAGE PAYOUT RECOVERY'); // no schedule
    expect(text).not.toContain('CRITICAL BROKERAGE'); // neutral terms block
    // The property value itself still prints — only commission is gone.
    expect(text).toContain('Rs 10,00,000.00');
    expect(text).toContain('TOTAL NET PROPERTY VALUE');
  });

  test('sanitizeQuote bounds everything from the URL', () => {
    const { sanitizeQuote } = require('../src/services/quotationPdf');
    // JSON string form (the public render route).
    expect(sanitizeQuote('not json')).toBeNull();
    expect(sanitizeQuote('')).toBeNull();
    expect(sanitizeQuote(null)).toBeNull();
    const ok = sanitizeQuote(JSON.stringify({
      rows: [{ name: 'BSP', basis: 'Fixed', amount: 100 }],
      brokerPct: 12.5,
      gstPct: 18,
      payouts: [{ label: 'Stage one', ratio: 100 }],
      brokerageOn: false,
    }));
    expect(ok.rows).toHaveLength(1);
    expect(ok.brokerPct).toBe(12.5);
    expect(ok.payouts[0].ratio).toBe(100);
    expect(ok.brokerageOn).toBe(false); // the switch survives the URL round-trip
    // Out-of-range percentages fall back to the defaults; junk rows drop.
    const clamped = sanitizeQuote({ rows: [{ name: '', amount: 5 }, { name: 'ok', amount: -1 }], brokerPct: 999, gstPct: -3 });
    expect(clamped.rows).toBeUndefined();
    expect(clamped.brokerPct).toBe(1);
    expect(clamped.gstPct).toBe(18);
    // Brokerage stays ON unless the flag is an explicit false.
    expect(sanitizeQuote({ rows: [{ name: 'ok', amount: 5 }] }).brokerageOn).toBeUndefined();
    expect(sanitizeQuote({ rows: [{ name: 'ok', amount: 5 }], brokerageOn: true }).brokerageOn).toBe(true);
    expect(sanitizeQuote({ rows: [{ name: 'ok', amount: 5 }], brokerageOn: 'false' }).brokerageOn).toBe(false);
  });
});

describe('Phase 17: public quotation endpoint', () => {
  test('renders a real PDF with correct headers', async () => {
    const res = await request(app).get(quotationUrl());

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('skyline-residency-quotation.pdf');
    expect(res.headers['cache-control']).toContain('max-age');

    const direct = await generateQuotation({ projectId: PROJECT });
    expect(direct.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(direct.buffer.length).toBeGreaterThan(2000);
  });

  test('scopes the render to a unit inside that project and carries display params', async () => {
    const res = await request(app).get(quotationUrl(`&unit=${UNIT}&by=Priya+Sharma&customer=Kamal`));

    expect(res.status).toBe(200);
    expect(prisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: UNIT, projectId: PROJECT }),
      })
    );
    const text = pdfText(res.body);
    expect(text).toContain('Priya Sharma');
    expect(text).toContain('Kamal');
  });

  test('malformed ids and oversized display params answer 400 without touching the database', async () => {
    const res = await request(app).get('/api/v1/public/quotations?projectId=not-a-uuid');
    expect(res.status).toBe(400);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();

    const res2 = await request(app).get(quotationUrl('&unit=also-not-a-uuid'));
    expect(res2.status).toBe(400);

    const res3 = await request(app).get(quotationUrl(`&by=${'x'.repeat(61)}`));
    expect(res3.status).toBe(400);
  });

  test('unknown project and unknown unit both answer 404', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    const missingProject = await request(app).get(quotationUrl());
    expect(missingProject.status).toBe(404);

    prisma.project.findFirst.mockResolvedValue(projectRow());
    prisma.property.findFirst.mockResolvedValue(null);
    const missingUnit = await request(app).get(quotationUrl(`&unit=${UNIT}`));
    expect(missingUnit.status).toBe(404);
  });

  test('renders per-send add-ons passed as a query param', async () => {
    const addons = encodeURIComponent(JSON.stringify([
      { name: 'Floor rise', amount: 200000 },
      { name: 'Junk', amount: 'NaN' },
    ]));
    const res = await request(app).get(quotationUrl(`&addons=${addons}`));

    expect(res.status).toBe(200);
    const text = pdfText(res.body);
    expect(text).toContain('Floor rise');
    expect(text).not.toContain('Junk');
  });
});

describe('Phase 17: WhatsApp quotation URL builder', () => {
  test('builds the public link with sanitized display-only params', () => {
    const url = buildQuotationUrl(PROJECT, UNIT, { by: 'A B', customer: 'Kamal' });
    expect(url).toContain('/public/quotations?');
    expect(url).toContain(`projectId=${PROJECT}`);
    expect(url).toContain(`unit=${UNIT}`);
    expect(url).toContain('by=A+B');
    expect(url).toContain('customer=Kamal');

    const bare = buildQuotationUrl(PROJECT, null, {});
    expect(bare).not.toContain('unit=');
    expect(bare).not.toContain('by=');
    expect(bare).not.toContain('customer=');
    expect(bare).not.toContain('addons=');
  });

  test('carries per-send add-on values and drops invalid ones', () => {
    const url = buildQuotationUrl(PROJECT, UNIT, {
      addons: [
        { name: 'Floor rise', amount: 200000 },
        { name: 'Bad', amount: -5 },        // non-positive: dropped
        { name: '', amount: 1000 },          // nameless: dropped
        { name: 'x'.repeat(80), amount: 999999999999 }, // over cap: dropped
      ],
    });
    expect(url).toContain('addons=');
    const decoded = JSON.parse(new URL(url).searchParams.get('addons'));
    expect(decoded).toEqual([{ name: 'Floor rise', amount: 200000 }]);
  });
});

describe('Phase 17: WhatsApp message with quotation attachment', () => {
  test('persists the quotation link + filename, forwards it to the provider and files the SENT record', async () => {
    const sendDocSpy = jest.spyOn(MockWhatsAppProvider.prototype, 'sendDocument');

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        body: 'Here is the quotation for Skyline Residency',
        attachment: { projectId: PROJECT, propertyId: UNIT, pdf: true, kind: 'quotation' },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.attachmentUrl).toContain('/public/quotations?projectId=');
    expect(res.body.data.attachmentUrl).toContain(`unit=${UNIT}`);
    expect(res.body.data.attachmentUrl).toContain('by=Priya+Sharma');
    expect(res.body.data.attachmentUrl).toContain('customer=Kamal');
    expect(res.body.data.attachmentName).toBe('skyline-residency-quotation.pdf');
    expect(res.body.data.providerMessageId).toMatch(/^mockwa_/);

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: CONV,
          attachmentUrl: expect.stringContaining('/public/quotations'),
          attachmentName: 'skyline-residency-quotation.pdf',
        }),
      })
    );
    expect(sendDocSpy).toHaveBeenCalledTimes(1);
    expect(sendDocSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '919876543210',
        attachment: expect.objectContaining({
          url: expect.stringContaining('/public/quotations'),
          name: 'skyline-residency-quotation.pdf',
        }),
      })
    );

    // The existing pipeline entity is filed with the same money the PDF
    // prints — the unit's own price here — valid for the documented window.
    expect(prisma.quotation.create).toHaveBeenCalledTimes(1);
    expect(prisma.quotation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG,
          leadId: LEAD,
          projectId: PROJECT,
          propertyId: UNIT,
          totalAmount: 6800000,
          status: 'SENT',
          createdById: ADMIN_ID,
          validUntil: expect.any(Date),
          notes: expect.stringContaining('skyline-residency-quotation.pdf'),
        }),
      })
    );
    const { data } = prisma.quotation.create.mock.calls[0][0];
    const days = (new Date(data.validUntil).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(14.9);
    expect(days).toBeLessThan(15.1);
  });

  test('add-ons ride the attachment URL, the record total and the notes', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        body: 'Quotation with add-ons',
        attachment: {
          projectId: PROJECT,
          propertyId: UNIT,
          pdf: true,
          kind: 'quotation',
          addons: [
            { name: 'Floor rise', amount: 200000 },
            { name: 'Modular kitchen', amount: 150000 },
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.attachmentUrl).toContain('addons=');
    // The record prints the same money the PDF does: base + add-ons.
    const { data } = prisma.quotation.create.mock.calls[0][0];
    expect(data.totalAmount).toBe(6800000 + 200000 + 150000);
    expect(data.notes).toContain('add-ons: Floor rise Rs 200000, Modular kitchen Rs 150000');
  });

  test('removed brokerage rides the URL and the record note', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        body: 'Builder-direct flat, no commission',
        attachment: {
          projectId: PROJECT,
          propertyId: UNIT,
          pdf: true,
          kind: 'quotation',
          quote: { brokerPct: 1.25, gstPct: 18, brokerageOn: false },
        },
      });

    expect(res.status).toBe(201);
    // The switch travels inside the quote JSON on the render link.
    const sent = new URL(String(res.body.data.attachmentUrl), 'http://local');
    const quote = JSON.parse(sent.searchParams.get('quote'));
    expect(quote.brokerageOn).toBe(false);
    // The filed record says plainly that no commission was charged.
    const { data } = prisma.quotation.create.mock.calls[0][0];
    expect(data.notes).toContain('no brokerage (builder direct)');
    expect(data.totalAmount).toBe(6800000); // commission never touches the record total
  });

  test('pdf:false sends text alone — no attachment row, no quotation record', async () => {
    const sendDocSpy = jest.spyOn(MockWhatsAppProvider.prototype, 'sendDocument');

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        body: 'Quotation link only, no PDF',
        attachment: { projectId: PROJECT, propertyId: UNIT, pdf: false, kind: 'quotation' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.attachmentUrl).toBeNull();
    expect(res.body.data.attachmentName).toBeNull();
    expect(sendDocSpy).not.toHaveBeenCalled();
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  test('pdf:true without kind sends text alone — brochures never attach (back-compat)', async () => {
    // The project still HAS an uploaded brochure on file; sending without an
    // explicit `kind` must not fall back to it. Brochure sending to clients
    // was removed entirely, so the flag is ignored and nothing attaches.
    prisma.project.findFirst.mockResolvedValue(projectRow({
      documents: [{ name: 'Brochure', key: 'org/2026/10/x.pdf', storage: 'disk', url: '/uploads/org/2026/10/x.pdf' }],
    }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'Plain send, no kind', attachment: { projectId: PROJECT, propertyId: UNIT } });

    expect(res.status).toBe(201);
    expect(res.body.data.attachmentUrl).toBe(null);
    expect(res.body.data.attachmentName).toBe(null);
    expect(prisma.whatsAppMessage.create).toHaveBeenCalled();
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  test('brochure kind attaches the uploaded brochure and files no quotation', async () => {
    const sendDocSpy = jest.spyOn(MockWhatsAppProvider.prototype, 'sendDocument');
    prisma.project.findFirst.mockResolvedValue(projectRow({
      documents: [{ name: 'Brochure', key: 'org/2026/10/x.pdf', storage: 'disk', url: '/uploads/org/2026/10/x.pdf' }],
    }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'Brochure send', attachment: { projectId: PROJECT, kind: 'brochure' } });

    // Independent of the quotation: the employee's own PDF goes out and no
    // Quotation record is filed.
    expect(res.status).toBe(201);
    expect(String(res.body.data.attachmentUrl)).toContain('/public/documents?projectId=');
    expect(res.body.data.attachmentName).toContain('brochure');
    expect(sendDocSpy).toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalled();
    expect(prisma.quotation.create).not.toHaveBeenCalled();
    sendDocSpy.mockRestore();
  });

  test('brochure kind with no brochure on file is refused with 400 NO_BROCHURE', async () => {
    prisma.project.findFirst.mockResolvedValue(projectRow({ documents: [] }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'Brochure send, none uploaded', attachment: { projectId: PROJECT, kind: 'brochure' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_BROCHURE');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });

  test('brochure + quotation ride one send — two documents, two thread rows, one Quotation record', async () => {
    const sendDocSpy = jest.spyOn(MockWhatsAppProvider.prototype, 'sendDocument');
    prisma.project.findFirst.mockResolvedValue(projectRow({
      documents: [{
        name: 'Brochure',
        key: 'org/2026/10/x.pdf',
        storage: 'disk',
        url: '/uploads/org/2026/10/x.pdf',
        uploadedAt: '2026-10-23T09:19:23.272Z',
        size: 71679
      }]
    }));

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        body: 'Brochure + quotation together',
        attachment: {
          projectId: PROJECT,
          propertyId: UNIT,
          pdf: true,
          kind: 'brochure',
          kinds: ['brochure', 'quotation'],
          quote: { rows: [{ name: 'Basic Sale Price (BSP)', amount: 8500000 }] }
        }
      });

    expect(res.status).toBe(201);
    // One click, two files: WhatsApp carries one document per message, so
    // each PDF goes out as its own provider message.
    expect(sendDocSpy).toHaveBeenCalledTimes(2);
    const docUrls = sendDocSpy.mock.calls.map((c) => c[0].attachment.url);
    expect(docUrls[0]).toContain('/public/documents?projectId=');
    // The brochure link is versioned per upload — WhatsApp caches media BY
    // URL, so a replaced brochure must travel under a fresh URL or the
    // client keeps receiving the first bytes ever fetched.
    expect(docUrls[0]).toContain(`v=${encodeURIComponent('2026-10-23T09:19:23.272Z')}`);
    expect(docUrls[1]).toContain('/public/quotations?projectId=');
    expect(docUrls[1]).toContain('quote=');
    // First document carries the message text as its caption; the second
    // goes bare so the text is not duplicated on the customer's phone.
    expect(sendDocSpy.mock.calls[0][0].caption).toContain('Brochure + quotation together');
    expect(sendDocSpy.mock.calls[1][0].caption).toBe(null);

    // Two thread rows: text + brochure first, the bare quotation second.
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledTimes(2);
    const [row1, row2] = prisma.whatsAppMessage.create.mock.calls.map((c) => c[0].data);
    expect(row1.body).toContain('Brochure + quotation together');
    expect(String(row1.attachmentUrl)).toContain('/public/documents?projectId=');
    expect(row2.body).toBe('');
    expect(String(row2.attachmentUrl)).toContain('/public/quotations?projectId=');
    expect(row2.attachmentName).toBe('skyline-residency-quotation.pdf');

    // The Quotation record still files exactly once, from the quotation PDF.
    expect(prisma.quotation.create).toHaveBeenCalledTimes(1);
    expect(prisma.quotation.create.mock.calls[0][0].data.notes)
      .toContain('skyline-residency-quotation.pdf');

    // The response keeps the single-attachment shape for the composer.
    expect(String(res.body.data.attachmentUrl)).toContain('/public/documents?projectId=');
    sendDocSpy.mockRestore();
  });

  test('an unknown attachment kind is rejected with 400 before anything persists', async () => {
    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({ body: 'Bad kind', attachment: { projectId: PROJECT, kind: 'invoice' } });

    expect(res.status).toBe(400);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });
});

describe('Phase 17: house-number-free template catalog contract', () => {
  test('no catalog body or variable list carries property_name', () => {
    for (const entry of listCatalog()) {
      expect(entry.body).not.toMatch(/\{\{\s*property_name\s*\}\}/);
      expect(entry.variables).not.toContain('property_name');
    }
    const snapshot = getCatalogEntry('Property Snapshot');
    expect(snapshot).toBeTruthy();
    expect(snapshot.body).toContain('{{project_name}}');
    expect(getCatalogEntry('Price Details').body).toContain('{{project_name}}');
    expect(getCatalogEntry('Visit Reminder').body).toContain('{{project_name}}');
  });

  test('Property Quotation entry carries quotation_url in body and variables', () => {
    const entry = getCatalogEntry('Property Quotation');
    expect(entry).toBeTruthy();
    expect(entry.variables).toEqual(['customer_name', 'project_name', 'quotation_url', 'salesperson_name']);
    expect(entry.body).toContain('{{quotation_url}}');
    expect(entry.body).not.toMatch(/\{\{\s*property_name\s*\}\}/);
  });

  test('a stale provisioned row renders against the current catalog (in-memory refresh)', async () => {
    // The local provisioning copy still carries the old {{property_name}}
    // body/variables; the send must validate, render and store the CURRENT
    // catalog definition instead — and the row itself stays untouched.
    prisma.whatsAppTemplate.findFirst.mockResolvedValue({
      id: 'tpl-stale',
      organizationId: ORG,
      name: 'Property Snapshot',
      active: true,
      providerTemplateId: null,
      body: 'old snapshot of {{property_name}} at {{project_name}}',
      variables: ['customer_name', 'property_name', 'project_name'],
    });

    const res = await request(app)
      .post(`/api/v1/whatsapp/conversations/${CONV}/messages`)
      .set('Cookie', cookie('t1'))
      .send({
        templateName: 'Property Snapshot',
        variables: ['Kamal', 'Skyline Residency', 'Pune', '2 BHK', 'Rs 68,00,000', 'Priya Sharma'],
      });

    expect(res.status).toBe(201);
    expect(prisma.whatsAppTemplate.update).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: expect.stringContaining('quick snapshot of Skyline Residency, Pune: 2 BHK'),
        }),
      })
    );
    const { data } = prisma.whatsAppMessage.create.mock.calls[0][0];
    expect(data.body).not.toMatch(/\{\{\s*property_name\s*\}\}/);
    expect(data.body).not.toContain('old snapshot');
  });
});
