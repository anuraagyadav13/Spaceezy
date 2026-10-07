const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/db/prisma', () => {
  const mock = {
    session: { findUnique: jest.fn() },
    lead: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    leadActivity: { create: jest.fn() },
    project: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    property: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    quotation: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    customer: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    booking: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(async (fn) => fn(mock));
  return mock;
});

const prisma = require('../src/db/prisma');

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '88888888-8888-4888-8888-888888888888';
const PROJECT_OTHER = '99999999-9999-4999-8999-999999999999';
const PROP = '77777777-7777-4777-8777-777777777777';
const PROP_OTHER = '66666666-6666-4666-8666-666666666666';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LEAD_OTHER = 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const QUOTE = 'ccccccc1-cccc-4ccc-8ccc-cccccccccccc';
const QUOTE_OTHER = 'ccccccc2-cccc-4ccc-8ccc-cccccccccccc';
const CUSTOMER = 'ddddddd1-dddd-4ddd-8ddd-dddddddddddd';
const BOOKING = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeeee';
const EXEC = '55555555-5555-4555-8555-555555555555';
const EXEC_OTHER = '44444444-4444-4444-8444-444444444444';

const mockSession = (role, userId) => {
  prisma.session.findUnique.mockResolvedValue({
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: userId, organizationId: ORG, role, status: 'ACTIVE' },
  });
};

const admin = () => mockSession('ADMIN', 'admin-user');
const exec = (userId = EXEC) => mockSession('SALES_EXECUTIVE', userId);

const lead = (overrides = {}) => ({
  id: LEAD,
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: '+91 90000 00000',
  email: 'rohit@example.com',
  status: 'QUOTATION',
  projectId: PROJECT,
  propertyId: null,
  assignedToId: EXEC,
  ...overrides,
});

const property = (overrides = {}) => ({
  id: PROP,
  organizationId: ORG,
  projectId: PROJECT,
  status: 'AVAILABLE',
  version: 1,
  price: 4500000,
  ...overrides,
});

const quotation = (overrides = {}) => ({
  id: QUOTE,
  organizationId: ORG,
  leadId: LEAD,
  projectId: PROJECT,
  propertyId: PROP,
  status: 'ACCEPTED',
  totalAmount: 4500000,
  ...overrides,
});

const booking = (overrides = {}) => ({
  id: BOOKING,
  organizationId: ORG,
  customerId: CUSTOMER,
  propertyId: PROP,
  projectId: PROJECT,
  leadId: LEAD,
  quotationId: null,
  amount: 4500000,
  paymentStatus: 'PENDING',
  assignedToId: EXEC,
  ...overrides,
});

const customer = (overrides = {}) => ({
  id: CUSTOMER,
  organizationId: ORG,
  name: 'Rohit Sharma',
  phone: '+91 90000 00000',
  email: 'rohit@example.com',
  assignedToId: EXEC,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.SESSION_COOKIE_NAME;
});

const cookie = (jar) => `spaceezy_session=${jar}`;

