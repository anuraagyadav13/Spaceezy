const request = require('supertest');

const {
    generatePublicToken,
    isValidPublicToken,
    generatePublicSlug,
    slugify,
    buildPublicPropertyUrl,
    publicAvailability,
    publicImages
} = require('../src/utils/publicLink');

jest.mock('../src/db/prisma', () => {
    const mock = {
        organization: { findFirst: jest.fn() },
        session: { findUnique: jest.fn() },
        user: { findFirst: jest.fn(), findMany: jest.fn() },
        lead: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
        leadActivity: { create: jest.fn() },
        project: {
            findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
            create: jest.fn(), update: jest.fn(), groupBy: jest.fn()
        },
        property: {
            findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
            create: jest.fn(), update: jest.fn(), groupBy: jest.fn()
        },
        configuration: { findMany: jest.fn() },
        locationState: { findMany: jest.fn() },
        whatsAppConversation: { findFirst: jest.fn(), update: jest.fn() },
        whatsAppMessage: { create: jest.fn() },
        auditLog: { create: jest.fn() },
        $transaction: jest.fn()
    };
    mock.$transaction.mockImplementation(async (fn) => fn(mock));
    return mock;
});

const prisma = require('../src/db/prisma');
const PropertyService = require('../src/services/propertyService');
const ProjectService = require('../src/services/projectService');
const PublicService = require('../src/services/publicService');
const LeadService = require('../src/services/leadService');
const WhatsAppService = require('../src/services/whatsappService');
const { resetWhatsAppProvider, getWhatsAppProvider } = require('../src/providers/whatsapp');
const app = require('../src/app');

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PROP = '77777777-7777-4777-8777-777777777777';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONV = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SLUG = 'skyline-residences-abc123';

const publishedProject = {
    name: 'Skyline Residences',
    publicSlug: SLUG,
    isPublic: true,
    status: 'UNDER_CONSTRUCTION',
    address: 'Sector 62, Noida',
    locality: 'Sector 62',
    city: 'Noida',
    state: 'Uttar Pradesh',
    locationState: { name: 'Uttar Pradesh' },
    locationDistrict: { name: 'Gautam Buddha Nagar' },
    locationRegion: { name: 'Noida' }
};

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URL;
    resetWhatsAppProvider();
    prisma.organization.findFirst.mockResolvedValue({ id: ORG });
});

describe('public link utilities', () => {
    it('generates valid, unique 32-hex public tokens', () => {
        const tokens = new Set();
        for (let i = 0; i < 200; i++) {
            const token = generatePublicToken();
            expect(token).toMatch(/^[0-9a-f]{32}$/);
            expect(isValidPublicToken(token)).toBe(true);
            tokens.add(token);
        }
        expect(tokens.size).toBe(200);
    });

    it('rejects malformed tokens', () => {
        expect(isValidPublicToken('not-a-token')).toBe(false);
        expect(isValidPublicToken('A1B2C3D4E5F60718293A4B5C6D7E8F90')).toBe(false); // uppercase
        expect(isValidPublicToken('a1b2c3')).toBe(false);
        expect(isValidPublicToken(null)).toBe(false);
    });

    it('slugifies project names into URL-safe unique slugs', () => {
        expect(slugify('Skyline Residences Phase 2')).toBe('skyline-residences-phase-2');
        const slug = generatePublicSlug('DLF Cyber City');
        expect(slug).toMatch(/^dlf-cyber-city-[0-9a-f]{6}$/);
        expect(generatePublicSlug('!!!')).toMatch(/^project-[0-9a-f]{6}$/);
    });

    it('builds public URLs from FRONTEND_URL only (no hardcoded origin)', () => {
        delete process.env.FRONTEND_URL;
        expect(buildPublicPropertyUrl(TOKEN)).toBe(`http://localhost:3000/properties/${TOKEN}`);
        process.env.FRONTEND_URL = 'https://crm.example.test/';
        expect(buildPublicPropertyUrl(TOKEN)).toBe(`https://crm.example.test/properties/${TOKEN}`);
        delete process.env.FRONTEND_URL;
    });

    it('maps CRM statuses to the canonical public availability vocabulary', () => {
        expect(publicAvailability('AVAILABLE')).toBe('Available');
        expect(publicAvailability('RESERVED')).toBe('Limited Availability');
        expect(publicAvailability('SOLD')).toBe('Sold');
    });

    it('filters non-http(s) image URLs out of public DTOs', () => {
        expect(publicImages(['https://cdn.example.com/a.jpg', 'blob:http://localhost/x', 'http://cdn.example.com/b.jpg']))
            .toEqual(['https://cdn.example.com/a.jpg', 'http://cdn.example.com/b.jpg']);
        expect(publicImages(null)).toEqual([]);
    });
});

