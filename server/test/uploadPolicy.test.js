const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { inspectUpload, displayName, storedName, SERVED_TYPES } = require('../uploadPolicy');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

const png = (options = {}) => {
    let image = sharp({ create: { width: 16, height: 16, channels: 3, background: '#c00' } }).png();
    if (options.exif) image = image.withExif(options.exif);
    return image.toBuffer();
};

// Three opaque frames of different colours, so no encoder can merge them.
async function animatedGif() {
    const frame = 8 * 8 * 4;
    const raw = Buffer.alloc(frame * 3);
    [[255, 0, 0], [0, 255, 0], [0, 0, 255]].forEach((rgb, i) => {
        for (let p = i * frame; p < (i + 1) * frame; p += 4) raw.set([...rgb, 255], p);
    });
    return sharp(raw, { raw: { width: 8, height: 24, channels: 4, pageHeight: 8 } })
        .gif({ delay: [100, 100, 100], loop: 0 })
        .toBuffer();
}

const rejected = (promise) => promise.then(
    () => assert.fail('the file should have been refused'),
    (err) => { assert.equal(err.status, 415); return err; }
);

const EXIF = { IFD0: { Copyright: 'OWNER-SECRET', Artist: 'Someone' } };

test('a PNG is accepted and re-encoded without its EXIF', async () => {
    const input = await png({ exif: EXIF });
    assert.ok((await sharp(input).metadata()).exif, 'the fixture carries EXIF');

    const { ext, mime, data } = await inspectUpload(input);
    assert.equal(ext, 'png');
    assert.equal(mime, 'image/png');
    const meta = await sharp(data).metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, 16);
    assert.equal(meta.exif, undefined);
    assert.ok(!data.includes('OWNER-SECRET'));
});

test('a JPEG loses its EXIF and GPS position but keeps its orientation', async () => {
    const blank = { width: 20, height: 10, channels: 3, background: '#0c0' };
    const input = await sharp({ create: blank })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .withExifMerge({
            IFD0: { Copyright: 'OWNER-SECRET' },
            IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '46/1 12/1 0/1', GPSMapDatum: 'GPS-SECRET' }
        })
        .toBuffer();
    assert.equal((await sharp(input).metadata()).orientation, 6);
    assert.ok(input.includes('OWNER-SECRET') && input.includes('GPS-SECRET'));

    const { ext, data } = await inspectUpload(input);
    assert.equal(ext, 'jpg');
    const meta = await sharp(data).metadata();
    assert.equal(meta.exif, undefined);
    assert.ok(!data.includes('OWNER-SECRET') && !data.includes('GPS-SECRET'));
    // Orientation 6 is a quarter turn: the stored pixels are turned instead.
    assert.deepEqual([meta.width, meta.height], [10, 20]);
});

test('animated GIF and WebP keep all their frames', async () => {
    const gif = await animatedGif();
    const fromGif = await inspectUpload(gif);
    assert.equal(fromGif.ext, 'gif');
    assert.equal((await sharp(fromGif.data).metadata()).pages, 3);

    const webp = await sharp(gif, { animated: true }).webp().toBuffer();
    const fromWebp = await inspectUpload(webp);
    assert.equal(fromWebp.ext, 'webp');
    assert.equal((await sharp(fromWebp.data).metadata()).pages, 3);
});

test('audio and video are recognised by their bytes and kept as sent', async () => {
    const cases = [
        ['tone.mp3', 'mp3', 'audio/mpeg'],
        ['tone.ogg', 'ogg', 'audio/ogg'],
        ['tone.opus', 'ogg', 'audio/ogg'],
        ['tone.wav', 'wav', 'audio/wav'],
        ['clip.mp4', 'mp4', 'video/mp4'],
        ['clip.webm', 'webm', 'video/webm']
    ];
    for (const [name, ext, mime] of cases) {
        const input = fixture(name);
        const result = await inspectUpload(input);
        assert.equal(result.ext, ext, name);
        assert.equal(result.mime, mime, name);
        assert.ok(result.data.equals(input), `${name} is stored unchanged`);
    }
});

test('HTML, SVG, XML, PDF and plain text are refused', async () => {
    const inputs = [
        '<!doctype html><html><script>alert(document.cookie)</script></html>',
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
        '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF',
        'just some text'
    ];
    for (const input of inputs) await rejected(inspectUpload(Buffer.from(input)));
});

test('HTML renamed to .png is refused: the name is never looked at', async () => {
    // inspectUpload does not even receive the name; the server route is tested too.
    await rejected(inspectUpload(Buffer.from('<html><body>hi</body></html>')));
});

test('a polyglot, real media with markup inside, is refused', async () => {
    // A valid PNG with a page appended: it decodes fine, and a sniffing browser
    // would find the script.
    const image = Buffer.concat([await png(), Buffer.from('<script>alert(1)</script>')]);
    const err = await rejected(inspectUpload(image));
    assert.match(err.message, /markup/);

    // A GIF header whose "image data" is a page (the classic GIFAR shape).
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.from('<html><body>x</body></html>')]);
    await rejected(inspectUpload(gif));

    // Audio is not re-encoded, so the markup check is what catches it there.
    const mp3 = Buffer.concat([fixture('tone.mp3'), Buffer.from('<iframe src=//evil>')]);
    await rejected(inspectUpload(mp3));
});

test('an image that does not decode is refused', async () => {
    const whole = await sharp({ create: { width: 64, height: 64, channels: 3, noise: {
        type: 'gaussian', mean: 128, sigma: 40
    } } }).png().toBuffer();
    const err = await rejected(inspectUpload(whole.subarray(0, Math.floor(whole.length / 2))));
    assert.match(err.message, /could not be read/);
});

test('display names lose their path, control characters and excess length', () => {
    assert.equal(displayName('../../x.html'), 'x.html');
    assert.equal(displayName('..\\..\\windows\\evil.png'), 'evil.png');
    assert.equal(displayName('a\u0000b\u0007c\u001b[31m\u007f.png'), 'abc[31m.png');
    // The right-to-left override that makes "gpj.exe" display as "exe.jpg".
    assert.equal(displayName('photo\u202egpj.exe'), 'photogpj.exe');
    assert.equal(displayName('..'), 'file');
    assert.equal(displayName(''), 'file');
    assert.equal(displayName('é'.repeat(150)), 'é'.repeat(100));
    assert.equal(displayName('Vacances à la mer.jpg'), 'Vacances à la mer.jpg');
});

test('stored names are random and use only the detected extension', () => {
    const a = storedName('png');
    assert.match(a, /^[0-9a-f]{32}\.png$/);
    assert.notEqual(a, storedName('png'));
    assert.deepEqual(Object.keys(SERVED_TYPES).sort(),
        ['gif', 'jpg', 'mp3', 'mp4', 'ogg', 'png', 'wav', 'webm', 'webp']);
});
