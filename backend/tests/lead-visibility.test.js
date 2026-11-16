const LeadService = require('../src/services/leadService');
const TaskService = require('../src/services/taskService');
const SiteVisitService = require('../src/services/siteVisitService');
const QuotationService = require('../src/services/quotationService');
const BookingService = require('../src/services/bookingService');
const CustomerService = require('../src/services/customerService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  task: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  lead: { findFirst: jest.fn(), findMany: jest.fn() },
  siteVisit: { findFirst: jest.fn() },
  quotation: { findFirst: jest.fn() },
  booking: { findFirst: jest.fn() },
  customer: { findFirst: jest.fn() },
}));

const ORG = 'org-1';
const EXEC = 'exec-1';
const OTHER = 'other-1';
const LEAD = 'lead-1';

beforeEach(() => jest.clearAllMocks());

describe('employee lead visibility: follow-up toggle', () => {
  it('denies a restricted role a follow-up on another employee lead', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1', assignedToId: OTHER, status: 'PENDING',
      lead: { id: LEAD, assignedToId: OTHER },
    });

    await expect(
      LeadService.toggleFollowupStatus('task-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('allows a restricted role to toggle its own task', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1', assignedToId: EXEC, status: 'PENDING', lead: { id: LEAD, assignedToId: OTHER },
    });
    prisma.task.update.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await LeadService.toggleFollowupStatus('task-1', ORG, 'SALES_EXECUTIVE', EXEC);
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('allows a restricted role to toggle a follow-up on its own lead', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1', assignedToId: OTHER, status: 'PENDING', lead: { id: LEAD, assignedToId: EXEC },
    });
    prisma.task.update.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await LeadService.toggleFollowupStatus('task-1', ORG, 'CHANNEL_PARTNER', EXEC);
    expect(prisma.task.update).toHaveBeenCalled();
  });

  it('keeps owner/manager access unscoped', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1', assignedToId: OTHER, status: 'PENDING', lead: { id: LEAD, assignedToId: OTHER },
    });
    prisma.task.update.mockResolvedValue({ id: 'task-1', status: 'COMPLETED' });

    await LeadService.toggleFollowupStatus('task-1', ORG, 'ADMIN', 'admin-1');
    expect(prisma.task.update).toHaveBeenCalled();
  });
});

describe('employee lead visibility: task detail + creation', () => {
  it('denies task detail for another employee lead', async () => {
    prisma.task.findFirst.mockResolvedValue({
      id: 'task-1', assignedToId: OTHER, lead: { id: LEAD, assignedToId: OTHER },
    });

    await expect(
      TaskService.getTaskById('task-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('allows task detail when the lead is assigned to the employee', async () => {
    const task = { id: 'task-1', assignedToId: OTHER, lead: { id: LEAD, assignedToId: EXEC } };
    prisma.task.findFirst.mockResolvedValue(task);

    await expect(TaskService.getTaskById('task-1', ORG, 'SALES_EXECUTIVE', EXEC)).resolves.toBe(task);
  });

  it('blocks creating a task against another employee lead', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, assignedToId: OTHER });

    await expect(
      TaskService.createTask({ title: 'Call', dueDate: '2026-11-20', leadId: LEAD }, ORG, EXEC, 'SALES_EXECUTIVE')
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('allows creating a task against the employee own lead', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: LEAD, assignedToId: EXEC });
    prisma.task.create.mockResolvedValue({ id: 'task-1' });

    await TaskService.createTask({ title: 'Call', dueDate: '2026-11-20', leadId: LEAD }, ORG, EXEC, 'SALES_EXECUTIVE');
    expect(prisma.task.create).toHaveBeenCalled();
  });
});

describe('employee lead visibility: lead-linked records', () => {
  it('denies site visit detail for another employee lead', async () => {
    prisma.siteVisit.findFirst.mockResolvedValue({
      id: 'visit-1', assignedToId: OTHER, lead: { id: LEAD, assignedToId: OTHER },
    });

    await expect(
      SiteVisitService.getSiteVisitById('visit-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('allows site visit detail for the assigned employee', async () => {
    prisma.siteVisit.findFirst.mockResolvedValue({
      id: 'visit-1', assignedToId: EXEC, lead: { id: LEAD, assignedToId: EXEC },
    });

    await expect(SiteVisitService.getSiteVisitById('visit-1', ORG, 'SALES_EXECUTIVE', EXEC)).resolves.toBeTruthy();
  });

  it('denies quotation detail for another employee lead', async () => {
    prisma.quotation.findFirst.mockResolvedValue({
      id: 'quote-1', lead: { id: LEAD, assignedToId: OTHER },
    });

    await expect(
      QuotationService.getQuotationById('quote-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('denies booking detail for another employee lead', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: 'booking-1', assignedToId: OTHER, lead: { id: LEAD, assignedToId: OTHER },
    });

    await expect(
      BookingService.getBookingById('booking-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('denies customer detail for another employee', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', assignedToId: OTHER });

    await expect(
      CustomerService.getCustomerById('customer-1', ORG, 'SALES_EXECUTIVE', EXEC)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('keeps admin detail access unscoped for every lead-linked record', async () => {
    prisma.quotation.findFirst.mockResolvedValue({ id: 'quote-1', lead: { id: LEAD, assignedToId: OTHER } });
    prisma.booking.findFirst.mockResolvedValue({ id: 'booking-1', assignedToId: OTHER, lead: { id: LEAD, assignedToId: OTHER } });
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1', assignedToId: OTHER });

    await expect(QuotationService.getQuotationById('quote-1', ORG, 'ADMIN', 'admin-1')).resolves.toBeTruthy();
    await expect(BookingService.getBookingById('booking-1', ORG, 'ADMIN', 'admin-1')).resolves.toBeTruthy();
    await expect(CustomerService.getCustomerById('customer-1', ORG, 'ADMIN', 'admin-1')).resolves.toBeTruthy();
  });
});
