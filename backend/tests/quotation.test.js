const QuotationService = require('../src/services/quotationService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { findFirst: jest.fn(), update: jest.fn() },
  project: { findFirst: jest.fn() },
  property: { findFirst: jest.fn() },
  quotation: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  leadActivity: { create: jest.fn() },
}));

const ORG = 'org-1';
const USER = 'user-1';

describe('QuotationService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createQuotation', () => {
    it('creates a DRAFT quotation without advancing the lead stage', async () => {
      const lead = { id: 'lead-1', status: 'SITE_VISIT', name: 'Rohit', phone: '999' };
      prisma.lead.findFirst.mockResolvedValue(lead);
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' });
      prisma.quotation.create.mockResolvedValue({ id: 'q-1', status: 'DRAFT', totalAmount: 1000000 });

      const tx = {
        quotation: { create: jest.fn().mockResolvedValue({ id: 'q-1', status: 'DRAFT', totalAmount: 1000000 }) },
        leadActivity: { create: jest.fn().mockResolvedValue({}) },
        lead: { update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb) => cb(tx));

      await QuotationService.createQuotation({ leadId: 'lead-1', projectId: 'proj-1', totalAmount: 1000000, status: 'DRAFT' }, ORG, USER);

      expect(tx.lead.update).not.toHaveBeenCalled();
    });

    it('creates a SENT quotation and advances lead SITE_VISIT -> QUOTATION', async () => {
      const lead = { id: 'lead-1', status: 'SITE_VISIT', name: 'Rohit', phone: '999' };
      prisma.lead.findFirst.mockResolvedValue(lead);
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' });

      const tx = {
        quotation: { create: jest.fn().mockResolvedValue({ id: 'q-1', status: 'SENT', totalAmount: 1000000 }) },
        leadActivity: { create: jest.fn().mockResolvedValue({}) },
        lead: { update: jest.fn().mockResolvedValue({ ...lead, status: 'QUOTATION' }) },
      };
      prisma.$transaction.mockImplementation(async (cb) => cb(tx));

      await QuotationService.createQuotation({ leadId: 'lead-1', projectId: 'proj-1', totalAmount: 1000000, status: 'SENT' }, ORG, USER);

      expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { status: 'QUOTATION' } });
      expect(tx.leadActivity.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'STATUS_CHANGE', metadata: expect.objectContaining({ from: 'SITE_VISIT', to: 'QUOTATION' }) })
      }));
    });

    it('does not advance a BOOKED lead', async () => {
      const lead = { id: 'lead-1', status: 'BOOKED', name: 'Rohit', phone: '999' };
      prisma.lead.findFirst.mockResolvedValue(lead);
      prisma.project.findFirst.mockResolvedValue({ id: 'proj-1' });

      const tx = {
        quotation: { create: jest.fn().mockResolvedValue({ id: 'q-1', status: 'SENT', totalAmount: 1000000 }) },
        leadActivity: { create: jest.fn().mockResolvedValue({}) },
        lead: { update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb) => cb(tx));

      await QuotationService.createQuotation({ leadId: 'lead-1', projectId: 'proj-1', totalAmount: 1000000, status: 'SENT' }, ORG, USER);

      expect(tx.lead.update).not.toHaveBeenCalled();
    });

    it('validates lead exists', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(QuotationService.createQuotation({ leadId: 'x', projectId: 'proj-1', totalAmount: 1 }, ORG, USER))
        .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
  });

  describe('updateQuotationStatus', () => {
    it('sending a quotation advances the lead to QUOTATION', async () => {
      prisma.quotation.findFirst.mockResolvedValue({ id: 'q-1', leadId: 'lead-1', status: 'DRAFT' });

      const tx = {
        quotation: { findFirst: jest.fn().mockResolvedValue({ id: 'q-1', leadId: 'lead-1', status: 'DRAFT' }), update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'SENT' }) },
        leadActivity: { create: jest.fn().mockResolvedValue({}) },
        lead: { findFirst: jest.fn().mockResolvedValue({ id: 'lead-1', status: 'FOLLOW_UP' }), update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb) => cb(tx));

      await QuotationService.updateQuotationStatus('q-1', 'SENT', ORG, USER);

      expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { status: 'QUOTATION' } });
    });

    it('rejects invalid status', async () => {
      await expect(QuotationService.updateQuotationStatus('q-1', 'INVALID', ORG, USER))
        .rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    });
  });
});
