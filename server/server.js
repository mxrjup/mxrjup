const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createVisitorStore, writeFileAtomic, DEFAULT_COMPUTER_FILES } = require('./visitorStore');
const { inspectUpload, displayName, storedName, UploadRejected, SERVED_TYPES } =
    require('./uploadPolicy');
const {
    parseTrustProxy, createRateLimiters, chatMessageError, createMessageBudget, MAX_WS_PAYLOAD
} = require('./abuseLimits');
const { createContentUpdater, createContentHook } = require('./contentWebhook');
const { scheduleDaily, runBackupScript } = require('./backupSchedule');

const app = express();
// Managed hosting assigns the port at runtime; 3000 is the local-dev fallback.
const PORT = process.env.PORT || 3000;
const CODE_ROOT = path.join(__dirname, '..');
const BROWSER_DIR = path.join(CODE_ROOT, 'dist/angular-mxrjup/browser');
const COMPUTER_DIR = path.join(CODE_ROOT, 'dist/computer');

// The server reads and writes nothing inside the code checkout. Content (the CMS's
// JSON and media) and visitor data are separate repositories, checked out wherever
// the host puts them. The defaults are the three repositories cloned side by side,
// which is the local-dev layout; relative paths are resolved from the code root.
const CONTENT_DIR = path.resolve(CODE_ROOT, process.env.CONTENT_DIR || '../mxrjup-content');
const VISITORS_DIR = path.resolve(CODE_ROOT, process.env.VISITORS_DIR || '../mxrjup-visitors');
const CONTENT_DATA_DIR = path.join(CONTENT_DIR, 'data');
const CONTENT_UPLOADS_DIR = path.join(CONTENT_DIR, 'uploads');

// Without content every page of the site is empty, and a wrong path is the likely
// cause, so refuse to start rather than serve a blank site that looks healthy.
if (!fsSync.existsSync(CONTENT_DATA_DIR)) {
    console.error(
        `No content at ${CONTENT_DATA_DIR}.\n` +
        'Clone mxrjup/mxrjup-content there, or point CONTENT_DIR (server/.env) at its checkout.'
    );
    process.exit(1);
}

// Deploys replace the code checkout wholesale, and whatever the server wrote there
// would go with it (or end up committed), so visitor data must live elsewhere.
const relativeToCode = path.relative(CODE_ROOT, VISITORS_DIR);
const outsideCode = relativeToCode === '..' || relativeToCode.startsWith(`..${path.sep}`);
if (!outsideCode && !path.isAbsolute(relativeToCode)) {
    console.error(`VISITORS_DIR (${VISITORS_DIR}) is inside the code checkout; point it outside.`);
    process.exit(1);
}

const store = createVisitorStore(VISITORS_DIR);

// req.ip, which the rate limits count by, is only the visitor's address if Express
// knows how many proxies stand in front of it (see abuseLimits.js).
const TRUST_PROXY = parseTrustProxy(process.env.TRUST_PROXY);
app.set('trust proxy', TRUST_PROXY);
const limits = createRateLimiters();

// Nobody can see from here how many proxies the host puts in front, so log what the
// first request looked like once per start: the address it came from (a proxy's, if
// there is one) and how many X-Forwarded-For entries it carried. TRUST_PROXY should
// equal that count.
let proxyChecked = false;
app.use((req, res, next) => {
    if (!proxyChecked) {
        proxyChecked = true;
        const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').filter(Boolean);
        console.log(`Proxy check: first request from ${req.socket.remoteAddress} with ` +
            `${forwarded.length} X-Forwarded-For entries; TRUST_PROXY=${TRUST_PROXY}`);
    }
    next();
});

// Never let a browser guess a type other than the one sent: a guess is how a file
// that is not a page ends up run as one.
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});

// GitHub calls this on every push to mxrjup-content, and the server pulls the content
// itself (contentWebhook.js). Mounted ahead of the JSON parser: the signature covers
// the exact bytes GitHub sent, so the body must reach the handler untouched.
const contentUpdater = createContentUpdater({ dir: CONTENT_DIR });
app.post('/api/hooks/content',
    express.raw({ type: '*/*', limit: '1mb' }),
    createContentHook({ secret: process.env.CONTENT_WEBHOOK_SECRET, updater: contentUpdater }));

app.use(cors());
app.use(bodyParser.json());

