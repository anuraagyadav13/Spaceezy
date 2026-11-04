const WhatsappTemplateService = require('../src/services/whatsappTemplateService');
const MetaWhatsAppProvider = require('../src/providers/whatsapp/metaProvider');
const prisma = require('../src/db/prisma');

jest.mock('../src/db/prisma', () => ({
  whatsAppTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const CREDENTIALS = { wabaId: '1541866680252874', accessToken: 'tok', phoneNumberId: '1087601824428987' };

const metaTemplate = (overrides = {}) => ({
  id: 'meta-1',
  name: 'enquiry_follow_up',
  status: 'APPROVED',
  category: 'MARKETING',
  language: 'en',
  components: [{ type: 'BODY', text: 'Hi {{1}}, following up about {{2}}. Reply to speak with {{3}} today.' }],
  ...overrides,
});

const stubGraph = (templates) => jest.spyOn(MetaWhatsAppProvider.prototype, 'graphGet')
  .mockResolvedValue({ data: templates });

beforeEach(() => {
  jest.clearAllMocks();
  WhatsappTemplateService.clearMetaTemplateCache();
  prisma.whatsAppTemplate.findMany.mockResolvedValue([]);
  prisma.whatsAppTemplate.findFirst.mockResolvedValue(null);
  prisma.whatsAppTemplate.create.mockImplementation(async ({ data }) => ({ id: 'tpl-new', ...data }));
  prisma.whatsAppTemplate.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Meta template guard: fail before sending with an actionable reason', () => {
  test('rejects a language the template is not approved in, naming the available ones', async () => {
    stubGraph([metaTemplate({ language: 'en_US' })]);
    await expect(WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 3,
    })).rejects.toMatchObject({ code: 'TEMPLATE_LANGUAGE_MISMATCH' });

    stubGraph([metaTemplate({ language: 'en_US' })]);
    await expect(WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 3,
    })).rejects.toThrow(/approved in en_US/);
  });

  test('rejects a parameter-count mismatch instead of letting Meta answer 132000', async () => {
    stubGraph([metaTemplate({ language: 'en' })]);
    await expect(WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 1,
    })).rejects.toMatchObject({ code: 'TEMPLATE_PARAMETER_MISMATCH' });
  });

  test('passes when name, language and count all match', async () => {
    stubGraph([metaTemplate({ language: 'en' })]);
    const result = await WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 3,
    });
    expect(result.checked).toBe(true);
    expect(result.template.language).toBe('en');
  });

  test('never blocks a send when Meta cannot be read (permission or network)', async () => {
    jest.spyOn(MetaWhatsAppProvider.prototype, 'graphGet')
      .mockRejectedValue(Object.assign(new Error('permission missing'), { statusCode: 502 }));
    const result = await WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 3,
    });
    expect(result).toMatchObject({ checked: false, reason: 'unavailable' });
  });

  test('rejects a name that does not exist on the WABA', async () => {
    stubGraph([metaTemplate({ name: 'other_template' })]);
    await expect(WhatsappTemplateService.assertSendable({
      credentials: CREDENTIALS,
      name: 'Enquiry Follow-up',
      language: 'en',
      variableCount: 3,
    })).rejects.toMatchObject({ code: 'TEMPLATE_NOT_APPROVED' });
  });
});

describe('Meta template sync: materialize approved templates as local rows', () => {
  test('updates an existing row body, language and variables from the matching variant', async () => {
    prisma.whatsAppTemplate.findMany.mockResolvedValue([{
      id: 'tpl-1',
      name: 'Enquiry Follow Up',
      language: 'en',
      category: 'MARKETING',
      variables: ['customer_name', 'project_name', 'salesperson_name'],
      body: 'stale body',
    }]);
    stubGraph([metaTemplate({ language: 'en' })]);

    const result = await WhatsappTemplateService.syncFromMeta(ORG, USER, CREDENTIALS);

    expect(result.updated).toBe(1);
    expect(result.imported).toBe(0);
    expect(prisma.whatsAppTemplate.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tpl-1' },
      data: expect.objectContaining({
        providerTemplateId: 'meta-1',
        language: 'en',
        variables: ['customer_name', 'project_name', 'salesperson_name'],
        body: 'Hi {{customer_name}}, following up about {{project_name}}. Reply to speak with {{salesperson_name}} today.',
      }),
    }));
  });

  test('creates a local row with positional names when the template is new and unknown to the library', async () => {
    stubGraph([metaTemplate({
      name: 'site_visit_reminder_two',
      language: 'en_US',
      components: [{ type: 'BODY', text: 'Hello {{1}}, see you at {{2}}.' }],
    })]);

    const result = await WhatsappTemplateService.syncFromMeta(ORG, USER, CREDENTIALS);

    expect(result.imported).toBe(1);
    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: ORG,
        variables: ['variable_1', 'variable_2'],
        language: 'en_US',
        providerTemplateId: 'meta-1',
        body: 'Hello {{variable_1}}, see you at {{variable_2}}.',
      }),
    }));
  });

  test('import selects the exact language variant when both en and en_US exist', async () => {
    stubGraph([
      metaTemplate({ id: 'meta-en-us', language: 'en_US', components: [{ type: 'BODY', text: 'Hi {{1}}, welcome.' }] }),
      metaTemplate({ id: 'meta-en', language: 'en' }),
    ]);

    await WhatsappTemplateService.importMetaTemplate(ORG, USER, CREDENTIALS, {
      name: 'enquiry_follow_up',
      language: 'en',
    });

    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        providerTemplateId: 'meta-en',
        language: 'en',
        variables: ['customer_name', 'project_name', 'salesperson_name'],
      }),
    }));
  });
});
