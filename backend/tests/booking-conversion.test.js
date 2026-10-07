const BookingService = require('../src/services/bookingService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { findFirst: jest.fn(), update: jest.fn() },
  customer: { findFirst: jest.fn(), create: jest.fn() },
}));

const ORG = 'org-1';
const USER = 'user-1';

function makeTx(overrides = {}) {
  return {
    customer: { findFirst: jest.fn(), create: jest.fn() },
    property: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    booking: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
    lead: { findFirst: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
    quotation: { findFirst: jest.fn() },
    ...overrides
  };
}

function runTx(tx, result) {
  prisma.$transaction.mockImplementation(async (cb) => cb(tx));
  return result;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('BookingService.createBookingFromLead', () => {
  beforeEach(() => jest.clearAllMocks());

  it('validates the lead exists in the organization', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(BookingService.createBookingFromLead('missing', { propertyId: 'p1', amount: 100 }, ORG, USER, 'ADMIN'))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('blocks an executive from converting a lead assigned to someone else', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'l1', assignedToId: 'other', phone: '999' });

    await expect(BookingService.createBookingFromLead('l1', { propertyId: 'p1', amount: 100 }, ORG, USER, 'SALES_EXECUTIVE'))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it('delegates conversion to createBooking with the lead scope', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'l1', name: 'Rohit', phone: '9998887776', email: 'r@x.com', assignedToId: 'exec-1' });
    const spy = jest.spyOn(BookingService, 'createBooking').mockResolvedValue({ id: 'b1' });

    await BookingService.createBookingFromLead('l1', { propertyId: 'p1', amount: 5000000 }, ORG, USER, 'ADMIN');

    expect(spy).toHaveBeenCalledWith(
      { propertyId: 'p1', amount: 5000000, paymentStatus: undefined, leadId: 'l1' },
      ORG, USER, 'ADMIN'
    );
    // Customer resolution happens inside the booking transaction, not before
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('creates the customer inside the transaction from lead details when no customer matches', async () => {
    const tx = makeTx({
      property: { findFirst: jest.fn().mockResolvedValue({ id: 'p1', projectId: 'proj-1', status: 'AVAILABLE', version: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
      lead: { findFirst: jest.fn().mockResolvedValue({ id: 'l1', name: 'Rohit', phone: '9998887776', email: 'r@x.com', assignedToId: 'exec-1', status: 'QUOTATION', projectId: null, propertyId: null }), update: jest.fn() },
      customer: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cust-new', name: 'Rohit' })
      },
      booking: { create: jest.fn().mockResolvedValue({ id: 'b1' }), findFirst: jest.fn().mockResolvedValue(null), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() }
    });
    runTx(tx);

    await BookingService.createBookingFromLead('l1', { propertyId: 'p1', amount: 100 }, ORG, USER, 'ADMIN');

    expect(tx.customer.findFirst).toHaveBeenCalledWith({ where: { organizationId: ORG, phone: '9998887776' } });
    expect(tx.customer.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, name: 'Rohit', phone: '9998887776', email: 'r@x.com', assignedToId: 'exec-1' }
    });
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'l1', customerId: 'cust-new' })
    });
  });

  it('prefers explicit customer payload over lead details', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'l1', name: 'Rohit', phone: '999', email: null, assignedToId: 'exec-1' });
    const spy = jest.spyOn(BookingService, 'createBooking').mockResolvedValue({ id: 'b1' });

    await BookingService.createBookingFromLead('l1', { propertyId: 'p1', amount: 100, customer: { name: 'Explicit', phone: '111', email: 'e@x.com' } }, ORG, USER, 'ADMIN');

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'l1',
        customer: { name: 'Explicit', phone: '111', email: 'e@x.com' }
      }),
      ORG, USER, 'ADMIN'
    );
  });
});

