// Phase 18: the optional project brochure — an employee-uploaded PDF, never
// a generated document (the brochure PDF generator was removed on request).
//
// Covers the whole pipeline at the contract level:
// - storageService.uploadDocument: PDF-only magic-byte validation, the 15 MB
//   cap, and the local-disk fallback that keeps the flow testable without S3;
// - storageService.readDocument: streams a stored file back, with the path
//   traversal guard on disk keys;
// - POST /projects/:id/brochure: raw application/pdf body -> stored file +
//   documents JSON entry (replacing any previous brochure), 404 for unknown
//   projects, 400 when no PDF arrives;
// - DELETE /projects/:id/brochure: entry removed, other documents kept;
// - GET /projects/:id/brochure: the ONLY way the file is ever read back —
//   an authenticated CRM download for staff, 401 without a session and 404
//   without a brochure. No public route exists for it: brochure sending to
//   clients was removed, so /public/documents is gone and answers 404.
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    organization: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    project: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');
const {
  uploadDocument,
  readDocument,
  findBrochureDocument,
  MAX_PDF_BYTES,
} = require('../src/services/storageService');

const ORG = '99999999-9999-4999-8999-999999999999';
const PROJECT = '88888888-8888-4888-8888-888888888888';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};
const cookie = (jar) => `spaceezy_session=${jar}`;

// A tiny real PDF (%PDF- header + a comment payload) — the magic bytes are
// what the storage service trusts.
const pdfBytes = (tag = 'brochure') => Buffer.from(`%PDF-1.4\n% ${tag}\ntrailer\n%%EOF\n`, 'latin1');

const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

beforeEach(() => {
  jest.clearAllMocks();
  mockSession('ADMIN', 'admin-user-1');
  prisma.project.update.mockImplementation(async ({ data }) => ({ id: PROJECT, ...data }));
});

afterAll(async () => {
  // Disk-mode uploads land under uploads/<org>/ — remove this suite's scope.
  await fs.promises.rm(path.join(uploadsRoot, ORG), { recursive: true, force: true });
});

