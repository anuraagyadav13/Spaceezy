const prisma = require('../src/db/prisma');
const WhatsAppService = require('../src/services/whatsappService');
const WhatsappNotifyService = require('../src/services/whatsappNotifyService');

jest.mock('../src/db/prisma', () => ({
  whatsAppMessage: { findFirst: jest.fn(), update: jest.fn() },
}));

jest.mock('../src/services/whatsappNotifyService', () => ({
  handleStatusEvent: jest.fn().mockResolvedValue(undefined),
}));

const ORG = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Webhook status bridge for messages that only exist in the notify outbox', () => {
  test('a DELIVERED receipt with no thread row still reaches the outbox', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    const result = await WhatsAppService._processStatusEvent({
      providerMessageId: 'wamid.notify',
      status: 'delivered',
      error: null,
    }, ORG);

    expect(result).toEqual({ ok: true, ignored: true });
    expect(WhatsappNotifyService.handleStatusEvent).toHaveBeenCalledWith(
      ORG,
      'wamid.notify',
      'DELIVERED',
      null
    );
  });

  test('a FAILED receipt carries the provider reason to the outbox', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    await WhatsAppService._processStatusEvent({
      providerMessageId: 'wamid.notify',
      status: 'failed',
      error: 'Re-engagement required',
    }, ORG);

    expect(WhatsappNotifyService.handleStatusEvent).toHaveBeenCalledWith(
      ORG,
      'wamid.notify',
      'FAILED',
      'Re-engagement required'
    );
  });

  test('a real thread row is advanced and still bridged', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'm-1', status: 'SENT' });
    prisma.whatsAppMessage.update.mockResolvedValue({});

    const result = await WhatsAppService._processStatusEvent({
      providerMessageId: 'wamid.thread',
      status: 'read',
      eventId: 'evt-1',
    }, ORG);

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: { status: 'READ' },
    });
    expect(WhatsappNotifyService.handleStatusEvent).toHaveBeenCalledWith(
      ORG,
      'wamid.thread',
      'READ'
    );
    expect(result).toEqual({ ok: true, eventId: 'evt-1' });
  });

  test('a duplicate lower-ranked status never rewrites the thread row', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({ id: 'm-1', status: 'READ' });

    const result = await WhatsAppService._processStatusEvent({
      providerMessageId: 'wamid.thread',
      status: 'delivered',
    }, ORG);

    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, duplicate: true });
  });
});
