// End-to-end checks of server.js: a real process on a random port, pointed at a
// throwaway content directory and an empty visitor directory.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const WebSocket = require('ws');

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
    await write('timeline.json', { items: [
        { title: 'Manual', date: '2024-01-01' },
        { title: 'Both', date: '2023-01-01', cover: 'manual.jpg' }
    ] });
    await write('timeline_spotify.json', { items: [
        { title: 'Both', date: '2023-01-01', cover: 'spotify.jpg' },
        { title: 'Spotify', date: '2025-01-01' }
    ] });
    await fs.writeFile(path.join(content, 'uploads', 'cover.jpg'), 'editorial');

    server = startServer({ CONTENT_DIR: content, VISITORS_DIR: visitors });
    base = `http://localhost:${await server.ready}`;
});

after(async () => {
    if (server) server.child.kill();
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
});

const getJson = async (url) => (await fetch(base + url)).json();
const postJson = (url, body) => fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
});

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
    // No file at all reads as empty.
    assert.deepEqual(await getJson('/api/data/cool_stuff'), []);
    assert.equal((await fetch(`${base}/api/data/computer_files`)).status, 400);
});

test('the timeline merges the Spotify export under the manual entries', async () => {
    assert.deepEqual(await getJson('/api/data/timeline'), [
        { title: 'Spotify', date: '2025-01-01' },
        { title: 'Manual', date: '2024-01-01' },
        { title: 'Both', date: '2023-01-01', cover: 'manual.jpg' }
    ]);
});

test('an empty VISITORS_DIR is initialised', async () => {
    assert.deepEqual((await fs.readdir(visitors)).sort(), ['data', 'uploads']);
    assert.deepEqual((await getJson('/api/computer/files')).files, []);
    const rooms = await getJson('/api/chat/rooms');
    assert.ok(rooms.some((r) => r.id === 'general'));
    assert.equal((await getJson('/api/computer/quota')).used, 0);
});

test('the computer works: folders, upload, move, delete', async () => {
    let res = await postJson('/api/computer/folder', { name: 'Stuff' });
    assert.equal(res.status, 200);
    const { folder } = await res.json();
    assert.equal(folder.folder, 'Desktop');

    res = await postJson('/api/computer/folder', { name: 'Stuff' });
    assert.equal(res.status, 400);

    const form = new FormData();
    form.append('file', new Blob(['hello visitor']), 'hello.txt');
    form.append('folder', 'Stuff');
    res = await fetch(`${base}/api/computer/upload`, { method: 'POST', body: form });
    assert.equal(res.status, 200);
    const { file } = await res.json();
    assert.match(file.path, /^\/uploads\/users\/.+-hello\.txt$/);
    assert.deepEqual(await fs.readdir(path.join(visitors, 'uploads')), [file.id]);

    // Served at the same URL as before the split.
    res = await fetch(base + file.path);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello visitor');
    assert.equal((await getJson('/api/computer/quota')).used, 13);

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

test('20 chat messages sent at once over REST and WebSocket are all kept', async () => {
    const wsUrl = base.replace('http', 'ws') + '/ws';
    const sockets = await Promise.all(Array.from({ length: 10 }, () => new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        // Wait for the history message: the connection is then fully set up.
        ws.once('message', () => resolve(ws));
        ws.once('error', reject);
    })));

    // Each socket sees every broadcast; the last one tells us all were saved.
    const broadcasts = [];
    const allBroadcast = new Promise((resolve) => {
        sockets[0].on('message', (raw) => {
            const msg = JSON.parse(raw);
            if (msg.type === 'message') broadcasts.push(msg.data);
            if (broadcasts.length === 10) resolve();
        });
    });

    const texts = Array.from({ length: 20 }, (_, i) => `parallel-${i}`);
    const rest = [];
    texts.forEach((text, i) => {
        if (i % 2) {
            sockets[i >> 1].send(JSON.stringify({ type: 'message', user: `ws${i}`, text }));
        } else {
            rest.push(postJson('/api/chat/general/messages', { user: `rest${i}`, text }));
        }
    });
    const restReplies = await Promise.all(rest);
    assert.ok(restReplies.every((r) => r.status === 200));
    await allBroadcast;
    sockets.forEach((ws) => ws.close());

    const saved = await getJson('/api/chat/general/messages');
    assert.ok(saved.length <= 50);
    assert.deepEqual(saved.map((m) => m.text).filter((t) => t.startsWith('parallel-')).sort(),
        [...texts].sort());
    assert.equal(new Set(saved.map((m) => m.id)).size, saved.length, 'ids are unique');
});

test('the chat keeps only the last 50 messages of a room', async () => {
    await Promise.all(Array.from({ length: 60 }, (_, i) =>
        postJson('/api/chat/music/messages', { user: 'u', text: `n${i}` })
    ));
    const saved = await getJson('/api/chat/music/messages');
    assert.equal(saved.length, 50);
    assert.equal(new Set(saved.map((m) => m.text)).size, 50);
});

test('nothing is left half-written in the visitor data', async () => {
    const leftovers = (await fs.readdir(path.join(visitors, 'data'))).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
});
