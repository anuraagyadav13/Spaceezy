const { normalizeMetaTemplateName } = require('../src/utils/metaTemplateName');

// Local template rows keep human names ("Property Quotation"); Meta's
// /messages endpoint rejects anything outside [a-z0-9_]. The provider
// normalizes with this exact function, and WhatsApp Manager templates must
// be created with the slug it produces — so both sides always agree.
describe('normalizeMetaTemplateName', () => {
  test('display names slug to Meta-compliant snake_case', () => {
    expect(normalizeMetaTemplateName('Property Quotation')).toBe('property_quotation');
    expect(normalizeMetaTemplateName('Brochure & Floor Plan')).toBe('brochure_floor_plan');
    expect(normalizeMetaTemplateName('  Site Visit Follow-up!  ')).toBe('site_visit_follow_up');
  });

  test('already-valid Meta names pass through unchanged (idempotent)', () => {
    expect(normalizeMetaTemplateName('property_quotation')).toBe('property_quotation');
    expect(normalizeMetaTemplateName('hello_world')).toBe('hello_world');
    expect(normalizeMetaTemplateName('offer2024')).toBe('offer2024');
  });

  test('empty or symbol-only input normalizes to empty (send path rejects it)', () => {
    expect(normalizeMetaTemplateName('')).toBe('');
    expect(normalizeMetaTemplateName(undefined)).toBe('');
    expect(normalizeMetaTemplateName('   ')).toBe('');
    expect(normalizeMetaTemplateName('!@#')).toBe('');
  });
});
