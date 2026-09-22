// End-to-end checks of server.js: a real process on a random port, pointed at a
// throwaway content directory and an empty visitor directory.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const WebSocket = require('ws');
const sharp = require('sharp');

const SERVER = path.join(__dirname, '..', 'server.js');

function startServer(env) {
    const child = spawn(process.execPath, [SERVER], {
        env: { ...process.env, PORT: '0', ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const ready = new Promise((resolve, reject) => {
        const onData = (chunk) => {
            output += chunk;
            const match = output.match(/Server running on port (\d+)/);
            if (match) resolve(Number(match[1]));
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => reject(Object.assign(new Error(output), { code, output })));
    });
    return { child, ready, output: () => output };
}

let tmp;
let content;
let visitors;
let server;
let base;

before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-server-'));
    content = path.join(tmp, 'content');
    // Deliberately missing: the server must create what it needs.
    visitors = path.join(tmp, 'visitors');

    await fs.mkdir(path.join(content, 'data'), { recursive: true });
    await fs.mkdir(path.join(content, 'uploads'));
    const write = (name, data) =>
        fs.writeFile(path.join(content, 'data', name), JSON.stringify(data));
    await write('reviews.json', { items: [{ id: 'r1', artist: 'A' }] });
    // Files older than the CMS are a bare array.
    await write('media.json', [{ id: 'm1', title: 'M' }]);
    await write('credits.json', { items: [] });
    await write('wip.json', { items: [{ id: 'w1', date: '2026', object: 'Deck', subject: 'Griptape', link: 'https://example.com' }] });
    await write('timeline.json', { items: [
        { title: 'Spotify', date: '2025-01-01', cover: 'https://i.scdn.co/x', spotifyId: 'x' },
        { title: 'Hidden', date: '2024-06-01', spotifyId: 'h', hidden: true },
        { title: 'Manual', date: '2024-01-01', hidden: false },
        { title: 'Hidden manual', date: '2023-06-01', hidden: true }
    ] });
    // Left over from the old two-file timeline: must no longer be served.
    await write('timeline_spotify.json', { items: [{ title: 'Stale', date: '2026-01-01' }] });
    await fs.writeFile(path.join(content, 'uploads', 'cover.jpg'), 'editorial');

    server = startServer({ CONTENT_DIR: content, VISITORS_DIR: visitors });
    base = `http://localhost:${await server.ready}`;
});

after(async () => {
    if (server) server.child.kill();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

const getJson = async (url) => (await fetch(base + url)).json();
const postJson = (url, body, ip) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...forwardedFor(ip) },
    body: JSON.stringify(body)
});

// Resolves once the history message has arrived: the connection is then fully set up.
function openSocket() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
        ws.once('message', () => resolve(ws));
        ws.once('error', reject);
    });
}

// The saved chat, as a new connection receives it.
function chatHistory() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
        ws.once('message', (raw) => {
            ws.close();
            resolve(JSON.parse(raw).data);
        });
        ws.once('error', reject);
    });
}

// The server trusts one proxy hop (TRUST_PROXY defaults to 1), so X-Forwarded-For is
// the visitor's address as the rate limits see it. Tests that would otherwise share
// a budget each come from their own address.
let ipCounter = 0;
const freshIp = () => {
    ipCounter += 1;
    return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
};
const forwardedFor = (ip) => (ip ? { 'X-Forwarded-For': ip } : {});

function upload(data, filename, { ip, folder, url = base } = {}) {
    const form = new FormData();
    form.append('file', new Blob([data]), filename);
    if (folder) form.append('folder', folder);
    return fetch(`${url}/api/computer/upload`, {
        method: 'POST',
        headers: forwardedFor(ip || freshIp()),
        body: form
    });
}

const makePng = (options = {}) => {
    const size = options.size || 16;
    let image = sharp({ create: {
        width: size,
        height: size,
        channels: 3,
        background: '#36c',
        // Noise keeps the PNG from compressing to nothing, for tests that need bulk.
        ...(options.noise ? { noise: { type: 'gaussian', mean: 128, sigma: 60 } } : {})
    } }).png();
    if (options.exif) image = image.withExif(options.exif);
    return image.toBuffer();
};

