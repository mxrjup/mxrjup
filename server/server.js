const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createVisitorStore, DEFAULT_COMPUTER_FILES } = require('./visitorStore');

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

app.use(cors());
app.use(bodyParser.json());
// Visitor files and editorial media share the /uploads URL space but live in
// different repositories. The more specific mount must come first, and a visitor
// path that matches nothing stops here instead of falling through to the content.
app.use('/uploads/users', express.static(store.uploadsDir));
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
const allowedFiles = ['timeline', 'reviews', 'media', 'cool_stuff', 'credits'];

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

/**
 * The music timeline comes from two places, merged here rather than in a file so
 * neither side ever overwrites the other:
 *   timeline.json          - albums added by hand in the CMS, versioned in git.
 *   timeline_spotify.json  - the saved-albums export, rewritten weekly by cron
 *                            (scripts/spotify-cron.sh) and NOT versioned.
 * Titles are the timeline's identity, so a manual entry with the same title as a
 * Spotify one wins: that is how you correct what the export produced.
 */
async function readTimeline() {
    const spotify = await readItems(path.join(CONTENT_DATA_DIR, 'timeline_spotify.json'));
    const manual = await readItems(path.join(CONTENT_DATA_DIR, 'timeline.json'));

    const byTitle = new Map(spotify.map((item) => [item.title, item]));
    for (const item of manual) byTitle.set(item.title, item);

    return [...byTitle.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// Get all data for a type
app.get('/api/data/:type', async (req, res) => {
    const { type } = req.params;
    if (!allowedFiles.includes(type)) {
        return res.status(400).json({ error: 'Invalid data type' });
    }

    try {
        const items = type === 'timeline'
            ? await readTimeline()
            : await readItems(path.join(CONTENT_DATA_DIR, `${type}.json`));
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
const MAX_QUOTA_BYTES = (process.env.USER_UPLOADS_QUOTA_MB || 1000) * 1024 * 1024;
const MAX_FILE_BYTES = (process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;

// A route handler's mutate callback returns this to answer with an error; the store
// then writes nothing because the data did not change.
const reject = (status, body) => ({ rejected: { status, body } });

// Calculate total directory size
function getDirectorySize(dirPath) {
    let totalSize = 0;
    try {
        const files = fsSync.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fsSync.statSync(filePath);
            if (stats.isFile()) {
                totalSize += stats.size;
            }
        }
    } catch (err) {
        console.error('Error calculating directory size:', err);
    }
    return totalSize;
}

// GET /api/computer/quota - Get storage quota info
app.get('/api/computer/quota', (req, res) => {
    const currentSize = getDirectorySize(USER_UPLOADS_DIR);
    res.json({
        used: currentSize,
        total: MAX_QUOTA_BYTES,
        usedMB: (currentSize / 1024 / 1024).toFixed(2),
        totalMB: (MAX_QUOTA_BYTES / 1024 / 1024).toFixed(2),
        percentage: ((currentSize / MAX_QUOTA_BYTES) * 100).toFixed(2)
    });
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
app.post('/api/computer/folder', async (req, res) => {
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

// Configure multer for user uploads
const userUpload = multer({
    storage: multer.diskStorage({
        destination: USER_UPLOADS_DIR,
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            cb(null, uniqueSuffix + '-' + sanitized);
        }
    }),
    limits: { fileSize: MAX_FILE_BYTES }
});

// POST /api/computer/upload - Upload file
app.post('/api/computer/upload', userUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Check quota after upload
        const currentSize = getDirectorySize(USER_UPLOADS_DIR);

        if (currentSize > MAX_QUOTA_BYTES) {
            // Delete the just-uploaded file
            await fs.unlink(req.file.path);
            return res.status(413).json({
                error: 'Storage quota exceeded. Please delete some files first.',
                quota: MAX_QUOTA_BYTES,
                current: currentSize
            });
        }

        // Save metadata
        const fileEntry = {
            id: req.file.filename,
            name: req.file.originalname,
            path: `/uploads/users/${req.file.filename}`,
            size: req.file.size,
            mimeType: req.file.mimetype,
            folder: req.body.folder || 'My Documents',
            created: new Date().toISOString()
        };

        await store.updateComputerFiles((data) => {
            data.files.push(fileEntry);
        });

        res.json({
            success: true,
            file: fileEntry
        });
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (e) { }
        }
        res.status(500).json({ error: 'Upload failed' });
    }
});

// PUT /api/computer/file/:id - Update file metadata (move to folder)
app.put('/api/computer/file/:id', async (req, res) => {
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
app.delete('/api/computer/file/:id', async (req, res) => {
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
app.delete('/api/computer/folder/:name', async (req, res) => {
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
// MSN CHAT API
// ============================================

// GET /api/chat/rooms
app.get('/api/chat/rooms', async (req, res) => {
    try {
        const data = await store.readChat();
        res.json(data.rooms);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// GET /api/chat/:room/messages
app.get('/api/chat/:room/messages', async (req, res) => {
    try {
        const { room } = req.params;
        const data = await store.readChat();
        res.json(data.messages[room] || []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// POST /api/chat/:room/messages
app.post('/api/chat/:room/messages', async (req, res) => {
    try {
        const { room } = req.params;
        const { user, text } = req.body;

        if (!user || !text) return res.status(400).json({ error: 'User and text required' });

        res.json(await store.addChatMessage(room, user, text));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to post message' });
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
    // Explicitly define path to match Nginx location
    const wss = new WebSocket.Server({ server, path: '/ws' });

    // Debug: Log all upgrade requests to see if they reach the server
    server.on('upgrade', (request, socket, head) => {
        console.log(`[DEBUG] HTTP Upgrade request received for: ${request.url}`);
    });

    wss.on('connection', async (ws, req) => {
        console.log(`[DEBUG] WebSocket Client connected from ${req.socket.remoteAddress}`);

        // Send full chat history on connection
        try {
            const data = await store.readChat();
            ws.send(JSON.stringify({ type: 'history', data: data.messages['general'] || [] }));
        } catch (e) {
            console.error('Error sending history:', e);
        }

        ws.on('message', async (message) => {
            try {
                const parsed = JSON.parse(message);

                if (parsed.type === 'message') {
                    const { user, text } = parsed;
                    if (!user || !text) return;

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
            console.error('[DEBUG] WebSocket client error:', error);
        });

        ws.on('close', () => {
            console.log('[DEBUG] Client disconnected');
        });
    });
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
}).catch((err) => {
    console.error(`Cannot prepare the visitor data in ${VISITORS_DIR}:`, err);
    process.exit(1);
});
