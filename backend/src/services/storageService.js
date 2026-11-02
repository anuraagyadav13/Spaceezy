// Env-gated S3 image storage (AWS SDK v3).
//
// Configuration is entirely environment-based; credentials come from the AWS
// default provider chain (EC2 IAM role in production, AWS_* env vars or shared
// credentials file locally). No credentials are ever hardcoded.
//
// When AWS_S3_BUCKET is unset the feature is disabled and callers receive a
// clear 501 instead of a broken upload.

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB
const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB — the brochure upload limit

let s3Client = null;

const getConfig = () => {
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket) return null;

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-south-1';
    const prefix = (process.env.AWS_S3_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');
    const publicBaseUrl = (process.env.AWS_S3_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

    return { bucket, region, prefix, publicBaseUrl };
};

const getS3Client = (region) => {
    if (!s3Client) {
        s3Client = new S3Client({ region });
    }
    return s3Client;
};

// Content sniffing — trust magic bytes, never the client-declared MIME type.
const sniffImageType = (buf) => {
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return { ext: 'jpg', contentType: 'image/jpeg' };
    }
    if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
        return { ext: 'png', contentType: 'image/png' };
    }
    if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        return { ext: 'webp', contentType: 'image/webp' };
    }
    if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') {
        return { ext: 'gif', contentType: 'image/gif' };
    }
    return null;
};

const publicUrlFor = (config, key) => {
    if (config.publicBaseUrl) return `${config.publicBaseUrl}/${key}`;
    if (config.region === 'us-east-1') return `https://${config.bucket}.s3.amazonaws.com/${key}`;
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
};

// The bucket is private, so direct object URLs always return 403. Rewrite
// stored bucket URLs to the public /media streaming route instead. Only URLs
// that point at this bucket's configured upload prefix are rewritten — every
// other URL (CDN, external hosts) passes through untouched.
const toMediaPath = (url) => {
    if (typeof url !== 'string') return url;
    const config = getConfig();
    if (!config) return url;
    const trimmed = url.trim();
    const origins = [
        config.publicBaseUrl ? `${config.publicBaseUrl}/` : null,
        `https://${config.bucket}.s3.${config.region}.amazonaws.com/`,
        `https://${config.bucket}.s3.amazonaws.com/`,
        `http://${config.bucket}.s3.${config.region}.amazonaws.com/`,
        `http://${config.bucket}.s3.amazonaws.com/`
    ].filter(Boolean);
    for (const origin of origins) {
        if (trimmed.startsWith(origin)) {
            const key = trimmed.slice(origin.length);
            if (key.startsWith(`${config.prefix}/`)) return `/media/${key}`;
        }
    }
    return url;
};

// Uploads one image buffer. Throws AppError-compatible failures upstream.
const uploadImage = async ({ buffer, organizationId }) => {
    const config = getConfig();
    if (!config) {
        const err = new Error('Image storage is not configured. Set AWS_S3_BUCKET to enable uploads.');
        err.statusCode = 501;
        err.code = 'S3_NOT_CONFIGURED';
        throw err;
    }

    if (!buffer || !buffer.length) {
        const err = new Error('Empty upload.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        const err = new Error('Image exceeds the 6 MB upload limit.');
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        throw err;
    }

    const sniffed = sniffImageType(buffer);
    if (!sniffed) {
        const err = new Error('Unsupported image format. Allowed: JPEG, PNG, WebP, GIF.');
        err.statusCode = 415;
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const rand = require('crypto').randomBytes(8).toString('hex');
    const scope = organizationId || 'global';
    const key = `${config.prefix}/${scope}/${yyyy}/${mm}/${Date.now()}-${rand}.${sniffed.ext}`;

    const client = getS3Client(config.region);
    await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: sniffed.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }));

    return { url: publicUrlFor(config, key), key };
};