const uploadedFiles = () => fs.readdir(path.join(visitors, 'uploads'));

test('refuses to start without content', async () => {
    const missing = startServer({
        CONTENT_DIR: path.join(os.tmpdir(), 'mxrjup-no-such-content'),
        VISITORS_DIR: visitors
    });
    const err = await missing.ready.then(() => null, (e) => e);
    assert.ok(err, 'the server should not have started');
    assert.equal(err.code, 1);
    assert.match(err.output, /No content at .*mxrjup-no-such-content/);
});

test('refuses to write visitor data inside the code checkout', async () => {
    const inside = startServer({ CONTENT_DIR: content, VISITORS_DIR: 'server/visitors' });
    const err = await inside.ready.then(() => null, (e) => e);
    assert.ok(err, 'the server should not have started');
    assert.equal(err.code, 1);
    assert.match(err.output, /inside the code checkout/);
});

test('content is read from CONTENT_DIR, in both file shapes', async () => {
    assert.deepEqual(await getJson('/api/data/reviews'), [{ id: 'r1', artist: 'A' }]);
    assert.deepEqual(await getJson('/api/data/media'), [{ id: 'm1', title: 'M' }]);
    assert.deepEqual(await getJson('/api/data/credits'), []);
    assert.deepEqual(await getJson('/api/data/wip'), [{ id: 'w1', date: '2026', object: 'Deck', subject: 'Griptape', link: 'https://example.com' }]);
    // No file at all reads as empty.
    assert.deepEqual(await getJson('/api/data/cool_stuff'), []);
    assert.equal((await fetch(`${base}/api/data/computer_files`)).status, 400);
});

test('the timeline is timeline.json alone, without its hidden entries', async () => {
    assert.deepEqual(await getJson('/api/data/timeline'), [
        { title: 'Spotify', date: '2025-01-01', cover: 'https://i.scdn.co/x', spotifyId: 'x' },
        { title: 'Manual', date: '2024-01-01', hidden: false }
    ]);
});

test('the stats are one document, served whole, and empty until published', async () => {
    const file = path.join(content, 'data', 'stats.json');
    assert.deepEqual(await getJson('/api/data/stats'), {});

    const stats = { through: '2026-09-20', ranges: [{ id: '4w', plays: 3 }], records: {} };
    await fs.writeFile(file, JSON.stringify(stats));
    assert.deepEqual(await getJson('/api/data/stats'), stats);
    await fs.rm(file);
});

test('an empty VISITORS_DIR is initialised', async () => {
    assert.deepEqual((await fs.readdir(visitors)).sort(), ['data', 'uploads']);
    assert.deepEqual((await getJson('/api/computer/files')).files, []);
    assert.deepEqual(await chatHistory(), []);
    assert.equal((await getJson('/api/computer/quota')).used, 0);
});

