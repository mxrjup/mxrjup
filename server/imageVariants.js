// Resized copies of the editorial images, made on the way out.
//
// The CMS stores whatever was uploaded: the home page's artwork is a 1024px PNG
// of 856 kB shown in a 300px square. Rather than ask an editor to export the
// right size, the site asks for one - /uploads/art.png?w=800 - and this builds
// it. Re-encoding to WebP is most of the saving on that file: 856 kB becomes
// 651 kB as a smaller PNG, and 113 kB as WebP.
//
// Derivatives are kept in memory, not on disk: the code checkout is replaced
// wholesale by a deploy and the visitor directory is committed to a repository
// every night, so neither is a place for a regenerable cache. A restart costs
// one re-encode per image actually asked for, which is a handful.
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// A fixed ladder, so a crawler walking ?w=1..2000 cannot fill the cache. A
// width that is not on it is not an error: the original is served instead.
const WIDTHS = [160, 320, 480, 640, 800, 1200];

// What sharp may re-encode here. GIF is left out on purpose: resizing one drops
// every frame after the first, and the animation is the point.
const SOURCES = new Map([
    ['.jpg', 'jpeg'],
    ['.jpeg', 'jpeg'],
    ['.png', 'png'],
    ['.webp', 'webp'],
]);

const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Stated here rather than left to sharp's per-format defaults. The PNG palette
// is the deliberate one: what the CMS holds as PNG is drawings, where the
// quantising does not show and the fallback is 157 kB instead of 651 kB.
const ENCODE = {
    jpeg: { quality: 82 },
    webp: { quality: 82 },
    png: { palette: true, quality: 82 },
};

// Enough for every variant the site asks for several times over; the largest
// single entry is a fraction of it.
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

/** The requested width, or null when the request is not for a variant. */
function parseWidth(value) {
    const width = Number(value);
    return WIDTHS.includes(width) ? width : null;
}

/** The format to send: WebP when the browser said it takes it, else the source's. */
function pickFormat(sourceFormat, accept) {
    return String(accept || '').includes('image/webp') ? 'webp' : sourceFormat;
}

/**
 * A cache of rendered variants, bounded by total bytes and evicting the least
 * recently used. Values may be promises, so two requests for the same variant
 * arriving together share one encode rather than doing it twice.
 */
function createVariantCache({ maxBytes = MAX_CACHE_BYTES } = {}) {
    const entries = new Map();
    let bytes = 0;

    const evict = () => {
        for (const [key, entry] of entries) {
            if (bytes <= maxBytes) return;
            entries.delete(key);
            bytes -= entry.bytes;
        }
    };

    return {
        /** The cached buffer for `key`, rendering it with `render` if absent. */
        async get(key, render) {
            const hit = entries.get(key);
            if (hit) {
                // Re-inserting moves it to the end: the front is the coldest.
                entries.delete(key);
                entries.set(key, hit);
                return hit.body;
            }

            const body = render();
            const entry = { body, bytes: 0 };
            entries.set(key, entry);
            try {
                const buffer = await body;
                // A buffer that is on its own larger than the whole budget would
                // evict everything and then itself; it is served, not kept.
                if (buffer.length > maxBytes) {
                    entries.delete(key);
                    return buffer;
                }
                entry.bytes = buffer.length;
                bytes += buffer.length;
                evict();
                return buffer;
            } catch (err) {
                entries.delete(key);
                throw err;
            }
        },
        get size() {
            return entries.size;
        },
        get byteLength() {
            return bytes;
        },
    };
}

/**
 * Express middleware serving resized copies from `dir`. Anything it does not
 * handle - no ?w=, a width off the ladder, a format it will not touch, a file
 * it cannot read - falls through to whatever serves the originals.
 */
function createImageVariants({ dir, cache = createVariantCache() } = {}) {
    return async function imageVariants(req, res, next) {
        const width = parseWidth(req.query.w);
        if (!width) return next();

        const sourceFormat = SOURCES.get(path.extname(req.path).toLowerCase());
        if (!sourceFormat) return next();

        // req.path is already decoded and normalised by Express, but a file must
        // still be shown to be inside dir before it is read.
        const file = path.join(dir, req.path);
        if (path.relative(dir, file).startsWith('..')) return next();

        try {
            const stat = await fs.stat(file);
            if (!stat.isFile()) return next();

            const format = pickFormat(sourceFormat, req.headers.accept);
            // The CMS replaces an image keeping its name, so the identity of a
            // variant includes what the file was when it was made.
            const key = `${req.path}|${width}|${format}|${stat.mtimeMs}|${stat.size}`;
            const etag = `W/"v${Buffer.from(key).toString('base64url')}"`;

            // Same policy as the originals: a publish must show up at once, so
            // the browser keeps its copy but asks before using it.
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Content-Type', TYPES[format]);
            res.setHeader('ETag', etag);
            // The answer depends on whether the browser takes WebP.
            res.setHeader('Vary', 'Accept');

            if (req.headers['if-none-match'] === etag) return res.status(304).end();

            const body = await cache.get(key, () =>
                sharp(file)
                    .resize({ width, withoutEnlargement: true })
                    .toFormat(format, ENCODE[format])
                    .toBuffer());

            res.setHeader('Content-Length', body.length);
            return req.method === 'HEAD' ? res.end() : res.end(body);
        } catch (err) {
            // A file that is missing or that sharp will not read is not an error
            // here; the original handler answers it, 404 included.
            return next();
        }
    };
}

module.exports = { WIDTHS, parseWidth, pickFormat, createVariantCache, createImageVariants };
