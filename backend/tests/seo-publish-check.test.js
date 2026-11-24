// Publish-time SEO gate + configuration normalisation (no DB, no HTTP).

const { projectPublishIssues, unitPublishIssues, unitPriceError } = require('../src/utils/seoPublishCheck');
const { canonicalConfigurationLabel } = require('../src/utils/propertyRequirement');

describe('publish-time SEO checks', () => {
    const completeProject = () => ({
        isPublic: true,
        districtId: 'district-1',
        regionId: 'region-1',
        startingPrice: 4500000,
        possessionDate: '2027-12-31',
        reraRegistered: true,
        reraNumber: 'RERA-TEST-1',
        description: 'x'.repeat(300),
        images: ['a', 'b', 'c'],
        amenities: ['Lift']
    });

    it('has no warnings for a complete published project', () => {
        expect(projectPublishIssues(completeProject(), { configurationCount: 2 })).toEqual([]);
    });

    it('lists every missing field for an incomplete project', () => {
        const issues = projectPublishIssues({
            isPublic: true,
            reraRegistered: true,
            description: 'short',
            images: [],
            amenities: []
        });
        expect(issues.join(' ')).toMatch(/Location is required/);
        expect(issues.join(' ')).toMatch(/configuration is required/);
        expect(issues.join(' ')).toMatch(/starting price/);
        expect(issues.join(' ')).toMatch(/Possession date/);
        expect(issues.join(' ')).toMatch(/RERA number/);
        expect(issues.join(' ')).toMatch(/Description/);
        expect(issues.join(' ')).toMatch(/gallery images/);
        expect(issues.join(' ')).toMatch(/amenity/);
    });

    it('does not warn for unpublished drafts', () => {
        expect(projectPublishIssues({ ...completeProject(), isPublic: false })).toEqual([]);
    });

    it('hard-blocks a unit priced below the project floor only', () => {
        expect(unitPriceError(4000000, { startingPrice: 4500000 })).toMatch(/below the project starting price/);
        expect(unitPriceError(4500000, { startingPrice: 4500000 })).toBeNull();
        expect(unitPriceError(5000000, { startingPrice: 4500000 })).toBeNull();
        expect(unitPriceError(100, { startingPrice: null })).toBeNull();
    });

    it('warns about incomplete published units but not drafts', () => {
        const incomplete = { isPublic: true };
        expect(unitPublishIssues(incomplete).length).toBeGreaterThan(0);
        expect(unitPublishIssues({ ...incomplete, isPublic: false })).toEqual([]);
    });
});

describe('configuration labels', () => {
    it('normalises whitespace and BHK spelling to one controlled label', () => {
        expect(canonicalConfigurationLabel('  2   bhk ')).toBe('2 BHK');
        expect(canonicalConfigurationLabel('3BHK')).toBe('3 BHK');
        expect(canonicalConfigurationLabel(' 2 - bhk ')).toBe('2 BHK');
    });
});