test('the computer works: folders, upload, move, delete', async () => {
    let res = await postJson('/api/computer/folder', { name: 'Stuff' });
    assert.equal(res.status, 200);
    const { folder } = await res.json();
    assert.equal(folder.folder, 'Desktop');

    res = await postJson('/api/computer/folder', { name: 'Stuff' });
    assert.equal(res.status, 400);

    res = await upload(await makePng(), 'holiday.png', { folder: 'Stuff' });
    assert.equal(res.status, 200);
    const { success, file } = await res.json();
    assert.equal(success, true);
    assert.match(file.id, /^[0-9a-f]{32}\.png$/);
    assert.equal(file.path, `/uploads/users/${file.id}`);
    assert.equal(file.name, 'holiday.png');
    assert.equal(file.mimeType, 'image/png');
    assert.equal(file.folder, 'Stuff');
    assert.deepEqual(await uploadedFiles(), [file.id]);
    const indexed = (await getJson('/api/computer/files')).files.find((f) => f.id === file.id);
    assert.deepEqual(indexed, file);

    // Served at the same URL as before the split: the re-encoded copy, as a PNG.
    res = await fetch(base + file.path);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const served = Buffer.from(await res.arrayBuffer());
    assert.equal(served.length, file.size);
    assert.equal((await sharp(served).metadata()).format, 'png');
    const quota = await getJson('/api/computer/quota');
    assert.equal(quota.used, file.size);
    assert.equal(quota.total, 100 * 1024 * 1024);

    res = await fetch(`${base}/api/computer/file/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'My Documents' })
    });
    assert.equal((await res.json()).file.folder, 'My Documents');

    res = await fetch(`${base}/api/computer/file/nope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: 'x' })
    });
    assert.equal(res.status, 404);

    res = await fetch(`${base}/api/computer/file/${file.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual(await fs.readdir(path.join(visitors, 'uploads')), []);

    res = await fetch(`${base}/api/computer/folder/Stuff`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.deepEqual((await getJson('/api/computer/files')).files, []);
});

test('editorial media and visitor files keep their URLs', async () => {
    let res = await fetch(`${base}/uploads/cover.jpg`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'editorial');

    await fs.writeFile(path.join(visitors, 'uploads', 'existing.jpg'), 'visitor');
    res = await fetch(`${base}/uploads/users/existing.jpg`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'visitor');

    // A visitor URL never falls through to the content repository.
    assert.equal((await fetch(`${base}/uploads/users/cover.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/uploads/missing.jpg`)).status, 404);
});

// A browser revalidating its copy. Not fetch(): per the Fetch spec a request carrying
// If-None-Match is also sent with "Cache-Control: no-cache", which makes Express skip
// the 304 - no browser does that on a normal revalidation.
const conditionalStatus = (url, etag) => new Promise((resolve, reject) => {
    http.get(base + url, { headers: { 'If-None-Match': etag } }, (res) => {
        res.resume();
        resolve(res.statusCode);
    }).on('error', reject);
});

test('published content is revalidated, never served stale from cache', async () => {
    for (const url of ['/api/data/reviews', '/api/data/timeline', '/uploads/cover.jpg']) {
        const res = await fetch(base + url);
        assert.equal(res.headers.get('cache-control'), 'no-cache', url);
        const etag = res.headers.get('etag');
        assert.ok(etag, `${url} has an ETag`);
        assert.equal(await conditionalStatus(url, etag), 304, url);
    }

    // A publish rewrites the files in place: the next request sees the new version.
    const cover = path.join(content, 'uploads', 'cover.jpg');
    const before = (await fetch(`${base}/uploads/cover.jpg`)).headers.get('etag');
    await fs.writeFile(cover, 'replaced image');
    assert.equal(await conditionalStatus('/uploads/cover.jpg', before), 200);
    assert.equal(await (await fetch(`${base}/uploads/cover.jpg`)).text(), 'replaced image');
    await fs.writeFile(cover, 'editorial');

    const credits = path.join(content, 'data', 'credits.json');
    await fs.writeFile(credits, JSON.stringify({ items: [{ id: 'c1' }] }));
    assert.deepEqual(await getJson('/api/data/credits'), [{ id: 'c1' }]);
    await fs.writeFile(credits, JSON.stringify({ items: [] }));
});

test('20 chat messages sent at once over WebSocket are all kept', async () => {
    const sockets = await Promise.all(Array.from({ length: 10 }, openSocket));

    // Each socket sees every broadcast; the last one tells us all were saved.
    const broadcasts = [];
    const allBroadcast = new Promise((resolve) => {
        sockets[0].on('message', (raw) => {
            const msg = JSON.parse(raw);
            if (msg.type === 'message') broadcasts.push(msg.data);
            if (broadcasts.length === 20) resolve();
        });
    });

    const texts = Array.from({ length: 20 }, (_, i) => `parallel-${i}`);
    texts.forEach((text, i) => {
        sockets[i >> 1].send(JSON.stringify({ type: 'message', user: `ws${i}`, text }));
    });
    await allBroadcast;
    sockets.forEach((ws) => ws.close());

    const saved = await chatHistory();
    assert.ok(saved.length <= 50);
    assert.deepEqual(saved.map((m) => m.text).filter((t) => t.startsWith('parallel-')).sort(),
        [...texts].sort());
    assert.equal(new Set(saved.map((m) => m.id)).size, saved.length, 'ids are unique');
});

test('the chat keeps only the last 50 messages', async () => {
    // From 3 connections: one would run out of its budget after 20.
    const sockets = await Promise.all(Array.from({ length: 3 }, openSocket));
    let seen = 0;
    const allBroadcast = new Promise((resolve) => {
        sockets[0].on('message', (raw) => {
            if (JSON.parse(raw).type === 'message' && ++seen === 60) resolve();
        });
    });
    for (let i = 0; i < 60; i++) {
        sockets[i % 3].send(JSON.stringify({ type: 'message', user: 'u', text: `n${i}` }));
    }
    await allBroadcast;
    sockets.forEach((ws) => ws.close());

    const saved = await chatHistory();
    assert.equal(saved.length, 50);
    assert.equal(new Set(saved.map((m) => m.text)).size, 50);
});

test('nothing is left half-written in the visitor data', async () => {
    const leftovers = (await fs.readdir(path.join(visitors, 'data'))).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
});

// ============================================
// UPLOAD SECURITY
// ============================================

test('a real PNG is accepted, re-encoded, and its EXIF is gone', async () => {
    const input = await makePng({ exif: { IFD0: { Copyright: 'OWNER-SECRET' } } });
    assert.ok(input.includes('OWNER-SECRET'));

    const res = await upload(input, 'me.png');
    assert.equal(res.status, 200);
    const { file } = await res.json();

    const stored = await fs.readFile(path.join(visitors, 'uploads', file.id));
    assert.ok(!stored.equals(input), 'the bytes received are not the bytes served');
    assert.ok(!stored.includes('OWNER-SECRET'));
    assert.equal((await sharp(stored).metadata()).exif, undefined);
    assert.equal(file.size, stored.length);
});

test('audio and video are accepted and served with their detected type', async () => {
    const fixtures = path.join(__dirname, 'fixtures');
    for (const [name, type] of [['tone.mp3', 'audio/mpeg'], ['clip.webm', 'video/webm']]) {
        // A misleading name changes nothing: the bytes decide.
        const res = await upload(await fs.readFile(path.join(fixtures, name)), 'song.html');
        assert.equal(res.status, 200, name);
        const { file } = await res.json();
        assert.equal(file.mimeType, type);
        assert.equal(file.name, 'song.html');
        const served = await fetch(base + file.path);
        assert.equal(served.headers.get('content-type'), type);
    }
});

test('HTML renamed to .png, SVG, and a polyglot are refused and never stored', async () => {
    const before = await uploadedFiles();
    const polyglot = Buffer.concat([await makePng(), Buffer.from('<script>alert(1)</script>')]);
    const cases = [
        ['<html><script>alert(document.cookie)</script></html>', 'cute-cat.png'],
        ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'logo.svg'],
        [polyglot, 'photo.png']
    ];
    for (const [data, name] of cases) {
        const res = await upload(data, name);
        assert.equal(res.status, 415, name);
        assert.match((await res.json()).error, /not accepted/);
    }
    assert.deepEqual(await uploadedFiles(), before);
});

function uploadRaw(disposition, data) {
    const boundary = 'x-boundary';
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; ` +
            `${disposition}\r\nContent-Type: text/html\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    return fetch(`${base}/api/computer/upload`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            ...forwardedFor(freshIp())
        },
        body
    });
}

test('a malicious original name is only a display name', async () => {
    // Control characters cannot appear raw in a header, but the RFC 5987 form of the
    // parameter, which the parser decodes, can carry any byte.
    const res = await uploadRaw(
        "filename*=utf-8''..%2F..%2Fx.html%00%01%1B%5B2J%7F%E2%80%AEgnp.exe", await makePng());
    assert.equal(res.status, 200);
    const { file } = await res.json();
    assert.equal(file.name, 'x.html[2Jgnp.exe');
    assert.match(file.id, /^[0-9a-f]{32}\.png$/);
    assert.equal(file.mimeType, 'image/png');
    // Stored inside the uploads directory under the server's name, nowhere else.
    assert.ok((await uploadedFiles()).includes(file.id));
    await assert.rejects(fs.access(path.join(visitors, 'x.html')));
    await assert.rejects(fs.access(path.join(tmp, 'x.html')));

    // Raw control characters make the body malformed: a 400, not a stack trace.
    const raw = await uploadRaw('filename="bad\u0001name.png"', await makePng());
    assert.equal(raw.status, 400);
    assert.deepEqual(await raw.json(), { error: 'Invalid upload' });
});

test('visitor files are served with locked-down headers', async () => {
    const { file } = await (await upload(await makePng(), 'a.png')).json();
    const res = await fetch(base + file.path);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(res.headers.get('content-type'), 'image/png');

    // A file from before these rules, with an extension the server would never pick,
    // is only a download.
    const legacyPath = path.join(visitors, 'uploads', '1700000000-1-page.html');
    await fs.writeFile(legacyPath, '<script>1</script>');
    const legacy = await fetch(`${base}/uploads/users/1700000000-1-page.html`);
    assert.equal(legacy.status, 200);
    assert.equal(legacy.headers.get('content-type'), 'application/octet-stream');
    assert.equal(legacy.headers.get('content-disposition'), 'attachment');
    assert.equal(legacy.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    await fs.unlink(legacyPath);

    // Photos uploaded before the rules kept ".jpeg", which the server no longer picks.
    const photoPath = path.join(visitors, 'uploads', '1700000000-2-photo.JPEG');
    await fs.writeFile(photoPath, await sharp(await makePng()).jpeg().toBuffer());
    const photo = await fetch(`${base}/uploads/users/1700000000-2-photo.JPEG`);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    assert.equal(photo.headers.get('content-disposition'), null);
    await fs.unlink(photoPath);

    // The rest of the site gets nosniff too.
    const api = await fetch(`${base}/api/data/reviews`);
    assert.equal(api.headers.get('x-content-type-options'), 'nosniff');
});

test('a file over 10 MB is refused with 413', async () => {
    const before = await uploadedFiles();
    const res = await upload(Buffer.alloc(11 * 1024 * 1024), 'big.png');
    assert.equal(res.status, 413);
    const body = await res.json();
    assert.match(body.error, /too large/i);
    assert.equal(body.limit, 10 * 1024 * 1024);
    assert.deepEqual(await uploadedFiles(), before);
});

test('uploads are limited to 10 per 15 minutes per address', async () => {
    const ip = freshIp();
    const statuses = [];
    for (let i = 0; i < 11; i++) {
        statuses.push((await upload('not media', 'x.txt', { ip })).status);
    }
    assert.deepEqual(statuses, [...Array(10).fill(415), 429]);
    // Someone else is not affected.
    assert.equal((await upload('not media', 'x.txt')).status, 415);
});

test('deleting, moving and creating folders share 30 per 15 minutes', async () => {
    const ip = freshIp();
    const headers = { 'Content-Type': 'application/json', ...forwardedFor(ip) };
    const fileUrl = `${base}/api/computer/file/nope`;
    const statuses = [];
    for (let i = 0; i < 10; i++) {
        statuses.push((await fetch(fileUrl, { method: 'DELETE', headers })).status);
        statuses.push((await fetch(fileUrl, {
            method: 'PUT', headers, body: JSON.stringify({ folder: 'x' })
        })).status);
        statuses.push((await postJson('/api/computer/folder', {}, ip)).status);
    }
    assert.deepEqual(statuses, Array(10).fill([404, 404, 400]).flat());
    const res = await fetch(`${base}/api/computer/folder/nope`, { method: 'DELETE', headers });
    assert.equal(res.status, 429);
});


test('a WebSocket connection is limited in pace and message size', async () => {
    const ws = await openSocket();
    const received = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw)));

    for (let i = 0; i < 21; i++) {
        ws.send(JSON.stringify({ type: 'message', user: 'w', text: `b${i}` }));
    }
    await new Promise((resolve) => {
        const check = setInterval(() => {
            if (received.length >= 21) { clearInterval(check); resolve(); }
        }, 10);
    });
    const mine = received.filter((m) => m.type === 'message' && m.data.user === 'w');
    assert.equal(mine.length, 20);
    assert.deepEqual(received.filter((m) => m.type === 'error').map((m) => m.error),
        ['Too many messages, slow down.']);

    // Over the size limit, ws closes the connection with 1009 (message too big).
    const other = await openSocket();
    const closed = new Promise((resolve) => other.once('close', resolve));
    other.send(JSON.stringify({ type: 'message', user: 'w', text: 'x'.repeat(5000) }));
    assert.equal(await closed, 1009);

    // Too long for the chat, but small enough for the socket: refused, not saved.
    const third = await openSocket();
    const reply = new Promise((resolve) => {
        third.once('message', (raw) => resolve(JSON.parse(raw)));
    });
    third.send(JSON.stringify({ type: 'message', user: 'w', text: 'y'.repeat(501) }));
    assert.deepEqual(await reply, { type: 'error', error: 'Message is limited to 500 characters' });
    const nameReply = new Promise((resolve) => {
        third.once('message', (raw) => resolve(JSON.parse(raw)));
    });
    third.send(JSON.stringify({ type: 'message', user: 'u'.repeat(31), text: 'hi' }));
    assert.deepEqual(await nameReply,
        { type: 'error', error: 'User name is limited to 30 characters' });
    ws.close();
    third.close();
});

test('the quota is checked before accepting, including uploads racing each other', async () => {
    // A server of its own, whose index already holds nearly all of a small quota.
    const quotaVisitors = path.join(tmp, 'quota-visitors');
    await fs.mkdir(path.join(quotaVisitors, 'data'), { recursive: true });
    const png = await makePng({ noise: true, size: 64 });
    const storedSize = (await sharp(png).png().toBuffer()).length;
    const quota = 1024 * 1024;
    // Room for one of the two uploads below, not both.
    const used = quota - Math.floor(storedSize * 1.5);
    await fs.writeFile(path.join(quotaVisitors, 'data', 'computer_files.json'), JSON.stringify({
        files: [{ id: 'old.png', name: 'old.png', path: '/uploads/users/old.png', size: used,
            folder: 'Desktop' }],
        folders: []
    }));

    const quotaServer = startServer({
        CONTENT_DIR: content, VISITORS_DIR: quotaVisitors, USER_UPLOADS_QUOTA_MB: '1'
    });
    try {
        const url = `http://localhost:${await quotaServer.ready}`;
        const replies = await Promise.all([
            upload(png, 'a.png', { url }),
            upload(png, 'b.png', { url })
        ]);
        const statuses = replies.map((r) => r.status).sort();
        assert.deepEqual(statuses, [200, 413]);

        const refused = await replies.find((r) => r.status === 413).json();
        assert.deepEqual(Object.keys(refused).sort(), ['current', 'error', 'quota']);
        assert.equal(refused.quota, quota);
        assert.equal(refused.error, 'Storage quota exceeded. Please delete some files first.');

        // Full now: refused from the announced size, before the body is even read.
        const full = await upload(png, 'c.png', { url });
        assert.equal(full.status, 413);

        const index = JSON.parse(await fs.readFile(
            path.join(quotaVisitors, 'data', 'computer_files.json'), 'utf8'));
        const total = index.files.reduce((sum, f) => sum + f.size, 0);
        assert.ok(total <= quota);
        assert.equal((await fs.readdir(path.join(quotaVisitors, 'uploads'))).length, 1);
    } finally {
        quotaServer.child.kill();
    }
});

test('only accepted files are on disk, each one in the index', async () => {
    const onDisk = (await uploadedFiles()).filter((f) => f !== 'existing.jpg').sort();
    const indexed = (await getJson('/api/computer/files')).files
        .filter((f) => f.type !== 'folder').map((f) => f.id).sort();
    assert.deepEqual(onDisk, indexed);
    assert.ok(onDisk.every((f) => /^[0-9a-f]{32}\.(png|mp3|webm)$/.test(f)));
});