describe('Property/Project share fields are server-managed', () => {
    it('createProperty generates a public token and never trusts a client-supplied one', async () => {
        prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
        prisma.property.findFirst.mockResolvedValue(null);
        prisma.property.create.mockResolvedValue({ id: PROP });

        await PropertyService.createProperty({
            projectId: PROJECT,
            title: '2 BHK Unit 1201',
            unitNumber: 'A-1201',
            price: 4500000,
            publicToken: 'deadbeefdeadbeefdeadbeefdeadbeef',
            isPublic: true
        }, ORG);

        const data = prisma.property.create.mock.calls[0][0].data;
        expect(data.publicToken).toMatch(/^[0-9a-f]{32}$/);
        expect(data.publicToken).not.toBe('deadbeefdeadbeefdeadbeefdeadbeef');
        expect(data.isPublic).toBe(true);
        expect(data.organizationId).toBe(ORG);
    });

    it('createProperty retries when the generated token collides on the unique index', async () => {
        prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
        prisma.property.findFirst.mockResolvedValue(null);
        prisma.property.create
            .mockRejectedValueOnce({ code: 'P2002', meta: { target: ['publicToken'] } })
            .mockResolvedValueOnce({ id: PROP });

        const result = await PropertyService.createProperty({
            projectId: PROJECT,
            title: 'Unit',
            unitNumber: 'B-1',
            price: 1000000
        }, ORG);

        expect(result).toEqual({ id: PROP });
        expect(prisma.property.create).toHaveBeenCalledTimes(2);
        expect(prisma.property.create.mock.calls[0][0].data.publicToken)
            .not.toBe(prisma.property.create.mock.calls[1][0].data.publicToken);
    });

    it('publicToken is not client-writable on update, isPublic is', async () => {
        prisma.property.findFirst.mockResolvedValue({
            id: PROP, projectId: PROJECT, configurationId: null, status: 'AVAILABLE'
        });
        prisma.property.update.mockResolvedValue({ id: PROP });

        await PropertyService.updateProperty(PROP, {
            publicToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            isPublic: true
        }, ORG);

        const data = prisma.property.update.mock.calls[0][0].data;
        expect(data).not.toHaveProperty('publicToken');
        expect(data).toHaveProperty('isPublic', true);
    });

    it('createProject generates a unique public slug from the project name', async () => {
        prisma.project.create.mockImplementation(async ({ data }) => ({ id: PROJECT, ...data }));

        const created = await ProjectService.createProject({ name: 'Palm Grove Enclave' }, ORG);

        expect(created.publicSlug).toMatch(/^palm-grove-enclave-[0-9a-f]{6}$/);
        expect(created.organizationId).toBe(ORG);
    });

    it('createProject ignores a client-supplied publicSlug (server-managed only)', async () => {
        prisma.project.create.mockImplementation(async ({ data }) => ({ id: PROJECT, ...data }));

        const created = await ProjectService.createProject({
            name: 'Palm Grove Enclave',
            publicSlug: 'attacker-controlled-slug'
        }, ORG);

        expect(created.publicSlug).not.toBe('attacker-controlled-slug');
        expect(created.publicSlug).toMatch(/^palm-grove-enclave-[0-9a-f]{6}$/);
    });

    it('project update persists isPublic but strips publicSlug', async () => {
        prisma.project.findFirst.mockResolvedValue({ id: PROJECT });
        prisma.project.update.mockResolvedValue({ id: PROJECT });

        await ProjectService.updateProject(PROJECT, {
            isPublic: true,
            publicSlug: 'hijacked'
        }, ORG);

        const data = prisma.project.update.mock.calls[0][0].data;
        expect(data).toHaveProperty('isPublic', true);
        expect(data).not.toHaveProperty('publicSlug');
    });
});

