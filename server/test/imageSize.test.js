// Sizes read off the editorial images, for the media grid's layout. An entry
// that cannot be measured must come back exactly as it went in: the page then
// behaves as it did before, rather than breaking.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const sharp = require('sharp');

const { createImageSizes } = require('../imageSize');

let dir;
let sizes;

const png = (width, height) =>
    sharp({ create: { width, height, channels: 3, background: '#203040' } }).png().toBuffer();

test('setup', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-sizes-'));
    await fs.mkdir(path.join(dir, 'users'));
    await fs.writeFile(path.join(dir, 'wide.png'), await png(800, 200));
    await fs.writeFile(path.join(dir, 'tall.jpg'),
        await sharp({ create: { width: 300, height: 900, channels: 3, background: '#fff' } })
            .jpeg().toBuffer());
    await fs.writeFile(path.join(dir, 'a file.webp'),
        await sharp({ create: { width: 120, height: 120, channels: 3, background: '#fff' } })
            .webp().toBuffer());
    await fs.writeFile(path.join(dir, 'clip.gif'), 'not measured');
    await fs.writeFile(path.join(dir, 'broken.png'), 'not a png at all');
    await fs.writeFile(path.join(dir, 'users', 'theirs.png'), await png(50, 50));
    sizes = createImageSizes({ dir });
});

test('an image is measured, whatever its shape', async () => {
    assert.deepEqual(await sizes.sizeOf('/uploads/wide.png'), { width: 800, height: 200 });
    assert.deepEqual(await sizes.sizeOf('/uploads/tall.jpg'), { width: 300, height: 900 });
});

test('a name with a space or a query still finds its file', async () => {
    assert.deepEqual(await sizes.sizeOf('/uploads/a%20file.webp'), { width: 120, height: 120 });
    assert.deepEqual(await sizes.sizeOf('/uploads/wide.png?w=320'), { width: 800, height: 200 });
});

test('what cannot or should not be measured has no size', async () => {
    for (const url of [
        '/uploads/clip.gif',          // an animation is not a still
        '/uploads/broken.png',        // not the image its name claims
        '/uploads/missing.png',
        '/uploads/users/theirs.png',  // a visitor's file, not the CMS's
        '/uploads/../outside.png',
        '/elsewhere/wide.png',
        'https://example.com/x.png',
        undefined,
        null,
        42,
    ]) {
        assert.equal(await sizes.sizeOf(url), null, String(url));
    }
});

test('entries keep everything they had, and gain a size where there is one', async () => {
    const items = [
        { id: 'a', type: 'image', url: '/uploads/wide.png', title: 'Wide' },
        // A video is measured through its poster frame.
        { id: 'b', type: 'video', url: '/uploads/clip.mp4', thumbnail: '/uploads/tall.jpg' },
        { id: 'c', type: 'audio', url: '/uploads/tone.mp3', title: 'Tone' },
        { id: 'd', type: 'image', url: '/uploads/missing.png' },
        null,
    ];
    const described = await sizes.describe(items);

    assert.deepEqual(described[0], { id: 'a', type: 'image', url: '/uploads/wide.png', title: 'Wide', width: 800, height: 200 });
    assert.deepEqual(described[1].thumbnail, '/uploads/tall.jpg');
    assert.equal(described[1].width, 300);
    assert.equal(described[1].height, 900);
    // No size to add: the entry is the one that came in, untouched.
    assert.equal(described[2], items[2]);
    assert.equal(described[3], items[3]);
    assert.equal(described[4], null);
});

test('a file is measured once, and again once it is replaced', async () => {
    const fresh = createImageSizes({ dir });
    assert.equal(fresh.cached, 0);
    await fresh.sizeOf('/uploads/wide.png');
    await fresh.sizeOf('/uploads/wide.png');
    assert.equal(fresh.cached, 1, 'the second read came from the cache');

    // The CMS replaces an image keeping its name.
    await fs.writeFile(path.join(dir, 'wide.png'), await png(400, 400));
    assert.deepEqual(await fresh.sizeOf('/uploads/wide.png'), { width: 400, height: 400 });
    assert.equal(fresh.cached, 1, 'the stale entry did not pile up beside the new one');
});

test('teardown', async () => {
    await fs.rm(dir, { recursive: true, force: true });
});
