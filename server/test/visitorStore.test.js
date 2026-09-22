const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { createVisitorStore, writeFileAtomic, MAX_MESSAGES_PER_ROOM } = require('../visitorStore');

const created = [];
const tempDir = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mxrjup-visitors-'));
    created.push(dir);
    return dir;
};
after(() => Promise.all(created.map((dir) => fs.rm(dir, { recursive: true, force: true }))));

test('init creates the layout and default files in an empty directory', async () => {
    const root = path.join(await tempDir(), 'not-yet-there');
    const store = createVisitorStore(root);
    await store.init();

    assert.deepEqual((await fs.readdir(root)).sort(), ['data', 'uploads']);
    const files = await store.readComputerFiles();
    assert.deepEqual(files.files, []);
    const chat = await store.readChat();
    assert.deepEqual(chat.messages, { general: [] });
});

test('init leaves existing files alone', async () => {
    const root = await tempDir();
    await fs.mkdir(path.join(root, 'data'));
    const existing = { files: [{ id: 'x' }], folders: [] };
    await fs.writeFile(path.join(root, 'data/computer_files.json'), JSON.stringify(existing));

    const store = createVisitorStore(root);
    await store.init();
    assert.deepEqual(await store.readComputerFiles(), existing);
});

test('writeFileAtomic replaces the file and leaves no temporary file behind', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'a.json');
    await fs.writeFile(file, 'old');
    await writeFileAtomic(file, 'new');

    assert.equal(await fs.readFile(file, 'utf8'), 'new');
    assert.deepEqual(await fs.readdir(dir), ['a.json']);
});

test('writeFileAtomic cleans up its temporary file when the rename fails', async () => {
    const dir = await tempDir();
    // A non-empty directory where the target should be makes the rename fail
    // after the temporary file has been written.
    const target = path.join(dir, 'a.json');
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, 'keep'), 'old');

    await assert.rejects(writeFileAtomic(target, 'new'));
    assert.deepEqual(await fs.readdir(dir), ['a.json']);
    assert.equal(await fs.readFile(path.join(target, 'keep'), 'utf8'), 'old');
});

test('concurrent updates of one file are all kept', async () => {
    const store = createVisitorStore(await tempDir());
    await store.init();

    await Promise.all(Array.from({ length: 30 }, (_, i) =>
        store.updateComputerFiles(async (data) => {
            // Yield inside the critical section: without the queue, every update
            // would read the same state here and all but one would be lost.
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
            data.files.push({ id: `f${i}` });
        })
    ));

    const ids = (await store.readComputerFiles()).files.map((f) => f.id).sort();
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30);
});

test('a failed update does not block the next ones', async () => {
    const store = createVisitorStore(await tempDir());
    await store.init();

    await assert.rejects(store.updateComputerFiles(() => {
        throw new Error('boom');
    }));
    await store.updateComputerFiles((data) => data.files.push({ id: 'after' }));
    assert.deepEqual((await store.readComputerFiles()).files, [{ id: 'after' }]);
});

test('an update that changes nothing does not rewrite the file', async () => {
    const store = createVisitorStore(await tempDir());
    await store.init();
    const file = path.join(store.root, 'data/computer_files.json');
    const before = (await fs.stat(file)).mtimeMs;

    await new Promise((resolve) => setTimeout(resolve, 20));
    const result = await store.updateComputerFiles(() => 'untouched');
    assert.equal(result, 'untouched');
    assert.equal((await fs.stat(file)).mtimeMs, before);
});

test('chat messages get unique ids and the room is capped', async () => {
    const store = createVisitorStore(await tempDir());
    await store.init();

    const sent = await Promise.all(Array.from({ length: MAX_MESSAGES_PER_ROOM + 10 }, (_, i) =>
        store.addChatMessage('general', 'u', `m${i}`)
    ));
    assert.equal(new Set(sent.map((m) => m.id)).size, sent.length);

    const kept = (await store.readChat()).messages.general;
    assert.equal(kept.length, MAX_MESSAGES_PER_ROOM);
    assert.equal(kept[kept.length - 1].text, `m${MAX_MESSAGES_PER_ROOM + 9}`);
});

test('a message to an unknown room creates it', async () => {
    const store = createVisitorStore(await tempDir());
    await store.init();
    await store.addChatMessage('new-room', 'u', 'hi');
    assert.equal((await store.readChat()).messages['new-room'][0].text, 'hi');
});