describe('GET /api/v1/public/properties/:token', () => {
    it('returns the same 404 for malformed and unknown tokens (no existence oracle)', async () => {
        prisma.property.findFirst.mockResolvedValue(null);

        const malformed = await request(app).get('/api/v1/public/properties/not-a-real-token');
        const unknown = await request(app).get(`/api/v1/public/properties/${'f'.repeat(32)}`);

        expect(malformed.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(malformed.body.message).toBe(unknown.body.message);
        expect(malformed.body.code).toBe(unknown.body.code);
        // Malformed input is rejected without a DB round-trip; the well-formed
        // unknown token is a single lookup that misses — both end identically.
        expect(prisma.property.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.property.findFirst.mock.calls[0][0].where.publicToken).toBe('f'.repeat(32));
    });

    it('returns 404 with the identical message when the unit exists but is unpublished', async () => {
        prisma.property.findFirst.mockResolvedValue(null); // isPublic filter excludes it

        const unpublished = await request(app).get(`/api/v1/public/properties/${TOKEN}`);

        expect(unpublished.status).toBe(404);
        expect(unpublished.body.message).toBe('Property not found');

        prisma.property.findFirst.mockResolvedValue({
            publicToken: TOKEN,
            title: 'Unit 1201',
            unitNumber: 'A-1201',
            tower: 'A',
            floor: 12,
            facing: 'East',
            configuration: '2 BHK',
            bhk: 2,
            type: 'Residential',
            purpose: 'Sale',
            area: null,
            areaCarpet: null,
            areaSaleable: 950,
            price: 4500000,
            status: 'AVAILABLE',
            images: ['blob:http://localhost/dead', 'https://cdn.example.com/unit.jpg'],
            amenities: ['Pool'],
            config: { name: '2 BHK', bhk: 2, areaSaleable: 950, basePrice: 4500000 },
            project: {
                ...publishedProject,
                description: 'A premium tower',
                shortDescription: 'Premium living',
                images: ['https://cdn.example.com/project.jpg'],
                amenities: ['Gym', 'Pool']
            }
        });

        const res = await request(app).get(`/api/v1/public/properties/${TOKEN}`);
        expect(res.status).toBe(200);

        const dto = res.body.data;
        // Availability wording comes from the canonical public mapping.
        expect(dto.availability).toBe('Available');
        // blob: images are dropped — only publicly reachable URLs survive.
        expect(dto.images).toEqual(['https://cdn.example.com/unit.jpg']);
        expect(dto.area).toBe(950);
        expect(dto.project.slug).toBe(SLUG);
        expect(dto.enquiry).toEqual({ propertyToken: TOKEN, projectSlug: SLUG });
        // No internal CRM identifiers may leak through the public DTO.
        const raw = JSON.stringify(dto);
        expect(raw).not.toContain('organizationId');
        expect(raw).not.toContain('projectId');
        expect(raw).not.toContain(`"${PROP}"`);
        expect(dto).not.toHaveProperty('id');
        expect(dto).not.toHaveProperty('version');
    });
});

describe('GET /api/v1/public/projects and configurations', () => {
    it('lists only published projects as explicit DTOs', async () => {
        prisma.project.findMany.mockResolvedValue([{ ...publishedProject, id: PROJECT, startingPrice: null, maximumPrice: null, configurations: [{ name: '2 BHK' }] }]);
        prisma.project.count.mockResolvedValue(1);
        prisma.property.groupBy.mockResolvedValue([]);

        const res = await request(app).get('/api/v1/public/projects');
        expect(res.status).toBe(200);
        expect(res.body.data.items).toHaveLength(1);
        const item = res.body.data.items[0];
        expect(item.slug).toBe(SLUG);
        expect(item.configurations).toEqual(['2 BHK']);
        expect(item.url).toBe(`http://localhost:3000/projects/${SLUG}`);

        // Visibility condition always includes isPublic + non-INACTIVE.
        const where = prisma.project.findMany.mock.calls[0][0].where;
        expect(JSON.stringify(where)).toContain('"isPublic":true');
        expect(JSON.stringify(where)).toContain('INACTIVE');
        const raw = JSON.stringify(res.body.data.items);
        expect(raw).not.toContain('organizationId');
        expect(raw).not.toContain(`"${PROJECT}"`);
    });

    it('builds field-scoped OR clauses for q and location search (regression: bare contains() crashed Prisma)', async () => {
        prisma.project.findMany.mockResolvedValue([]);
        prisma.project.count.mockResolvedValue(0);
        prisma.property.groupBy.mockResolvedValue([]);

        const qRes = await request(app).get('/api/v1/public/projects?q=aurora');
        expect(qRes.status).toBe(200);
        const qOr = prisma.project.findMany.mock.calls[0][0].where.AND.find((c) => c.OR);
        expect(qOr.OR[0]).toHaveProperty('name');
        expect(qOr.OR[1]).toHaveProperty('description');

        const locRes = await request(app).get('/api/v1/public/projects?location=Andheri');
        expect(locRes.status).toBe(200);
        const locOr = prisma.project.findMany.mock.calls[1][0].where.AND.find((c) => c.OR);
        for (const clause of locOr.OR) {
            expect(['name', 'address', 'locality'].some((k) => k in clause)).toBe(true);
        }
    });

    it('404s for unknown or unpublished project slugs with identical messages', async () => {
        prisma.project.findFirst.mockResolvedValue(null);

        const unknown = await request(app).get('/api/v1/public/projects/does-not-exist');
        expect(unknown.status).toBe(404);
        expect(unknown.body.message).toBe('Project not found');
        const where = prisma.project.findFirst.mock.calls[0][0].where;
        expect(where.isPublic).toBe(true);
    });

    it('serves distinct active configuration names from published projects only', async () => {
        prisma.configuration.findMany.mockResolvedValue([{ name: '2 BHK' }, { name: '3 BHK' }]);

        const res = await request(app).get('/api/v1/public/configurations');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(['2 BHK', '3 BHK']);
        const where = prisma.configuration.findMany.mock.calls[0][0].where;
        expect(where.active).toBe(true);
        expect(JSON.stringify(where)).toContain('isPublic');
    });
});

describe('POST /api/v1/leads/:id/property-share', () => {
    const leadRow = { id: LEAD, name: 'Asha', assignedToId: USER };

    it('rejects sharing an unpublished unit with 409 PROPERTY_NOT_PUBLISHED', async () => {
        prisma.lead.findFirst.mockResolvedValue(leadRow);
        prisma.property.findFirst.mockResolvedValue({
            id: PROP,
            isPublic: false,
            publicToken: TOKEN,
            project: { ...publishedProject, isPublic: true }
        });

        await expect(
            LeadService.buildPropertyShare(LEAD, PROP, ORG, 'ADMIN', USER)
        ).rejects.toMatchObject({ statusCode: 409, code: 'PROPERTY_NOT_PUBLISHED' });
    });

    it('rejects sharing when the parent project is not published', async () => {
        prisma.lead.findFirst.mockResolvedValue(leadRow);
        prisma.property.findFirst.mockResolvedValue({
            id: PROP,
            isPublic: true,
            publicToken: TOKEN,
            project: { ...publishedProject, isPublic: false }
        });

        await expect(
            LeadService.buildPropertyShare(LEAD, PROP, ORG, 'ADMIN', USER)
        ).rejects.toMatchObject({ statusCode: 409, code: 'PROPERTY_NOT_PUBLISHED' });
    });

    it('enforces lead scope for sales executives', async () => {
        prisma.lead.findFirst.mockResolvedValue({ ...leadRow, assignedToId: 'someone-else' });

        await expect(
            LeadService.buildPropertyShare(LEAD, PROP, ORG, 'SALES_EXECUTIVE', USER)
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(prisma.property.findFirst).not.toHaveBeenCalled();
    });

    it('builds the WhatsApp share message with the public URL and template fields', async () => {
        process.env.FRONTEND_URL = 'https://crm.example.test';
        prisma.lead.findFirst.mockResolvedValue(leadRow);
        prisma.property.findFirst.mockResolvedValue({
            id: PROP,
            title: 'Unit 1201 — 2 BHK',
            unitNumber: 'A-1201',
            isPublic: true,
            publicToken: TOKEN,
            configuration: '2 BHK',
            areaSaleable: 950,
            price: 4500000,
            status: 'AVAILABLE',
            config: { name: '2 BHK' },
            project: { ...publishedProject, isPublic: true }
        });
        prisma.user.findFirst.mockResolvedValue({ name: 'Ravi Kumar' });

        const share = await LeadService.buildPropertyShare(LEAD, PROP, ORG, 'ADMIN', USER);

        expect(share.publicUrl).toBe(`https://crm.example.test/properties/${TOKEN}`);
        expect(share.body).toContain('Hi Asha,');
        expect(share.body).toContain('🏢 Skyline Residences');
        expect(share.body).toContain('📍 Noida, Gautam Buddha Nagar, Uttar Pradesh');
        expect(share.body).toContain('🏠 2 BHK');
        expect(share.body).toContain('📐 950 sq.ft');
        expect(share.body).toContain('💰 ₹45,00,000');
        expect(share.body).toContain(share.publicUrl);
        expect(share.body).toContain('Regards,\nRavi Kumar');
        expect(share.property.projectName).toBe('Skyline Residences');
        expect(share.property.availability).toBe('Available');
        delete process.env.FRONTEND_URL;
    });

    it('backfills a missing token on the unit instead of failing the share', async () => {
        prisma.lead.findFirst.mockResolvedValue(leadRow);
        prisma.property.findFirst.mockResolvedValue({
            id: PROP,
            title: 'Unit 9',
            publicToken: null,
            isPublic: true,
            configuration: '1 BHK',
            price: 2500000,
            status: 'AVAILABLE',
            config: null,
            project: { ...publishedProject, isPublic: true }
        });
        prisma.user.findFirst.mockResolvedValue({ name: 'Ravi' });
        prisma.property.update.mockResolvedValue({});

        const share = await LeadService.buildPropertyShare(LEAD, PROP, ORG, 'ADMIN', USER);

        expect(prisma.property.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: PROP },
                data: { publicToken: expect.stringMatching(/^[0-9a-f]{32}$/) }
            })
        );
        expect(share.publicToken).toMatch(/^[0-9a-f]{32}$/);
        expect(share.publicUrl).toBe(`http://localhost:3000/properties/${share.publicToken}`);
    });
});