// ---------------------------------------------------------------------------
// Quotation -> Booking conversion (POST /leads/:id/bookings)
// ---------------------------------------------------------------------------
describe('Phase 3: quotation to booking conversion', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .send({ propertyId: PROP, amount: 4500000 });
    expect(response.status).toBe(401);
  });

  it('rejects a non-uuid propertyId with 400 VALIDATION_ERROR', async () => {
    admin();
    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: 'not-a-uuid', amount: 4500000 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a missing amount with 400 when no quotation is provided', async () => {
    admin();
    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a lead outside the organization', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(null);
    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });
    expect(response.status).toBe(404);
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('blocks an executive from converting a lead assigned to someone else (403)', async () => {
    exec();
    prisma.lead.findFirst.mockResolvedValue(lead({ assignedToId: EXEC_OTHER }));
    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('exec-token'))
      .send({ propertyId: PROP, amount: 4500000 });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('creates a booking from a lead, reserves the unit and advances the lead to BOOKED', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking());
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(201);
    expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({
      leadId: LEAD,
      quotationId: null,
      projectId: PROJECT,
      amount: 4500000,
      paymentStatus: 'PENDING',
    });
    // Inventory is locked optimistically: AVAILABLE -> RESERVED
    expect(prisma.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: PROP, version: 1 }),
      data: expect.objectContaining({ status: 'RESERVED' }),
    }));
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: LEAD }, data: { status: 'BOOKED' } });
    expect(prisma.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'STATUS_CHANGE',
        metadata: expect.objectContaining({ to: 'BOOKED', reason: 'booking confirmed' }),
      }),
    }));
  });

  it('reuses the existing customer matched by phone instead of creating a duplicate', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking());
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(201);
    expect(prisma.customer.findFirst).toHaveBeenCalledWith({ where: { organizationId: ORG, phone: '+91 90000 00000' } });
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('creates a customer from lead details when no phone match exists', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue(customer({ id: CUSTOMER }));
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking());
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(201);
    expect(prisma.customer.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        name: 'Rohit Sharma',
        phone: '+91 90000 00000',
        email: 'rohit@example.com',
        assignedToId: EXEC,
      },
    });
  });

  it('returns 404 when the unit is outside the organization', async () => {
    admin();
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.property.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('returns 409 when the unit is SOLD or RESERVED', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property({ status: 'SOLD' }));
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 409 DUPLICATE_BOOKING when the lead already has an active booking', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(booking({ id: 'existing-booking' }));

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DUPLICATE_BOOKING');
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 CROSS_PROJECT_REFERENCE when the lead belongs to another project', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property({ projectId: PROJECT_OTHER }));
    prisma.lead.findFirst.mockResolvedValue(lead({ projectId: PROJECT }));

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CROSS_PROJECT_REFERENCE');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 404 for a quotation outside the organization', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 400 QUOTATION_LEAD_MISMATCH for a quotation owned by another lead', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(quotation({ leadId: LEAD_OTHER }));

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('QUOTATION_LEAD_MISMATCH');
  });

  it('returns 409 QUOTATION_NOT_ACCEPTED for a quotation that is not ACCEPTED', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(quotation({ status: 'SENT' }));

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('QUOTATION_NOT_ACCEPTED');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 400 UNIT_MISMATCH when the quotation unit differs from the booking unit', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(quotation({ propertyId: PROP_OTHER }));

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNIT_MISMATCH');
  });

  it('returns 400 AMOUNT_MISMATCH when the amount differs from the quotation total', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(quotation());

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE, amount: 999 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('AMOUNT_MISMATCH');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('converts an accepted quotation into a booking using the quotation amount (server authoritative)', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.lead.findFirst.mockResolvedValue(lead());
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.quotation.findFirst.mockResolvedValue(quotation());
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking({ quotationId: QUOTE }));
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .post(`/api/v1/leads/${LEAD}/bookings`)
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE, amount: 4500000 });

    expect(response.status).toBe(201);
    expect(prisma.booking.create.mock.calls[0][0].data).toMatchObject({
      quotationId: QUOTE,
      amount: 4500000,
      leadId: LEAD,
    });
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: LEAD }, data: { status: 'BOOKED' } });
  });

  it('rejects a quotationId on the direct booking route without a leadId (400)', async () => {
    admin();
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, quotationId: QUOTE, amount: 4500000, customerId: CUSTOMER });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Direct booking creation (POST /bookings)
// ---------------------------------------------------------------------------
describe('Phase 3: direct booking creation', () => {
  it('returns 400 for an invalid customerId uuid', async () => {
    admin();
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ customerId: 'nope', propertyId: PROP, amount: 100 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when the customer is outside the organization', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.customer.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ customerId: CUSTOMER, propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount with 400', async () => {
    admin();
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ customerId: CUSTOMER, propertyId: PROP, amount: -5 });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('reserves the unit and creates the booking on success (201)', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking({ leadId: null }));

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ customerId: CUSTOMER, propertyId: PROP, amount: 4500000, paymentStatus: 'PENDING' });

    expect(response.status).toBe(201);
    expect(prisma.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'RESERVED' }),
    }));
  });

  it('creates a customer inline from a customer payload when no customerId is given', async () => {
    admin();
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue(customer());
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.create.mockResolvedValue(booking({ leadId: null }));

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ propertyId: PROP, amount: 4500000, customer: { name: 'New Buyer', phone: '+91 91111 22222' } });

    expect(response.status).toBe(201);
    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: '+91 91111 22222', name: 'New Buyer' }),
    }));
    expect(prisma.booking.create.mock.calls[0][0].data.customerId).toBe(CUSTOMER);
  });

  it('returns 409 CONFLICT_CONCURRENCY when another transaction takes the unit first', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.property.findFirst.mockResolvedValue(property());
    prisma.property.updateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('admin-token'))
      .send({ customerId: CUSTOMER, propertyId: PROP, amount: 4500000 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT_CONCURRENCY');
    expect(prisma.booking.create).not.toHaveBeenCalled();
  });

  it('returns 403 when a channel partner tries to create a booking', async () => {
    mockSession('CHANNEL_PARTNER', EXEC);
    const response = await request(app)
      .post('/api/v1/bookings')
      .set('Cookie', cookie('cp-token'))
      .send({ customerId: CUSTOMER, propertyId: PROP, amount: 4500000 });
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Booking cancellation (PATCH /bookings/:id/cancel)
// ---------------------------------------------------------------------------
describe('Phase 3: cancellation safety', () => {
  it('returns 400 for a non-uuid booking id', async () => {
    admin();
    const response = await request(app)
      .patch('/api/v1/bookings/not-a-uuid/cancel')
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a booking outside the organization', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(null);
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(404);
  });

  it('returns 403 when an executive cancels a booking owned by someone else', async () => {
    exec();
    prisma.booking.findFirst.mockResolvedValue(booking({ assignedToId: EXEC_OTHER }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('exec-token'));
    expect(response.status).toBe(403);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 PAYMENT_COMPLETED when trying to cancel a fully paid booking', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'COMPLETED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYMENT_COMPLETED');
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent for an already cancelled booking and performs no writes', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'CANCELLED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe('CANCELLED');
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });

  it('cancels an active booking, releases only RESERVED inventory and writes the lead back', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.quotation.findFirst.mockResolvedValue({ id: QUOTE, status: 'SENT' });
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, status: 'BOOKED' });
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe('CANCELLED');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: BOOKING, paymentStatus: { in: ['PENDING', 'PARTIAL'] } }),
      data: { paymentStatus: 'CANCELLED' },
    }));
    // Guarded release: only a RESERVED unit may go back to AVAILABLE (never SOLD)
    expect(prisma.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: PROP, status: 'RESERVED' }),
      data: expect.objectContaining({ status: 'AVAILABLE' }),
    }));
    expect(prisma.lead.update).toHaveBeenCalledWith({ where: { id: LEAD }, data: { status: 'QUOTATION' } });
  });

  it('never attempts to release a SOLD unit back to AVAILABLE', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.property.updateMany.mockResolvedValue({ count: 0 }); // SOLD: guard does not match
    prisma.quotation.findFirst.mockResolvedValue(null);
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, status: 'BOOKED' });
    prisma.lead.update.mockResolvedValue({});
    prisma.leadActivity.create.mockResolvedValue({});

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));

    expect(response.status).toBe(200);
    // The release update is restricted to status RESERVED, so SOLD inventory is untouched
    expect(prisma.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'RESERVED' }),
    }));
    const releaseCall = prisma.property.updateMany.mock.calls[0][0];
    expect(releaseCall.where.status).toBe('RESERVED');
    expect(JSON.stringify(releaseCall.where)).not.toContain('SOLD');
  });

  it('does not query leads for bookings without lead provenance', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ leadId: null }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(1); // another active booking keeps the unit
    prisma.property.updateMany.mockResolvedValue({ count: 0 });

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/cancel`)
      .set('Cookie', cookie('admin-token'));

    expect(response.status).toBe(200);
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
    expect(prisma.property.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Payment completion and status transitions
// ---------------------------------------------------------------------------
describe('Phase 3: payments', () => {
  it('returns 409 when completing an already completed booking', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'COMPLETED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/complete`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_COMPLETED');
  });

  it('returns 409 when completing a cancelled booking', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'CANCELLED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/complete`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_CANCELLED');
  });

  it('completes payment and moves the unit from RESERVED to SOLD', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.property.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/complete`)
      .set('Cookie', cookie('admin-token'));

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe('COMPLETED');
    expect(prisma.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: PROP, status: 'RESERVED' }),
      data: expect.objectContaining({ status: 'SOLD' }),
    }));
  });

  it('rejects an invalid payment status enum with 400', async () => {
    admin();
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'BOGUS' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('allows PENDING -> PARTIAL transition', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'PENDING' }));
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'PARTIAL' });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe('PARTIAL');
    expect(prisma.booking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { paymentStatus: 'PARTIAL' },
    }));
  });

  it('returns 409 when demoting a COMPLETED payment to PARTIAL', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'COMPLETED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'PARTIAL' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PAYMENT_COMPLETED');
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when changing payment status on a cancelled booking', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'CANCELLED' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'PARTIAL' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ALREADY_CANCELLED');
  });

  it('is a no-op when the target status equals the current status', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking({ paymentStatus: 'PARTIAL' }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'PARTIAL' });
    expect(response.status).toBe(200);
    expect(prisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('routes a CANCELLED target through the cancellation flow', async () => {
    admin();
    prisma.booking.findFirst.mockResolvedValue(booking());
    prisma.booking.updateMany.mockResolvedValue({ count: 1 });
    prisma.booking.count.mockResolvedValue(0);
    prisma.property.updateMany.mockResolvedValue({ count: 1 });
    prisma.lead.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('admin-token'))
      .send({ paymentStatus: 'CANCELLED' });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe('CANCELLED');
  });

  it('returns 403 when an executive edits payment status on a booking owned by someone else', async () => {
    exec();
    prisma.booking.findFirst.mockResolvedValue(booking({ assignedToId: EXEC_OTHER }));
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('exec-token'))
      .send({ paymentStatus: 'PARTIAL' });
    expect(response.status).toBe(403);
  });

  it('returns 403 for an executive calling the payment status endpoint directly (no booking:update)', async () => {
    mockSession('SALES_EXECUTIVE', EXEC);
    const response = await request(app)
      .patch(`/api/v1/bookings/${BOOKING}/payment-status`)
      .set('Cookie', cookie('exec-token'))
      .send({ paymentStatus: 'PARTIAL' });
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Customer create/find/link flow
// ---------------------------------------------------------------------------
describe('Phase 3: customers', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).post('/api/v1/customers').send({ name: 'X', phone: '9876543210' });
    expect(response.status).toBe(401);
  });

  it('rejects a short phone number with 400', async () => {
    admin();
    const response = await request(app)
      .post('/api/v1/customers')
      .set('Cookie', cookie('admin-token'))
      .send({ name: 'Test', phone: '123' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 DUPLICATE_CUSTOMER for a phone already in the organization', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(customer({ id: CUSTOMER }));

    const response = await request(app)
      .post('/api/v1/customers')
      .set('Cookie', cookie('admin-token'))
      .send({ name: 'Clone', phone: '+91 90000 00000' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DUPLICATE_CUSTOMER');
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('creates a customer on success (201)', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.customer.create.mockResolvedValue(customer({ id: CUSTOMER }));

    const response = await request(app)
      .post('/api/v1/customers')
      .set('Cookie', cookie('admin-token'))
      .send({ name: 'Fresh Buyer', phone: '+91 92222 33333', email: 'fresh@example.com' });

    expect(response.status).toBe(201);
    expect(prisma.customer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: '+91 92222 33333', organizationId: ORG }),
    }));
  });

  it('returns 404 when assigning a customer to a user outside the organization', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/v1/customers')
      .set('Cookie', cookie('admin-token'))
      .send({ name: 'Assigned', phone: '+91 93333 44444', assignedToId: EXEC });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('USER_NOT_FOUND');
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid customer id', async () => {
    admin();
    const response = await request(app)
      .get('/api/v1/customers/oops')
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(400);
  });

  it('returns 404 for a customer outside the organization', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(null);
    const response = await request(app)
      .get(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(404);
  });

  it('returns the customer with bookings and lead provenance', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(customer({
      bookings: [{ id: BOOKING, lead: { id: LEAD, name: 'Rohit Sharma', status: 'BOOKED' } }],
    }));

    const response = await request(app)
      .get(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'));

    expect(response.status).toBe(200);
    expect(response.body.data.bookings[0].lead.id).toBe(LEAD);
  });

  it('blocks an executive from updating a customer assigned to someone else (403)', async () => {
    exec();
    prisma.customer.findFirst.mockResolvedValue(customer({ assignedToId: EXEC_OTHER }));
    const response = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('exec-token'))
      .send({ status: 'INACTIVE' });
    expect(response.status).toBe(403);
  });

  it('returns 409 when changing a phone number to one that already exists', async () => {
    admin();
    prisma.customer.findFirst
      .mockResolvedValueOnce(customer({ phone: '+91 11111 11111' }))
      .mockResolvedValueOnce(customer({ id: 'another-customer' }));

    const response = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'))
      .send({ phone: '+91 90000 00000' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DUPLICATE_CUSTOMER');
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('updates customer status (200)', async () => {
    admin();
    prisma.customer.findFirst.mockResolvedValue(customer());
    prisma.customer.update.mockResolvedValue(customer({ status: 'INACTIVE' }));

    const response = await request(app)
      .patch(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'))
      .send({ status: 'INACTIVE' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('INACTIVE');
  });

  it('returns 409 when deleting a customer that has bookings', async () => {
    mockSession('SUPER_ADMIN', 'admin-user');
    prisma.customer.findFirst.mockResolvedValue(customer({ _count: { bookings: 2 } }));
    const response = await request(app)
      .delete(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CUSTOMER_HAS_BOOKINGS');
    expect(prisma.customer.delete).not.toHaveBeenCalled();
  });

  it('deletes a customer with no bookings (success)', async () => {
    mockSession('SUPER_ADMIN', 'admin-user');
    prisma.customer.findFirst.mockResolvedValue(customer({ _count: { bookings: 0 } }));
    prisma.customer.delete.mockResolvedValue({});
    const response = await request(app)
      .delete(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(200);
    expect(prisma.customer.delete).toHaveBeenCalledWith({ where: { id: CUSTOMER } });
  });

  it('returns 403 for an admin deleting a customer (customer:delete is super-admin only)', async () => {
    admin();
    const response = await request(app)
      .delete(`/api/v1/customers/${CUSTOMER}`)
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(403);
  });

  it('returns 403 when a channel partner tries to create a customer', async () => {
    mockSession('CHANNEL_PARTNER', EXEC);
    const response = await request(app)
      .post('/api/v1/customers')
      .set('Cookie', cookie('cp-token'))
      .send({ name: 'Blocked', phone: '9876543210' });
    expect(response.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Booking list scoping
// ---------------------------------------------------------------------------
describe('Phase 3: booking list', () => {
  it('scopes the booking list to the assigned executive', async () => {
    exec();
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.booking.count.mockResolvedValue(0);

    const response = await request(app)
      .get('/api/v1/bookings')
      .set('Cookie', cookie('exec-token'));

    expect(response.status).toBe(200);
    expect(prisma.booking.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      assignedToId: EXEC,
    });
  });

  it('rejects an invalid paymentStatus filter with 400', async () => {
    admin();
    const response = await request(app)
      .get('/api/v1/bookings?paymentStatus=WEIRD')
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a non-uuid booking id', async () => {
    admin();
    const response = await request(app)
      .get('/api/v1/bookings/nope')
      .set('Cookie', cookie('admin-token'));
    expect(response.status).toBe(400);
  });
});
