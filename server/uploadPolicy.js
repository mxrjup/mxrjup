const crypto = require('crypto');
const sharp = require('sharp');

/**
 * What an anonymous visitor of /computer may put on the site, and the form it is
 * stored in. Visitor files are served from the site's own domain, so anything the
 * browser could run there (HTML, SVG, XML, PDF...) would run with the site's cookies
 * and origin. The rules, in order:
 *
 *   1. The type is read from the file's bytes, never from its name or the Content-Type
 *      the client sent, and must be one the /computer app can show: images open in its
 *      photo viewer, audio and video play in the browser's own player.
 *   2. A file that also carries markup (a polyglot: valid media with HTML inside) is
 *      refused outright rather than trusted to the headers alone.
 *   3. Images are decoded and re-encoded, and only that copy is kept: whatever was
 *      hidden in the original (trailing data, metadata, EXIF GPS position) is gone.
 *      An image that does not decode is refused.
 *      Audio and video are kept as sent: re-encoding them would need ffmpeg on the
 *      host, and they are safe enough once their signature is checked and they are
 *      served with a fixed Content-Type, nosniff and a sandboxing CSP (server.js).
 *   4. The stored name is random, and its extension comes from the detected type, so
 *      the visitor controls neither.
 */

// Keyed by the extension file-type reports. `ext` is the one the file is stored
// under, `format` the name sharp gives to an image format it will re-encode.
const ACCEPTED = {
    jpg: { ext: 'jpg', mime: 'image/jpeg', format: 'jpeg' },
    png: { ext: 'png', mime: 'image/png', format: 'png' },
    gif: { ext: 'gif', mime: 'image/gif', format: 'gif' },
    webp: { ext: 'webp', mime: 'image/webp', format: 'webp' },
    mp3: { ext: 'mp3', mime: 'audio/mpeg' },
    ogg: { ext: 'ogg', mime: 'audio/ogg' },
    // Opus in an Ogg container: file-type names it apart, browsers play it as Ogg.
    opus: { ext: 'ogg', mime: 'audio/ogg' },
    wav: { ext: 'wav', mime: 'audio/wav' },
    mp4: { ext: 'mp4', mime: 'video/mp4' },
    webm: { ext: 'webm', mime: 'video/webm' }
};

// Content-Type of a stored visitor file, from the extension the server gave it.
// Anything else in the uploads directory predates these rules and is served as a
// download (see server.js).
const SERVED_TYPES = Object.fromEntries(
    Object.values(ACCEPTED).map(({ ext, mime }) => [ext, mime])
);

const ACCEPTED_LABEL = 'JPEG, PNG, GIF, WebP, MP3, OGG, WAV, MP4 or WebM';

// Markup that makes a browser, or anything sniffing the file, treat it as a page.
// Media bytes are close to random, and these sequences are long enough that a real
// file carrying one by chance is vanishingly rare; image metadata (XMP) uses none
// of them.
const MARKUP = /<script|<iframe|<html[\s>]|<body[\s>]|<svg[\s>]|<!doctype\s+html|javascript:/i;

// A 10 MB PNG can declare hundreds of megapixels and decode to gigabytes. 50 MP
// covers any phone photo; for an animation it bounds all frames together.
const MAX_INPUT_PIXELS = 50 * 1000 * 1000;
const MAX_NAME_LENGTH = 100;

// Re-encoding is one image at a time on a small host; the cache would only keep
// visitors' images in memory.
sharp.cache(false);

class UploadRejected extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// file-type is ESM-only from v17 on, and the versions that still load with require()
// have known parsing bugs; a dynamic import is the way in from CommonJS.
let fileTypeModule;
const loadFileType = () => (fileTypeModule ||= import('file-type'));

async function reencodeImage(buffer, format) {
    // animated keeps every frame of a GIF or WebP; the other formats have only one.
    const image = sharp(buffer, { animated: true, limitInputPixels: MAX_INPUT_PIXELS });
    const { format: decoded, pages = 1 } = await image.metadata();
    // sharp reads more than we accept (SVG among them): it must agree with file-type.
    if (decoded !== format) throw new Error(`signature says ${format}, sharp reads ${decoded}`);

    // Dropping EXIF drops the orientation too, so apply it to the pixels first.
    if (pages === 1) image.autoOrient();

    // sharp writes no metadata unless asked to (keepMetadata/withMetadata).
    switch (format) {
        case 'jpeg': return image.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
        case 'png': return image.png().toBuffer();
        case 'gif': return image.gif().toBuffer();
        case 'webp': return image.webp({ quality: 90 }).toBuffer();
        default: throw new Error(`no encoder for ${format}`);
    }
}

/**
 * Decide on an uploaded file from its bytes alone. Resolves to what should be stored:
 * { ext, mime, data }, where data is the re-encoded image or the audio/video as sent.
 * Rejects with UploadRejected (415) otherwise.
 */
async function inspectUpload(buffer) {
    const { fileTypeFromBuffer } = await loadFileType();
    const detected = await fileTypeFromBuffer(buffer);
    const accepted = detected && ACCEPTED[detected.ext];
    if (!accepted) {
        throw new UploadRejected(415, `This file type is not accepted. Upload ${ACCEPTED_LABEL}.`);
    }

    // latin1 maps each byte to one character, so the regex sees the raw bytes.
    if (MARKUP.test(buffer.toString('latin1'))) {
        throw new UploadRejected(415, 'This file contains markup and is not accepted.');
    }

    if (!accepted.format) return { ext: accepted.ext, mime: accepted.mime, data: buffer };

    let data;
    try {
        data = await reencodeImage(buffer, accepted.format);
    } catch (err) {
        throw new UploadRejected(415, 'This image could not be read.');
    }
    return { ext: accepted.ext, mime: accepted.mime, data };
}

/**
 * The visitor's file name, kept for display only. Everything up to the last path
 * separator goes, as do control characters and the bidirectional overrides that
 * make "gpj.exe" read as "exe.jpg".
 */
function displayName(original) {
    const base = String(original || '').split(/[/\\]/).pop();
    const clean = base
        .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .trim();
    const name = Array.from(clean).slice(0, MAX_NAME_LENGTH).join('').trim();
    return /^\.*$/.test(name) ? 'file' : name;
}

// 128 random bits: unguessable, and never mistaken for a "folder-" id.
const storedName = (ext) => `${crypto.randomBytes(16).toString('hex')}.${ext}`;

module.exports = {
    inspectUpload,
    displayName,
    storedName,
    UploadRejected,
    SERVED_TYPES,
    MAX_NAME_LENGTH
};
