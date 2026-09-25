// How big the editorial images are, so a page can leave the right gap for one
// before it arrives.
//
// The media grid draws whatever was uploaded, in whatever shape it happens to
// be, and every picture that loads pushes the rows below it down. The CMS does
// not record a size, so the server reads it off the file: sharp only parses the
// header, and the answer is kept until the file changes.
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');

// Files this can measure. A GIF is left out for the same reason it is never
// resized: what matters about one is that it moves.
const MEASURABLE = /\.(jpe?g|png|webp|avif)$/i;

// The editorial media live directly under /uploads; /uploads/users is where the
// visitors' own files go, a different directory and not the CMS's to describe.
const PREFIX = '/uploads/';

/**
 * A measurer over `dir`. Sizes are cached per file, keyed by what it was when
 * it was read, so a CMS publish that replaces an image is picked up.
 */
function createImageSizes({ dir }) {
    const cache = new Map();

    /** The size of one /uploads URL, or null when it cannot be measured. */
    async function sizeOf(url) {
        if (typeof url !== 'string' || !url.startsWith(PREFIX)) return null;
        const name = url.slice(PREFIX.length).split('?')[0];
        if (name.startsWith('users/') || !MEASURABLE.test(name)) return null;

        const file = path.join(dir, decodeURIComponent(name));
        if (path.relative(dir, file).startsWith('..')) return null;

        try {
            const stat = await fs.stat(file);
            const key = `${file}|${stat.mtimeMs}|${stat.size}`;
            const hit = cache.get(key);
            if (hit) return hit;

            const { width, height } = await sharp(file).metadata();
            if (!width || !height) return null;

            // One entry per file, so replacing an image does not leave the old
            // one behind for ever.
            for (const other of cache.keys()) {
                if (other.startsWith(`${file}|`)) cache.delete(other);
            }
            const size = { width, height };
            cache.set(key, size);
            return size;
        } catch {
            // A missing file, or one sharp will not read, simply has no size:
            // the page falls back to the layout it had before.
            return null;
        }
    }

    /**
     * The media entries with width and height added where they could be read.
     * An entry is never dropped or altered otherwise.
     */
    async function describe(items) {
        return Promise.all(items.map(async (item) => {
            const size = await sizeOf(item && (item.thumbnail || item.url));
            return size ? { ...item, ...size } : item;
        }));
    }

    return { sizeOf, describe, get cached() { return cache.size; } };
}

module.exports = { createImageSizes };