// Visitor files come from anyone and are served from this domain. Whatever one of
// them turns out to be, it gets no script, no plugin, no same-origin access (sandbox
// gives it an opaque origin), and other sites cannot embed it.
const VISITOR_FILE_CSP = "default-src 'none'; sandbox";
app.use('/uploads/users', (req, res, next) => {
    res.setHeader('Content-Security-Policy', VISITOR_FILE_CSP);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
});

// The Content-Type comes from the extension, which the server chose from the
// detected type (uploadPolicy.js), never from what the file looks like. Files from
// before that rule kept the visitor's extension: ".jpeg" photos still display (the
// type is fixed and nosniff holds whatever they contain), anything else is only
// offered as a download.
const LEGACY_TYPES = { jpeg: 'image/jpeg' };
function visitorFileHeaders(res, filePath) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const type = SERVED_TYPES[ext] || LEGACY_TYPES[ext];
    res.setHeader('Content-Type', type || 'application/octet-stream');
    if (!type) res.setHeader('Content-Disposition', 'attachment');
}

// Visitor files and editorial media share the /uploads URL space but live in
// different repositories. The more specific mount must come first, and a visitor
// path that matches nothing stops here instead of falling through to the content.
// express.static skips dotfiles, so the temporary file of an upload being written
// is never served.
app.use('/uploads/users', express.static(store.uploadsDir, {
    index: false,
    redirect: false,
    setHeaders: visitorFileHeaders
}));
app.use('/uploads/users', (req, res) => res.sendStatus(404));
// Editorial media keep their name when replaced in the CMS, and a publish reaches the
// disk in seconds, so browsers must revalidate (a cheap 304 via the ETag) rather than
// show a stale image for however long a max-age would allow.
const REVALIDATE = 'no-cache';
app.use('/uploads', express.static(CONTENT_UPLOADS_DIR, {
    cacheControl: false,
    setHeaders: (res) => res.setHeader('Cache-Control', REVALIDATE)
}));

// Generic Data Endpoints
// Read-only: content is written by Sveltia CMS (/admin), which commits straight
// to the content repository. Its checkout on this host is CONTENT_DIR.
const allowedFiles = ['timeline', 'reviews', 'media', 'cool_stuff', 'credits', 'stats'];

/**
 * Read one content file as a plain array.
 * Sveltia CMS stores the entries under "items"; files written before the CMS are
 * a bare array. Both shapes are served to the site the same way. A file that does
 * not exist yet reads as empty rather than failing - a fresh host has none of the
 * unversioned ones.
 */
async function readItems(filePath) {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return Array.isArray(parsed) ? parsed : (parsed.items || []);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

/** Read a content file that is one JSON object; a missing file reads as {}. */
async function readDocument(filePath) {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
        if (err.code === 'ENOENT') return {};
        throw err;
    }
}

// Get all data for a type
app.get('/api/data/:type', async (req, res) => {
    const { type } = req.params;
    if (!allowedFiles.includes(type)) {
        return res.status(400).json({ error: 'Invalid data type' });
    }

    try {
        // One document rather than a list: the listening stats the private
        // mxrjup-listening repository publishes every Monday. Served whole; a host
        // without it yet answers an empty object.
        if (type === 'stats') {
            res.setHeader('Cache-Control', REVALIDATE);
            return res.json(await readDocument(path.join(CONTENT_DATA_DIR, 'stats.json')));
        }
        let items = await readItems(path.join(CONTENT_DATA_DIR, `${type}.json`));
        // A hidden album stays in timeline.json so the weekly Spotify sync of the
        // content repository does not add it back; it is only kept off the site.
        if (type === 'timeline') items = items.filter((item) => item.hidden !== true);
        // The file is re-read on every request so a publish shows up at once; keep
        // browsers from answering from their cache instead (res.json sets the ETag).
        res.setHeader('Cache-Control', REVALIDATE);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: 'Error reading data' });
    }
});

// ============================================
// WINDOWS 95 COMPUTER API
// ============================================

