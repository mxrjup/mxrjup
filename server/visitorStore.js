const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

/**
 * Everything the /computer visitors write: their uploaded files, the index of those
 * files, and the chat. It all lives under VISITORS_DIR, outside the code checkout, so
 * a deploy never touches it and the nightly backup can commit it as-is.
 *
 *   <root>/uploads/                  the uploaded files, served at /uploads/users/
 *   <root>/data/computer_files.json  the desktop: folders and file metadata
 *   <root>/data/chat_data.json       the last chat messages
 *
 * Every write goes through this module for two reasons:
 *   - it is atomic (temporary file in the same directory, then rename), so the backup,
 *     or a reader, never sees a half-written file;
 *   - read-modify-write cycles on the same file run one after the other. Two chat
 *     messages or two uploads landing together used to read the same state and the
 *     last write won, dropping the other. There is a single Node process, so an
 *     in-memory queue per file is all the locking needed.
 */

const COMPUTER_FILES = 'computer_files.json';
const CHAT_DATA = 'chat_data.json';
const MAX_MESSAGES_PER_ROOM = 50;

const DEFAULT_COMPUTER_FILES = { files: [] };

const DEFAULT_CHAT_DATA = { messages: { general: [] } };

const serialize = (data) => JSON.stringify(data, null, 2);

/**
 * Replace filePath with content in one step. The temporary file sits in the same
 * directory so the rename stays on one filesystem, where it is atomic.
 */
async function writeFileAtomic(filePath, content) {
    const tmp = path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    );
    try {
        const handle = await fs.open(tmp, 'w');
        try {
            await handle.writeFile(content);
            // Flush before the rename, or a crash could leave the new name pointing
            // at an empty file.
            await handle.sync();
        } finally {
            await handle.close();
        }
        await fs.rename(tmp, filePath);
    } catch (err) {
        await fs.unlink(tmp).catch(() => {});
        throw err;
    }
}

function createVisitorStore(root) {
    const dataDir = path.join(root, 'data');
    const uploadsDir = path.join(root, 'uploads');
    const filePath = (name) => path.join(dataDir, name);

    // Tail of the pending operations for each file: a new one chains after it.
    const queues = new Map();

    function enqueue(name, task) {
        const run = (queues.get(name) || Promise.resolve()).then(task);
        // The queue itself must survive a failed task; the caller still sees the error.
        const tail = run.catch(() => {});
        queues.set(name, tail);
        tail.then(() => {
            if (queues.get(name) === tail) queues.delete(name);
        });
        return run;
    }

    async function read(name) {
        return JSON.parse(await fs.readFile(filePath(name), 'utf8'));
    }

    /**
     * Run mutate(data) on the current content of a data file and save the result,
     * with no other update to that file in between. mutate changes data in place and
     * its return value is passed on. The file is only rewritten if the content
     * actually changed, so a rejected request (a 404, a duplicate) writes nothing.
     */
    function update(name, mutate) {
        return enqueue(name, async () => {
            const data = await read(name);
            const before = serialize(data);
            const result = await mutate(data);
            const after = serialize(data);
            if (after !== before) await writeFileAtomic(filePath(name), after);
            return result;
        });
    }

    /**
     * Create the directories and the two data files if they are missing, so an
     * empty VISITORS_DIR (a fresh host, a new dev machine) starts cleanly.
     */
    async function init() {
        await fs.mkdir(dataDir, { recursive: true });
        await fs.mkdir(uploadsDir, { recursive: true });
        const defaults = [[COMPUTER_FILES, DEFAULT_COMPUTER_FILES], [CHAT_DATA, DEFAULT_CHAT_DATA]];
        for (const [name, initial] of defaults) {
            await enqueue(name, async () => {
                try {
                    await fs.access(filePath(name));
                } catch {
                    await writeFileAtomic(filePath(name), serialize(initial));
                }
            });
        }
    }

    /**
     * The one way a chat message gets saved, so every message keeps the same shape
     * and the same cap.
     */
    function addChatMessage(room, user, text) {
        return update(CHAT_DATA, (data) => {
            if (!data.messages[room]) data.messages[room] = [];
            const messages = data.messages[room];

            // Ids are a millisecond timestamp. Messages saved within the same
            // millisecond would share one, so bump past the newest id in the room.
            const last = messages.length ? Number(messages[messages.length - 1].id) || 0 : 0;
            const message = {
                id: String(Math.max(Date.now(), last + 1)),
                user,
                text,
                timestamp: new Date().toISOString()
            };
            messages.push(message);

            // Keep only the last messages per room to prevent infinite growth
            if (messages.length > MAX_MESSAGES_PER_ROOM) {
                data.messages[room] = messages.slice(-MAX_MESSAGES_PER_ROOM);
            }
            return message;
        });
    }

    return {
        root,
        uploadsDir,
        init,
        readComputerFiles: () => read(COMPUTER_FILES),
        updateComputerFiles: (mutate) => update(COMPUTER_FILES, mutate),
        readChat: () => read(CHAT_DATA),
        addChatMessage
    };
}

module.exports = {
    createVisitorStore,
    writeFileAtomic,
    DEFAULT_COMPUTER_FILES,
    MAX_MESSAGES_PER_ROOM
};