describe('WhatsApp send records share tracking on the lead timeline', () => {
    it('stores propertyId + public URL in activity metadata and message variables', async () => {
        process.env.WHATSAPP_PROVIDER = 'mock';
        resetWhatsAppProvider();
        expect(getWhatsAppProvider().name).toBe('mock');

        prisma.whatsAppConversation.findFirst.mockResolvedValue({
            id: CONV,
            leadId: LEAD,
            status: 'ACTIVE',
            providerContactId: null,
            lead: { phone: '+911234567890', assignedToId: USER }
        });
        prisma.property.findFirst.mockResolvedValue({
            id: PROP,
            title: 'Unit 1201 — 2 BHK',
            publicToken: TOKEN,
            project: { name: 'Skyline Residences' }
        });
        prisma.whatsAppMessage.create.mockResolvedValue({ id: 'msg-1' });
        prisma.whatsAppConversation.update.mockResolvedValue({});
        prisma.leadActivity.create.mockResolvedValue({});
        prisma.auditLog.create.mockResolvedValue({});

        const message = await WhatsAppService.sendMessage(
            CONV,
            { body: 'Hi, check out this unit', share: { propertyId: PROP } },
            ORG,
            USER,
            'ADMIN'
        );

        expect(message.id).toBe('msg-1');

        const activity = prisma.leadActivity.create.mock.calls[0][0].data;
        expect(activity.type).toBe('WHATSAPP');
        expect(activity.description).toBe('WhatsApp property share sent: Unit 1201 — 2 BHK');
        expect(activity.metadata.share).toEqual(expect.objectContaining({
            propertyId: PROP,
            publicUrl: `http://localhost:3000/properties/${TOKEN}`,
            propertyTitle: 'Unit 1201 — 2 BHK',
            projectName: 'Skyline Residences'
        }));

        const createdMessage = prisma.whatsAppMessage.create.mock.calls[0][0].data;
        expect(createdMessage.variables).toEqual(expect.objectContaining({
            propertyId: PROP,
            publicUrl: `http://localhost:3000/properties/${TOKEN}`
        }));
        expect(createdMessage.providerMessageId).toMatch(/^mockwa_/);
    });

    it('404s when the referenced share property does not belong to the organization', async () => {
        process.env.WHATSAPP_PROVIDER = 'mock';
        resetWhatsAppProvider();
        prisma.whatsAppConversation.findFirst.mockResolvedValue({
            id: CONV,
            leadId: LEAD,
            status: 'ACTIVE',
            providerContactId: null,
            lead: { phone: '+911234567890', assignedToId: USER }
        });
        prisma.property.findFirst.mockResolvedValue(null);

        await expect(
            WhatsAppService.sendMessage(
                CONV,
                { body: 'hello', share: { propertyId: PROP } },
                ORG,
                USER,
                'ADMIN'
            )
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    });
});

describe('Public enquiry resolves public references to internal IDs', () => {
    const enquiry = {
        name: 'Asha',
        phone: '+911234567890',
        message: 'Interested in this unit'
    };

    beforeEach(() => {
        prisma.lead.findFirst.mockResolvedValue(null); // no duplicate → create path
        prisma.lead.create.mockImplementation(async ({ data }) => ({ id: LEAD, ...data }));
        prisma.leadActivity.create.mockResolvedValue({});
    });

    it('resolves propertyToken to propertyId + projectId', async () => {
        prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT });

        await LeadService.handlePublicEnquiry(
            { ...enquiry, propertyToken: TOKEN },
            ORG
        );

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.propertyId).toBe(PROP);
        expect(data.projectId).toBe(PROJECT);
        expect(data.source).toBe('Website');
    });

    it('resolves projectSlug to projectId', async () => {
        prisma.project.findFirst.mockResolvedValue({ id: PROJECT });

        await LeadService.handlePublicEnquiry(
            { ...enquiry, projectSlug: SLUG },
            ORG
        );

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.projectId).toBe(PROJECT);
        expect(data.propertyId).toBeNull();
    });

    it('drops unknown tokens/slugs instead of failing the submission', async () => {
        prisma.property.findFirst.mockResolvedValue(null);
        prisma.project.findFirst.mockResolvedValue(null);

        await LeadService.handlePublicEnquiry(
            { ...enquiry, propertyToken: 'ffffffffffffffffffffffffffffffff', projectSlug: 'ghost-project-000000' },
            ORG
        );

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.propertyId).toBeNull();
        expect(data.projectId).toBeNull();
    });
});