const USER_UPLOADS_DIR = store.uploadsDir;
const MAX_QUOTA_BYTES = (process.env.USER_UPLOADS_QUOTA_MB || 100) * 1024 * 1024;
const MAX_FILE_BYTES = (process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;
// Room for the multipart envelope around the file: boundaries, part headers and the
// folder field.
const MULTIPART_OVERHEAD = 64 * 1024;

// A route handler's mutate callback returns this to answer with an error; the store
// then writes nothing because the data did not change.
const reject = (status, body) => ({ rejected: { status, body } });

/**
 * Bytes used by visitor files, from the index rather than the disk: the index is what
 * the upload route updates under its lock, so a check against it cannot race.
 */
function usedBytes(data) {
    return data.files
        .filter((f) => f.type !== 'folder')
        .reduce((total, f) => total + (Number(f.size) || 0), 0);
}

const quotaExceeded = (current) => reject(413, {
    error: 'Storage quota exceeded. Please delete some files first.',
    quota: MAX_QUOTA_BYTES,
    current
});
const fileTooLarge = () => reject(413, {
    error: `File too large. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB per file.`,
    limit: MAX_FILE_BYTES
});
const sendRejected = (res, { rejected }) => res.status(rejected.status).json(rejected.body);

// GET /api/computer/quota - Get storage quota info
app.get('/api/computer/quota', async (req, res) => {
    try {
        const currentSize = usedBytes(await store.readComputerFiles());
        res.json({
            used: currentSize,
            total: MAX_QUOTA_BYTES,
            usedMB: (currentSize / 1024 / 1024).toFixed(2),
            totalMB: (MAX_QUOTA_BYTES / 1024 / 1024).toFixed(2),
            percentage: ((currentSize / MAX_QUOTA_BYTES) * 100).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read quota' });
    }
});

// GET /api/computer/files - Get all files
app.get('/api/computer/files', async (req, res) => {
    try {
        res.json(await store.readComputerFiles());
    } catch (err) {
        res.json(DEFAULT_COMPUTER_FILES);
    }
});

// POST /api/computer/folder - Create virtual folder
app.post('/api/computer/folder', limits.desktop, async (req, res) => {
    try {
        const { name, parentId } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Folder name required' });
        }

        const result = await store.updateComputerFiles((data) => {
            // Check if folder already exists in the same parent
            const exists = data.files.some(f => f.name === name && f.folder === (parentId || 'Desktop') && f.type === 'folder');
            if (exists) {
                return reject(400, { error: 'Folder already exists' });
            }

            const newFolder = {
                id: `folder-${Date.now()}-${Math.round(Math.random() * 1000)}`,
                name: name,
                type: 'folder',
                folder: parentId || 'Desktop', // This is the parent folder ID
                pic: 'Project',
                size: 0,
                date: new Date().toISOString()
            };

            data.files.push(newFolder);
            return { folder: newFolder };
        });

        if (result.rejected) return res.status(result.rejected.status).json(result.rejected.body);
        res.json({ success: true, folder: result.folder });
    } catch (err) {
        console.error('Error creating folder:', err);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Uploads are received in memory and only reach the public uploads directory once
// every check has passed, so a refused file never touches the disk. The size limit
// bounds the memory one upload can take.
const userUpload = multer({
    storage: multer.memoryStorage(),
    // Browsers send the file name as raw UTF-8.
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 4, fieldSize: 1024, parts: 5 }
});

/**
 * Refuse before reading the body what the Content-Length already rules out: a file
 * over the per-file limit, or one that cannot fit in what is left of the quota. The
 * final quota check happens again under the index lock, with the real size.
 */
async function checkAnnouncedSize(req, res, next) {
    try {
        const announced = Number(req.headers['content-length']) || 0;
        if (announced > MAX_FILE_BYTES + MULTIPART_OVERHEAD) {
            return sendRejected(res, fileTooLarge());
        }
        const current = usedBytes(await store.readComputerFiles());
        if (current + announced > MAX_QUOTA_BYTES) return sendRejected(res, quotaExceeded(current));
        next();
    } catch (err) {
        next(err);
    }
}

function receiveUpload(req, res, next) {
    userUpload.single('file')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return sendRejected(res, fileTooLarge());
        // Anything else is a request the parser could not make sense of (a limit, a
        // malformed body): the client's fault, and not worth a stack trace in reply.
        res.status(400).json({ error: 'Invalid upload' });
    });
}

// POST /api/computer/upload - Upload file
app.post('/api/computer/upload', limits.upload, checkAnnouncedSize, receiveUpload,
    async (req, res) => {
        let written = null;
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const media = await inspectUpload(req.file.buffer);
            // A re-encoded image can come out larger than it went in.
            if (media.data.length > MAX_FILE_BYTES) return sendRejected(res, fileTooLarge());

            const filename = storedName(media.ext);
            const target = path.join(USER_UPLOADS_DIR, filename);

            // Quota check, file write and index entry in one serialized update: two
            // uploads arriving together cannot both fit in the space left for one.
            const result = await store.updateComputerFiles(async (data) => {
                const current = usedBytes(data);
                if (current + media.data.length > MAX_QUOTA_BYTES) return quotaExceeded(current);

                written = target;
                await writeFileAtomic(target, media.data);

                const fileEntry = {
                    id: filename,
                    name: displayName(req.file.originalname),
                    path: `/uploads/users/${filename}`,
                    size: media.data.length,
                    mimeType: media.mime,
                    folder: req.body.folder || 'My Documents',
                    created: new Date().toISOString()
                };
                data.files.push(fileEntry);
                return { file: fileEntry };
            });

            if (result.rejected) return sendRejected(res, result);
            res.json({
                success: true,
                file: result.file
            });
        } catch (error) {
            // The file is on disk but the index could not be saved: nothing refers to it.
            if (written) await fs.unlink(written).catch(() => {});
            if (error instanceof UploadRejected) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Upload failed' });
        }
    });

// PUT /api/computer/file/:id - Update file metadata (move to folder)
app.put('/api/computer/file/:id', limits.desktop, async (req, res) => {
    try {
        const { id } = req.params;
        const { folder } = req.body;

        if (!folder) {
            return res.status(400).json({ error: 'Folder is required' });
        }

        const result = await store.updateComputerFiles((data) => {
            const file = data.files.find(f => f.id === id);
            if (!file) {
                return reject(404, { error: 'File not found' });
            }

            // Update folder
            file.folder = folder;
            return { file };
        });

        if (result.rejected) return res.status(result.rejected.status).json(result.rejected.body);
        res.json({ success: true, file: result.file });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Update failed' });
    }
});

// DELETE /api/computer/file/:id - Delete file
app.delete('/api/computer/file/:id', limits.desktop, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await store.updateComputerFiles(async (data) => {
            const file = data.files.find(f => f.id === id);

            if (!file) {
                return reject(404, { error: 'File not found' });
            }

            // Delete actual file
            const filePath = path.join(USER_UPLOADS_DIR, id);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.log('File already deleted or not found:', id);
            }

            // Remove from metadata
            data.files = data.files.filter(f => f.id !== id);
            return {};
        });

        if (result.rejected) return res.status(result.rejected.status).json(result.rejected.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// DELETE /api/computer/folder/:name - Recursive Delete Folder
app.delete('/api/computer/folder/:name', limits.desktop, async (req, res) => {
    try {
        const { name } = req.params;

        const deletedCount = await store.updateComputerFiles(async (filesData) => {
            // Helper to find all children recursively
            const idsToDelete = new Set();
            const filesToDelete = [];

            function findChildren(folderName) {
                // Find files directly in this folder
                const childrenFiles = filesData.files.filter(f => f.folder === folderName && f.type !== 'folder');
                childrenFiles.forEach(f => {
                    idsToDelete.add(f.id);
                    if (f.id && !f.id.startsWith('folder-')) {
                        filesToDelete.push(f.id); // Physical files to delete
                    }
                });

                // Find subfolders
                const childrenFolders = filesData.files.filter(f => f.folder === folderName && f.type === 'folder');
                childrenFolders.forEach(f => {
                    idsToDelete.add(f.id); // Delete the folder metadata too
                    // Recurse
                    findChildren(f.name);
                });
            }

            // Start recursion
            findChildren(name);

            // Delete physical files
            for (const fileId of filesToDelete) {
                const filePath = path.join(USER_UPLOADS_DIR, fileId);
                try {
                    await fs.unlink(filePath);
                } catch (err) {
                    console.log(`File already deleted or not found: ${fileId}`);
                }
            }

            // The client identifies the folder by name, so remove the folder entry
            // itself along with everything found inside it.
            filesData.files = filesData.files.filter(f => {
                if (f.name === name && f.type === 'folder') return false; // Delete the folder itself
                if (idsToDelete.has(f.id)) return false; // Delete children
                return true;
            });

            return idsToDelete.size + 1;
        });

        res.json({ success: true, deletedCount });
    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({ error: 'Delete folder failed' });
    }
});

// ============================================
// STATIC FRONTENDS
// ============================================
// Managed hosting runs a single Node process with no nginx in front of it, so
// this server also serves both builds. Registered after the API routes above so
// it only sees what they didn't handle.

// The app shells must never be cached: their filename is stable while the
// hashed bundles they point at change on every build, so a cached copy keeps
// loading the previous release. nginx set this before it was removed.
const NO_STORE = 'no-store, no-cache, must-revalidate';
const shellHeaders = (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', NO_STORE);
};
const sendShell = (res, next, dir) => {
    res.setHeader('Cache-Control', NO_STORE);
    res.sendFile(path.join(dir, 'index.html'), (err) => err && next());
};

// Windows 95 computer app (React, built to dist/computer)
app.use('/computer', express.static(COMPUTER_DIR, { setHeaders: shellHeaders }));
app.get('/computer/*', (req, res, next) => sendShell(res, next, COMPUTER_DIR));

// The old hand-built back office lived here; send bookmarks to the CMS.
app.get('/add', (req, res) => res.redirect(302, '/admin/'));

// Angular site, with client-side routing falling back to its index.html
app.use(express.static(BROWSER_DIR, { setHeaders: shellHeaders }));
app.get('*', (req, res, next) => {
    // Unmatched API and upload paths are 404s, not the Angular shell.
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    sendShell(res, next, BROWSER_DIR);
});

// ============================================
// WEBSOCKET SERVER
// ============================================
const WebSocket = require('ws');

function startWebSocket(server) {
    // A larger frame than a chat message closes the connection (ws's default would
    // accept 100 MB).
    const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: MAX_WS_PAYLOAD });

    wss.on('connection', async (ws) => {
        // Send full chat history on connection
        try {
            const data = await store.readChat();
            ws.send(JSON.stringify({ type: 'history', data: data.messages['general'] || [] }));
        } catch (e) {
            console.error('Error sending history:', e);
        }

        // The HTTP rate limiters never see WebSocket messages, so each connection has
        // its own budget.
        // A refusal is a message the client ignores; closing would only make it
        // reconnect.
        const budget = createMessageBudget();
        const refuse = (error) => ws.send(JSON.stringify({ type: 'error', error }));

        ws.on('message', async (message) => {
            try {
                if (!budget.take()) return refuse('Too many messages, slow down.');
                const parsed = JSON.parse(message);

                if (parsed.type === 'message') {
                    const { user, text } = parsed;
                    const invalid = chatMessageError(user, text);
                    if (invalid) return refuse(invalid);

                    const newMessage = await store.addChatMessage('general', user, text);

                    // Broadcast to ALL clients (including sender)
                    const broadcastMsg = JSON.stringify({ type: 'message', data: newMessage });
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(broadcastMsg);
                        }
                    });
                }
            } catch (e) {
                console.error('WebSocket message error:', e);
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket client error:', error);
        });
    });
}

// The host has no crontab, so the server starts the nightly backup of the visitor data
// itself, at VISITORS_BACKUP_AT (HH:MM, the host's local time). Unset means no backup,
// which is what a development machine wants.
function scheduleVisitorBackup() {
    const at = process.env.VISITORS_BACKUP_AT;
    if (!at) return;
    const script = path.join(CODE_ROOT, 'scripts', 'backup-visitors.sh');
    try {
        scheduleDaily({ at, run: () => runBackupScript({ script, visitorsDir: VISITORS_DIR }) });
        console.log(`Visitor data backup every day at ${at}`);
    } catch (err) {
        // A typo must not take the site down, but it must be seen.
        console.error(`BACKUP FAILED: no nightly backup scheduled: ${err.message}`);
    }
}

// Listen only once the visitor files exist, so the first request on an empty
// VISITORS_DIR finds them.
store.init().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`Content from ${CONTENT_DIR}`);
        console.log(`Visitor data in ${VISITORS_DIR}`);
        console.log(`Server running on port ${server.address().port}`);
    });
    startWebSocket(server);
    scheduleVisitorBackup();
}).catch((err) => {
    console.error(`Cannot prepare the visitor data in ${VISITORS_DIR}:`, err);
    process.exit(1);
});
