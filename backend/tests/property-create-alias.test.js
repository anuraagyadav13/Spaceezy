const PropertyService = require('../src/services/propertyService');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  project: { findFirst: jest.fn() },
  property: { create: jest.fn() },
}));

describe('PropertyService.createProperty legacy compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps legacy property payload and strips unsupported aliases before Prisma create', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'project-123' });
    prisma.property.create.mockResolvedValue({ id: 'property-1' });

    await PropertyService.createProperty({
      name: 'Skyline Tower',
      project: 'project-123',
      price: '₹24.5 L',
      status: 'Available',
      type: 'Residential',
      category: 'Apartment',
      address: 'Noida'
    }, 'org-123');

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'project-123', organizationId: 'org-123' }
      })
    );

    expect(prisma.property.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Skyline Tower',
        projectId: 'project-123',
        price: 2450000,
        status: 'AVAILABLE',
        organizationId: 'org-123'
      })
    });

    expect(prisma.property.create.mock.calls[0][0].data).not.toHaveProperty('name');
    expect(prisma.property.create.mock.calls[0][0].data).not.toHaveProperty('project');
    expect(prisma.property.create.mock.calls[0][0].data).not.toHaveProperty('type');
  });
});