describe('Public enquiry API accepts public references and website dates', () => {
    it('accepts propertyToken/projectSlug and a date-only preferredVisitDate', async () => {
        prisma.lead.findFirst.mockResolvedValue(null);
        prisma.lead.create.mockImplementation(async ({ data }) => ({ id: LEAD, ...data }));
        prisma.leadActivity.create.mockResolvedValue({});
        prisma.property.findFirst.mockResolvedValue({ id: PROP, projectId: PROJECT });

        const res = await request(app)
            .post('/api/v1/public/enquiries')
            .send({
                name: 'Asha',
                phone: '+911234567890',
                propertyToken: TOKEN,
                source: 'Website',
                preferredVisitDate: '2026-10-15'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);

        const data = prisma.lead.create.mock.calls[0][0].data;
        expect(data.propertyId).toBe(PROP);
        expect(data.projectId).toBe(PROJECT);
        expect(data.preferredVisitDate).toEqual(new Date('2026-10-15'));
    });

    it('rejects unknown top-level fields (no organizationId injection)', async () => {
        const res = await request(app)
            .post('/api/v1/public/enquiries')
            .send({
                name: 'Asha',
                phone: '+911234567890',
                organizationId: 'evil-org',
                status: 'WON'
            });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(prisma.lead.create).not.toHaveBeenCalled();
    });
});