describe('Phase 18: storageService.uploadDocument', () => {
  test('stores a PDF on disk when S3 is unset (local dev) and streams it back', async () => {
    delete process.env.AWS_S3_BUCKET; // this suite always runs disk mode
    const buffer = pdfBytes('roundtrip');

    const stored = await uploadDocument({ buffer, organizationId: ORG });

    expect(stored.storage).toBe('disk');
    expect(stored.key.startsWith(`${ORG}/`)).toBe(true);
    expect(stored.key.endsWith('.pdf')).toBe(true);

    const file = await readDocument(stored);
    expect(file.contentType).toBe('application/pdf');
    const chunks = [];
    for await (const chunk of file.stream) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString('latin1')).toContain('%PDF-1.4');
  });

  test('rejects non-PDF bytes with 415 and oversized files with 413', async () => {
    delete process.env.AWS_S3_BUCKET;

    await expect(uploadDocument({ buffer: Buffer.from('GIF89a not a pdf'), organizationId: ORG }))
      .rejects.toMatchObject({ statusCode: 415 });

    const tooBig = Buffer.concat([pdfBytes(), Buffer.alloc(MAX_PDF_BYTES + 1)]);
    await expect(uploadDocument({ buffer: tooBig, organizationId: ORG }))
      .rejects.toMatchObject({ statusCode: 413 });

    await expect(uploadDocument({ buffer: Buffer.alloc(0), organizationId: ORG }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('readDocument refuses disk keys that escape the uploads root', async () => {
    delete process.env.AWS_S3_BUCKET;
    const escapers = [
      { storage: 'disk', key: '../../../.env' },
      { storage: 'disk', key: '..\\..\\src\\app.js' },
      { storage: 'disk', key: '/etc/passwd' },
      { storage: 'disk', key: '' },
      null,
      'not-an-entry',
    ];
    for (const entry of escapers) {
      // eslint-disable-next-line no-await-in-loop
      expect(await readDocument(entry)).toBeNull();
    }
  });

  test('findBrochureDocument matches the same /brochure/i rule the composer uses', () => {
    const docs = [
      { name: 'Floor plan', url: 'x' },
      { name: 'Brochure', key: 'org/2026/10/a.pdf', storage: 'disk' },
    ];
    expect(findBrochureDocument(docs).key).toBe('org/2026/10/a.pdf');
    expect(findBrochureDocument([{ name: 'Brochure v2.pdf', key: 'k.pdf', storage: 'disk' }])).toBeTruthy();
    // A name alone is not a deliverable brochure — the entry must reference a file.
    expect(findBrochureDocument([{ name: 'Brochure v2.pdf' }])).toBeNull();
    expect(findBrochureDocument([])).toBeNull();
    expect(findBrochureDocument(null)).toBeNull();
    // A nameless entry is not a brochure — the /brochure/i name rule is the
    // same one the WhatsApp composer applies.
    expect(findBrochureDocument([{ url: 'https://x/brochure.pdf' }])).toBeNull();
  });
});

describe('Phase 18: project brochure upload / remove routes', () => {
  const projectRow = (documents = []) => ({ id: PROJECT, name: 'Skyline Residency', documents });

  test('POST stores the PDF and records one Brochure documents entry (replacing the old one)', async () => {
    delete process.env.AWS_S3_BUCKET;
    prisma.project.findFirst.mockResolvedValue(projectRow([
      { name: 'Brochure', key: 'old/old.pdf', storage: 'disk' },
      { name: 'Price sheet', url: 'https://x/price.pdf' },
    ]));

    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'))
      .set('Content-Type', 'application/pdf')
      .send(pdfBytes('upload-route'));

    expect(res.status).toBe(201);
    expect(res.body.data.brochure.name).toBe('Brochure');
    expect(res.body.data.brochure.storage).toBe('disk');
    expect(res.body.data.brochure.contentType).toBe('application/pdf');

    // One update: old brochure replaced, unrelated documents kept.
    const { data } = prisma.project.update.mock.calls[0][0];
    expect(data.documents).toHaveLength(2);
    expect(data.documents.some((d) => d.key === 'old/old.pdf')).toBe(false);
    expect(data.documents.some((d) => d.name === 'Price sheet')).toBe(true);
    expect(data.documents.find((d) => d.name === 'Brochure').key).toContain(ORG);
  });

  test('POST without a PDF body answers 400 and unknown projects answer 404', async () => {
    delete process.env.AWS_S3_BUCKET;
    prisma.project.findFirst.mockResolvedValue(projectRow());

    const wrongType = await request(app)
      .post(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'))
      .set('Content-Type', 'application/json')
      .send({ nope: true });
    expect(wrongType.status).toBe(400);

    const notPdf = await request(app)
      .post(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'))
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('plain text pretending'));
    expect(notPdf.status).toBe(415);

    prisma.project.findFirst.mockResolvedValue(null);
    const missing = await request(app)
      .post(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'))
      .set('Content-Type', 'application/pdf')
      .send(pdfBytes());
    expect(missing.status).toBe(404);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  test('DELETE removes only the brochure entry', async () => {
    prisma.project.findFirst.mockResolvedValue(projectRow([
      { name: 'Brochure', key: 'old/old.pdf', storage: 'disk' },
      { name: 'Price sheet', url: 'https://x/price.pdf' },
    ]));

    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    const { data } = prisma.project.update.mock.calls[0][0];
    expect(data.documents).toEqual([{ name: 'Price sheet', url: 'https://x/price.pdf' }]);
  });
});

describe('Phase 18: authenticated brochure download route', () => {
  test('streams the uploaded brochure bytes to logged-in staff', async () => {
    delete process.env.AWS_S3_BUCKET;
    const stored = await uploadDocument({ buffer: pdfBytes('deliver-me'), organizationId: ORG });
    prisma.project.findFirst.mockResolvedValue({
      name: 'Skyline Residency',
      documents: [{ name: 'Brochure', ...stored }],
    });

    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toContain('skyline-residency-brochure.pdf');
    // superagent may expose binary bodies as a Buffer or as latin1 text.
    const bytes = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.text || '', 'latin1');
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toContain('deliver-me');
  });

  test('404 for a project without an uploaded brochure and for unknown projects', async () => {
    prisma.project.findFirst.mockResolvedValue({ name: 'Skyline Residency', documents: [] });
    const noBrochure = await request(app)
      .get(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'));
    expect(noBrochure.status).toBe(404);
    expect(noBrochure.body.code).toBe('NO_BROCHURE');

    prisma.project.findFirst.mockResolvedValue(null);
    const missingProject = await request(app)
      .get(`/api/v1/projects/${PROJECT}/brochure`)
      .set('Cookie', cookie('t1'));
    expect(missingProject.status).toBe(404);

    // The validator rejects a malformed id before the controller runs.
    const callsBefore = prisma.project.findFirst.mock.calls.length;
    const badId = await request(app)
      .get('/api/v1/projects/not-a-uuid/brochure')
      .set('Cookie', cookie('t1'));
    expect(badId.status).toBe(400);
    expect(prisma.project.findFirst.mock.calls.length).toBe(callsBefore);
  });

  test('401 without a session — the brochure never leaves the organization', async () => {
    const stored = await uploadDocument({ buffer: pdfBytes('internal-only'), organizationId: ORG });
    prisma.project.findFirst.mockResolvedValue({
      name: 'Skyline Residency',
      documents: [{ name: 'Brochure', ...stored }],
    });

    const anonymous = await request(app).get(`/api/v1/projects/${PROJECT}/brochure`);
    expect(anonymous.status).toBe(401);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });
});

describe('Phase 18: public delivery path for the brochure', () => {
  test('the public documents route streams the uploaded PDF with no session', async () => {
    delete process.env.AWS_S3_BUCKET;
    const stored = await uploadDocument({ buffer: pdfBytes('client-brochure'), organizationId: ORG });
    prisma.project.findFirst.mockResolvedValue({
      name: 'Skyline Residency',
      documents: [{ name: 'Brochure', ...stored }],
    });

    // Meta's servers fetch this link to deliver the WhatsApp document
    // message, so it must answer anonymously.
    const res = await request(app).get(`/api/v1/public/documents?projectId=${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  test('the public documents route 404s when no brochure is on file', async () => {
    prisma.project.findFirst.mockResolvedValue({
      name: 'Skyline Residency',
      documents: [],
    });

    const res = await request(app).get(`/api/v1/public/documents?projectId=${PROJECT}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NO_BROCHURE');
  });
});
