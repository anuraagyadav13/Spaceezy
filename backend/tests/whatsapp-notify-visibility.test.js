const prisma = require('../src/db/prisma');
const WhatsappNotifyService = require('../src/services/whatsappNotifyService');
const WhatsappSettingsService = require('../src/services/whatsappSettingsService');

jest.mock('../src/db/prisma', () => ({
  $queryRaw: jest.fn(),
  whatsAppConversation: { findFirst: jest.fn(), update: jest.fn() },
  whatsAppMessage: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  whatsappNotification: { findMany: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const LEAD = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const THREAD = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER = 'ccccccc1-cccc-4ccc-8ccc-cccccccccccc';

beforeEach(() => {
  jest.clearAllMocks();
  prisma.whatsAppConversation.update.mockResolvedValue({});
  prisma.whatsAppMessage.create.mockImplementation(async ({ data }) => ({ id: 'msg-1', ...data }));
  prisma.whatsappNotification.update.mockResolvedValue({});
});

describe('Test Notify becomes visible in an existing thread', () => {
  test('sends readable sample values and the rendered body, not [TEST] labels', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ providerMessageId: 'wamid.test' });
    jest.spyOn(WhatsappSettingsService, 'getSettings').mockResolvedValue({
      notifyEnabled: true,
      notifyRecipients: [{ phone: '919876543210', label: 'Owner', enabled: true }],
      notifyTemplateName: 'Enquiry Follow-up',
    });
    jest.spyOn(WhatsappSettingsService, 'resolveTransport').mockResolvedValue({
      source: 'db',
      mode: 'mock',
      provider: { sendMessage },
      credentials: undefined,
    });
    jest.spyOn(WhatsappNotifyService, 'resolveTemplate').mockResolvedValue({
      name: 'Enquiry Follow-up',
      language: 'en',
      variables: ['customer_name', 'project_name', 'salesperson_name'],
      body: 'Hi {{customer_name}}, about {{project_name}} with {{salesperson_name}}.',
    });
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await WhatsappNotifyService.testNotify(ORG, USER);

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      templateName: 'Enquiry Follow-up',
      variables: ['Test Customer', 'Test Project', 'Sales Team'],
      body: 'Hi Test Customer, about Test Project with Sales Team.',
    }));
    expect(result).toMatchObject({
      ok: true,
      providerMessageId: 'wamid.test',
      threadMessageId: null,
    });
  });

  test('appends the rendered template when the recipient is a known lead', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: LEAD }]);
    prisma.whatsAppConversation.findFirst.mockResolvedValue({ id: THREAD });

    const created = await WhatsappNotifyService.recordTestInThread({
      organizationId: ORG,
      userId: USER,
      recipient: '+91 98996 09856',
      templateName: 'Enquiry Follow-up',
      body: 'Hi [TEST], following up about [TEST].',
      variables: ['[TEST]', '[TEST]', '[TEST]'],
      providerMessageId: 'wamid.test',
    });

    expect(created).toMatchObject({ id: 'msg-1' });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORG,
        conversationId: THREAD,
        leadId: LEAD,
        direction: 'OUTBOUND',
        status: 'SENT',
        body: 'Hi [TEST], following up about [TEST].',
        templateName: 'Enquiry Follow-up',
        providerMessageId: 'wamid.test',
      }),
    }));
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: THREAD },
      data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
    }));
  });

  test('never creates a conversation for a number that is not a lead', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    const created = await WhatsappNotifyService.recordTestInThread({
      organizationId: ORG,
      userId: USER,
      recipient: '919999999999',
      templateName: 'Enquiry Follow-up',
      body: 'Hi',
      variables: [],
      providerMessageId: 'wamid.test',
    });

    expect(created).toBeNull();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.findFirst).not.toHaveBeenCalled();
  });

  test('writes nothing when the lead has no conversation yet', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: LEAD }]);
    prisma.whatsAppConversation.findFirst.mockResolvedValue(null);

    const created = await WhatsappNotifyService.recordTestInThread({
      organizationId: ORG,
      userId: USER,
      recipient: '919999999999',
      templateName: 'Enquiry Follow-up',
      body: 'Hi',
      variables: [],
      providerMessageId: 'wamid.test',
    });

    expect(created).toBeNull();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });
});

describe('Delivery receipts advance the notification outbox', () => {
  test('DELIVERED only upgrades rows that are still SENT', async () => {
    prisma.whatsappNotification.findMany.mockResolvedValue([{ id: 'n-1' }]);

    await WhatsappNotifyService.handleStatusEvent(ORG, 'wamid.test', 'DELIVERED');

    expect(prisma.whatsappNotification.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, providerMessageId: 'wamid.test', status: 'SENT' },
    });
    expect(prisma.whatsappNotification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'DELIVERED' },
    });
  });

  test('FAILED records the provider reason so a lost message stops looking sent', async () => {
    prisma.whatsappNotification.findMany.mockResolvedValue([{ id: 'n-1', status: 'SENT' }]);

    await WhatsappNotifyService.handleStatusEvent(ORG, 'wamid.test', 'FAILED', 'Re-engagement required');

    expect(prisma.whatsappNotification.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        providerMessageId: 'wamid.test',
        status: { in: ['PENDING', 'SENT', 'DELIVERED'] },
      },
    });
    expect(prisma.whatsappNotification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'FAILED', error: 'Re-engagement required' },
    });
  });

  test('SENT never rewrites the outbox (the send path already did)', async () => {
    await WhatsappNotifyService.handleStatusEvent(ORG, 'wamid.test', 'SENT');
    expect(prisma.whatsappNotification.findMany).not.toHaveBeenCalled();
  });
});
