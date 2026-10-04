const LeadService = require('../src/services/leadService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  $transaction: jest.fn(),
  lead: { create: jest.fn(), },
  leadActivity: { create: jest.fn(), findMany: jest.fn() },
  task: { findMany: jest.fn() },
}));

describe('LeadService.createLead legacy field compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps legacy assignedTo/stage fields to the Prisma schema fields', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 'lead-1' });
    const activityMock = jest.fn().mockResolvedValue({ id: 'activity-1' });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        lead: { create: createMock },
        leadActivity: { create: activityMock },
      };
      return callback(tx);
    });

    await LeadService.createLead({
      name: 'Anurag Yadav',
      phone: '9267903565',
      email: 'anurag@example.com',
      source: 'Website',
      assignedTo: 'user-456',
      stage: 'NEW',
      project: 'Alpha Residency',
      budget: '₹1.5 Cr',
    }, 'org-123', 'user-123');

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Anurag Yadav',
        phone: '9267903565',
        email: 'anurag@example.com',
        source: 'Website',
        assignedToId: 'user-456',
        status: 'NEW',
        organizationId: 'org-123',
        createdById: 'user-123',
      }),
    });
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('assignedTo');
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('stage');
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('project');
  });

  it('parses budget strings into numeric values', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 'lead-budget' });
    const activityMock = jest.fn().mockResolvedValue({ id: 'act-budget' });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = { lead: { create: createMock }, leadActivity: { create: activityMock } };
      return callback(tx);
    });

    await LeadService.createLead({
      name: 'Budget Test',
      phone: '9999999999',
      budget: '₹1.5 Cr',
    }, 'org-123', 'user-123');

    expect(createMock.mock.calls[0][0].data).toHaveProperty('budget', 15000000);
  });

  it('drops unparseable budget values', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 'lead-budget-2' });
    const activityMock = jest.fn().mockResolvedValue({ id: 'act-budget-2' });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = { lead: { create: createMock }, leadActivity: { create: activityMock } };
      return callback(tx);
    });

    await LeadService.createLead({
      name: 'Budget Test 2',
      phone: '9999999998',
      budget: 'not-a-number',
    }, 'org-123', 'user-123');

    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('budget');
  });

  it('drops blank assignment values before writing to the lead record', async () => {
    const createMock = jest.fn().mockResolvedValue({ id: 'lead-2' });
    const activityMock = jest.fn().mockResolvedValue({ id: 'activity-2' });

    prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        lead: { create: createMock },
        leadActivity: { create: activityMock },
      };
      return callback(tx);
    });

    await LeadService.createLead({
      name: 'Blank assignment test',
      phone: '9999999999',
      email: 'blank-assignment@example.com',
      source: 'Website',
      assignedTo: '',
      assignedToId: '',
      stage: 'NEW',
    }, 'org-123', 'user-123');

    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Blank assignment test',
        phone: '9999999999',
        email: 'blank-assignment@example.com',
        source: 'Website',
        status: 'NEW',
        organizationId: 'org-123',
        createdById: 'user-123',
      })
    });
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('assignedTo');
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('assignedToId');
    expect(createMock.mock.calls[0][0].data).not.toHaveProperty('stage');
  });

  it('queries FOLLOW_UP tasks for the follow-ups feed', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    prisma.task.findMany = findManyMock;

    await LeadService.getFollowups('org-123', { limit: '25' }, 'ADMIN', 'user-123');

    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: 'org-123',
        type: 'FOLLOW_UP'
      }),
      take: 25
    }));
  });
});
