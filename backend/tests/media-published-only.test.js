// /media must only stream images attached to published listings.

const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

process.env.AWS_S3_BUCKET = 'private-bucket';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_S3_PREFIX = 'uploads';
delete process.env.AWS_S3_PUBLIC_BASE_URL;

const imageUrl = (name) => `https://private-bucket.s3.ap-south-1.amazonaws.com/uploads/${name}`;

jest.mock('@aws-sdk/client-s3', () => {
    const { Readable } = require('stream');
    return {
        S3Client: class {
            send() {
            return Promise.resolve({
                Body: Readable.from([Buffer.from('not-really-an-image')]),
                ContentType: 'image/png',
                ETag: '"etag"',
                ContentLength: 19,
            });
        }
    },
    GetObjectCommand: class {
        constructor(input) { this.input = input; }
    },
    };
});

jest.mock('../src/db/prisma', () => ({
    project: { findMany: jest.fn() },
    property: { findMany: jest.fn() },
}));

const prisma = require('../src/db/prisma');
const mediaRoutes = require('../src/routes/media');
const { resetMediaCache } = require('../src/utils/publicMedia');

const app = express();
app.use('/media', mediaRoutes);

describe('public media allow-list', () => {
    beforeEach(() => {
        resetMediaCache();
        // The DB query applies PUBLIC_PROJECT_WHERE: only these rows come back.
        prisma.project.findMany.mockResolvedValue([{ images: [imageUrl('published-project.jpg')] }]);
        prisma.property.findMany.mockResolvedValue([{ images: [imageUrl('published-unit.jpg')] }]);
    });

    it('serves images attached to a published project or unit', async () => {
        for (const name of ['published-project.jpg', 'published-unit.jpg']) {
            const response = await request(app).get(`/media/uploads/${name}`);
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/image\//);
        }
    });

    it('returns 404 for a CRM-only file even when the object exists in S3', async () => {
        const response = await request(app).get('/media/uploads/crm-only-draft.jpg');
        expect(response.status).toBe(404);
        expect(response.body.code).toBe('NOT_FOUND');
    });

    it('returns 404 for an orphan upload that is not attached to any listing', async () => {
        const response = await request(app).get('/media/uploads/orphan.jpg');
        expect(response.status).toBe(404);
    });

    it('still blocks non-image keys under the upload prefix', async () => {
        const response = await request(app).get('/media/uploads/backup.pdf');
        expect(response.status).toBe(404);
    });

    it('queries visibility with the public project+unit filters', () => {
        return request(app).get('/media/uploads/published-project.jpg').then(() => {
            expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ isPublic: true }),
            }));
            expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
                where: expect.objectContaining({ isPublic: true }),
            }));
        });
    });
});