// ---------------------------------------------------------------------------
// PDF documents (the optional project brochure).
//
// Same contract as images — one file, validated by magic bytes, 15 MB cap.
// Two readers of the same stored file: the public /public/documents route
// (WhatsApp delivery — Meta fetches it) and the authenticated
// GET /projects/:id/brochure (project page Preview). When S3 is not
// configured (local dev) files are stored on disk under backend/uploads
// (gitignored) so the whole brochure flow stays testable locally;
// production keeps using the bucket.
// ---------------------------------------------------------------------------

// Content sniffing — the %PDF- header, never the client-declared MIME type.
const isPdf = (buf) => buf.length > 5 && buf.toString('ascii', 0, 5) === '%PDF-';

// Disk storage root for local dev (no S3). Keys are always server-generated
// (<org>/<yyyy>/<mm>/<name>.pdf) — never client input.
const diskRoot = () => path.resolve(__dirname, '..', '..', 'uploads');

// The project documents JSON entry that represents the uploaded brochure.
// Matches the same /brochure/i rule the WhatsApp composer uses.
const findBrochureDocument = (documents) => {
    if (!Array.isArray(documents)) return null;
    for (const doc of documents) {
        if (doc && typeof doc === 'object' && (doc.url || doc.key)
            && /brochure/i.test(String(doc.name || doc.label || doc.type || ''))) {
            return doc;
        }
    }
    return null;
};

const uploadDocument = async ({ buffer, organizationId }) => {
    if (!buffer || !buffer.length) {
        const err = new Error('Empty upload.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
    }
    if (buffer.length > MAX_PDF_BYTES) {
        const err = new Error('PDF exceeds the 15 MB upload limit.');
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        throw err;
    }
    if (!isPdf(buffer)) {
        const err = new Error('Only PDF files are allowed.');
        err.statusCode = 415;
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        throw err;
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const rand = require('crypto').randomBytes(8).toString('hex');
    const scope = organizationId || 'global';

    const config = getConfig();
    if (config) {
        const key = `${config.prefix}/${scope}/${yyyy}/${mm}/${Date.now()}-${rand}.pdf`;
        const client = getS3Client(config.region);
        await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: buffer,
            ContentType: 'application/pdf',
            CacheControl: 'public, max-age=31536000, immutable',
        }));
        return { url: publicUrlFor(config, key), key, storage: 's3' };
    }

    // Local dev without S3 — plain disk under backend/uploads. The stored url
    // is informational only; delivery goes through /public/documents either way.
    const key = `${scope}/${yyyy}/${mm}/${Date.now()}-${rand}.pdf`;
    const full = path.resolve(diskRoot(), key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return { url: `/uploads/${key}`, key, storage: 'disk' };
};

// Opens a stored document for streaming (the public /documents route). The
// entry comes from the project's documents JSON, so it is never trusted: the
// disk path is re-resolved inside the uploads root (traversal guard) and S3
// keys must sit under the configured prefix and end in .pdf.
const readDocument = async (entry) => {
    if (!entry || typeof entry !== 'object') return null;
    const key = typeof entry.key === 'string' ? entry.key : '';
    if (!key) return null;

    if (entry.storage === 'disk') {
        const root = diskRoot();
        const full = path.resolve(root, key);
        if (!full.startsWith(root + path.sep)) return null; // traversal guard
        try {
            await fs.promises.access(full, fs.constants.R_OK);
        } catch {
            return null;
        }
        return { stream: fs.createReadStream(full), contentType: 'application/pdf' };
    }

    const config = getConfig();
    if (!config || !key.startsWith(`${config.prefix}/`) || !key.endsWith('.pdf')) return null;
    const client = getS3Client(config.region);
    const out = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    return { stream: out.Body, contentType: out.ContentType || 'application/pdf' };
};

module.exports = {
    uploadImage,
    sniffImageType,
    getConfig,
    publicUrlFor,
    toMediaPath,
    MAX_IMAGE_BYTES,
    MAX_PDF_BYTES,
    isPdf,
    findBrochureDocument,
    uploadDocument,
    readDocument
};