describe('BookingService.createBooking (lead sync)', () => {
  beforeEach(() => jest.clearAllMocks());

  function txForBooking(lead, leadId) {
    return makeTx({
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'cust-1', name: 'Rohit' }) },
      property: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', projectId: 'proj-1', status: 'AVAILABLE', version: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn()
      },
      booking: { create: jest.fn().mockResolvedValue({ id: 'b1' }), findFirst: jest.fn(), update: jest.fn(), count: jest.fn() },
      lead: { findFirst: jest.fn().mockResolvedValue(lead), update: jest.fn() }
    });
  }

  it('creates booking with leadId and advances the lead to BOOKED with an audit activity', async () => {
    const tx = txForBooking({ id: 'l1', status: 'QUOTATION' }, 'l1');
    runTx(tx);

    await BookingService.createBooking({ customerId: 'cust-1', propertyId: 'p1', amount: 5000000, leadId: 'l1' }, ORG, USER, 'ADMIN');

    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'l1', organizationId: ORG, amount: 5000000 })
    });
    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'BOOKED' } });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'STATUS_CHANGE',
        metadata: { from: 'QUOTATION', to: 'BOOKED', reason: 'booking confirmed', bookingId: 'b1' }
      })
    }));
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'NOTE', description: 'Booking confirmed for Rohit' })
    }));
  });

  it('does not re-write status when the lead is already BOOKED but still logs the note', async () => {
    const tx = txForBooking({ id: 'l1', status: 'BOOKED' }, 'l1');
    runTx(tx);

    await BookingService.createBooking({ customerId: 'cust-1', propertyId: 'p1', amount: 100, leadId: 'l1' }, ORG, USER, 'ADMIN');

    expect(tx.lead.update).not.toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'BOOKED' } });
    expect(tx.leadActivity.create).toHaveBeenCalledTimes(1);
  });

  it('skips all lead writes when there is no leadId', async () => {
    const tx = txForBooking(null, null);
    runTx(tx);

    await BookingService.createBooking({ customerId: 'cust-1', propertyId: 'p1', amount: 100 }, ORG, USER, 'ADMIN');

    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: null })
    });
  });

  it('rejects when the lead belongs to another organization', async () => {
    const tx = txForBooking(null, 'l1');
    tx.lead.findFirst.mockResolvedValue(null);
    runTx(tx);

    await expect(BookingService.createBooking({ customerId: 'cust-1', propertyId: 'p1', amount: 100, leadId: 'l1' }, ORG, USER, 'ADMIN'))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(tx.booking.create).not.toHaveBeenCalled();
    expect(tx.property.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when the property was concurrently taken by another user', async () => {
    const tx = txForBooking(null, null);
    tx.property.updateMany.mockResolvedValue({ count: 0 });
    runTx(tx);

    await expect(BookingService.createBooking({ customerId: 'cust-1', propertyId: 'p1', amount: 100 }, ORG, USER, 'ADMIN'))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT_CONCURRENCY' });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });
});

describe('BookingService.cancelBooking (lead write-back)', () => {
  beforeEach(() => jest.clearAllMocks());

  function txForCancel({ bookingLeadId, lead, activeQuotation }) {
    return makeTx({
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', paymentStatus: 'PENDING', propertyId: 'p1', leadId: bookingLeadId, assignedToId: USER }),
        update: jest.fn().mockResolvedValue({ id: 'b1', paymentStatus: 'CANCELLED' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn()
      },
      property: { update: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      lead: { findFirst: jest.fn().mockResolvedValue(lead), update: jest.fn() },
      quotation: { findFirst: jest.fn().mockResolvedValue(activeQuotation) }
    });
  }

  it('moves a BOOKED lead with an active quotation back to QUOTATION', async () => {
    const tx = txForCancel({ bookingLeadId: 'l1', lead: { id: 'l1', status: 'BOOKED' }, activeQuotation: { id: 'q1', status: 'SENT' } });
    runTx(tx);

    await BookingService.cancelBooking('b1', ORG, USER, 'ADMIN');

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'QUOTATION' } });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: 'STATUS_CHANGE',
        metadata: { from: 'BOOKED', to: 'QUOTATION', reason: 'booking cancelled', bookingId: 'b1' }
      })
    }));
    // Release is guarded: only RESERVED inventory may return to AVAILABLE
    expect(tx.property.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'p1', status: 'RESERVED' }),
      data: expect.objectContaining({ status: 'AVAILABLE' })
    }));
  });

  it('moves a BOOKED lead without an active quotation back to CONTACTED', async () => {
    const tx = txForCancel({ bookingLeadId: 'l1', lead: { id: 'l1', status: 'BOOKED' }, activeQuotation: null });
    runTx(tx);

    await BookingService.cancelBooking('b1', ORG, USER, 'ADMIN');

    expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'CONTACTED' } });
  });

  it('does not touch the lead when its status is no longer BOOKED', async () => {
    const tx = txForCancel({ bookingLeadId: 'l1', lead: { id: 'l1', status: 'LOST' }, activeQuotation: null });
    runTx(tx);

    await BookingService.cancelBooking('b1', ORG, USER, 'ADMIN');

    expect(tx.lead.update).not.toHaveBeenCalled();
    expect(tx.leadActivity.create).not.toHaveBeenCalled();
  });

  it('does not query leads for bookings that were not created from a lead', async () => {
    const tx = txForCancel({ bookingLeadId: null, lead: null, activeQuotation: null });
    runTx(tx);

    await BookingService.cancelBooking('b1', ORG, USER, 'ADMIN');

    expect(tx.lead.findFirst).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });

  it('is idempotent for already cancelled bookings', async () => {
    const tx = makeTx({
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: 'b1', paymentStatus: 'CANCELLED', propertyId: 'p1', leadId: 'l1' }),
        update: jest.fn(),
        count: jest.fn()
      }
    });
    runTx(tx);

    await BookingService.cancelBooking('b1', ORG, USER, 'ADMIN');

    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(tx.lead.update).not.toHaveBeenCalled();
  });
});
