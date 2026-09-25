// Resized copies of the editorial images. The middleware is deliberately
// forgiving: everything it will not handle has to fall through to the handler
// that serves the originals, rather than turn into an error page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const sharp = require('sharp');

const {
    WIDTHS, parseWidth, pickFormat, createVariantCache, createImageVariants
} = require('../imageVariants');

/** A minimal stand-in for an Express response. */
function fakeRes() {
    const res = {
        headers: {},
        statusCode: 200,
        body: null,
        ended: false,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        end(body) { this.body = body ?? null; this.ended = true; return this; },
    };
    return res;
}

/** Run the middleware and report whether it answered or passed the request on. */
async function run(middleware, req) {
    const res = fakeRes();
    let passed = false;
    await middleware({ method: 'GET', query: {}, headers: {}, ...req }, res, () => { passed = true; });
    return { res, passed };
}

let dir;
let middleware;

test('setup', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-variants-'));
    await sharp({ create: { width: 1000, height: 500, channels: 3, background: '#4060a0' } })
        .jpeg().toFile(path.join(dir, 'wide.jpg'));
    await sharp({ create: { width: 400, height: 400, channels: 4, background: '#ffffff00' } })
        .png().toFile(path.join(dir, 'small.png'));
    await fs.writeFile(path.join(dir, 'clip.gif'), 'not really a gif');
    middleware = createImageVariants({ dir });
});

test('a width off the ladder is passed on, not refused', async () => {
    assert.equal(parseWidth('800'), 800);
    for (const bad of [undefined, '', '0', '-1', '801', '99999', 'abc', '800px', 'NaN']) {
        assert.equal(parseWidth(bad), null, String(bad));
    }
    for (const w of WIDTHS) assert.equal(parseWidth(String(w)), w);

    const { passed } = await run(middleware, { path: '/wide.jpg', query: { w: '801' } });
    assert.ok(passed, 'falls through to the originals');
});

test('a request without a width is passed on untouched', async () => {
    const { passed, res } = await run(middleware, { path: '/wide.jpg' });
    assert.ok(passed);
    assert.deepEqual(res.headers, {});
});

test('an image is resized, and never enlarged past its own size', async () => {
    const wide = await run(middleware, { path: '/wide.jpg', query: { w: '320' } });
    assert.ok(!wide.passed);
    assert.equal((await sharp(wide.res.body).metadata()).width, 320);

    // 800 is wider than the 400px source: it comes back at 400, not upscaled.
    const small = await run(middleware, { path: '/small.png', query: { w: '800' } });
    assert.equal((await sharp(small.res.body).metadata()).width, 400);
});

test('WebP is sent only to a browser that asked for it', async () => {
    assert.equal(pickFormat('png', 'image/avif,image/webp,*/*'), 'webp');
    assert.equal(pickFormat('png', 'image/png,*/*'), 'png');
    assert.equal(pickFormat('jpeg', undefined), 'jpeg');

    const webp = await run(middleware, {
        path: '/small.png', query: { w: '320' }, headers: { accept: 'image/webp,*/*' },
    });
    assert.equal(webp.res.headers['content-type'], 'image/webp');
    assert.equal((await sharp(webp.res.body).metadata()).format, 'webp');
    // Whoever caches this must know the answer depends on the request.
    assert.equal(webp.res.headers['vary'], 'Accept');

    const png = await run(middleware, {
        path: '/small.png', query: { w: '320' }, headers: { accept: 'image/png' },
    });
    assert.equal(png.res.headers['content-type'], 'image/png');
    assert.equal((await sharp(png.res.body).metadata()).format, 'png');
});

test('a variant is revalidated, and a replaced original makes a new one', async () => {
    const first = await run(middleware, { path: '/wide.jpg', query: { w: '320' } });
    assert.equal(first.res.headers['cache-control'], 'no-cache');
    const etag = first.res.headers['etag'];
    assert.ok(etag);

    const again = await run(middleware, {
        path: '/wide.jpg', query: { w: '320' }, headers: { 'if-none-match': etag },
    });
    assert.equal(again.res.statusCode, 304);
    assert.equal(again.res.body, null);

    // The CMS replaces an image keeping its name.
    await sharp({ create: { width: 1000, height: 500, channels: 3, background: '#a04040' } })
        .jpeg().toFile(path.join(dir, 'wide.jpg'));
    const replaced = await run(middleware, {
        path: '/wide.jpg', query: { w: '320' }, headers: { 'if-none-match': etag },
    });
    assert.equal(replaced.res.statusCode, 200);
    assert.notEqual(replaced.res.headers['etag'], etag);
});

test('what sharp must not touch, and what is not there, is passed on', async () => {
    // Resizing an animated GIF would leave one frame of it.
    assert.ok((await run(middleware, { path: '/clip.gif', query: { w: '320' } })).passed);
    assert.ok((await run(middleware, { path: '/missing.jpg', query: { w: '320' } })).passed);
    // A file that is not the image its name claims.
    await fs.writeFile(path.join(dir, 'broken.jpg'), 'certainly not a jpeg');
    assert.ok((await run(middleware, { path: '/broken.jpg', query: { w: '320' } })).passed);
});

test('a path cannot walk out of the image directory', async () => {
    const outside = path.join(dir, '..', 'escaped.png');
    await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
        .png().toFile(outside);
    try {
        const { passed } = await run(middleware, {
            path: '/../escaped.png', query: { w: '320' },
        });
        assert.ok(passed, 'never served from outside dir');
    } finally {
        await fs.unlink(outside);
    }
});

test('the cache serves a second request without encoding again', async () => {
    const cache = createVariantCache();
    let encodes = 0;
    const render = async () => { encodes++; return Buffer.alloc(1024, 1); };

    const [a, b] = await Promise.all([cache.get('k', render), cache.get('k', render)]);
    assert.equal(encodes, 1, 'two requests arriving together share one encode');
    assert.deepEqual(a, b);

    await cache.get('k', render);
    assert.equal(encodes, 1);
    assert.equal(cache.byteLength, 1024);
});

test('the cache stays inside its budget, dropping the coldest first', async () => {
    const cache = createVariantCache({ maxBytes: 3000 });
    const put = (k) => cache.get(k, async () => Buffer.alloc(1000, 1));

    await put('a'); await put('b'); await put('c');
    assert.equal(cache.size, 3);

    // Touching 'a' makes 'b' the coldest, so 'b' goes when 'd' arrives.
    await put('a');
    await put('d');
    assert.equal(cache.byteLength <= 3000, true);
    assert.equal(cache.size, 3);

    let reEncoded = 0;
    await cache.get('b', async () => { reEncoded++; return Buffer.alloc(1000, 1); });
    assert.equal(reEncoded, 1, 'b was the one evicted');
});

test('a failed encode leaves nothing behind in the cache', async () => {
    const cache = createVariantCache();
    await assert.rejects(cache.get('bad', async () => { throw new Error('nope'); }));
    assert.equal(cache.size, 0);

    let calls = 0;
    await cache.get('bad', async () => { calls++; return Buffer.alloc(8); });
    assert.equal(calls, 1, 'the next request tries again');
});

test('teardown', async () => {
    await fs.rm(dir, { recursive: true, force: true });
});
