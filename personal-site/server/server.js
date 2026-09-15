const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ...

const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
    console.error("FATAL ERROR: ADMIN_PASSWORD is not set.");
    process.exit(1);
}

// Ensure directories exist
(async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
    } catch (err) {
        console.error('Error creating directories:', err);
    }
})();

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR)
    },
    filename: function (req, file, cb) {
        // Sanitize filename and append timestamp to avoid collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext)
    }
});

const upload = multer({ storage: storage });



// Auth Middleware
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Login Route
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

// Generic Data Endpoints
const allowedFiles = ['timeline', 'history', 'reviews', 'media', 'cool_stuff', 'credits'];

// Get all data for a type
app.get('/api/data/:type', async (req, res) => {
    const { type } = req.params;
    if (!allowedFiles.includes(type)) {
        return res.status(400).json({ error: 'Invalid data type' });
    }

    const filePath = path.join(DATA_DIR, `${type}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Return empty array if file doesn't exist
            return res.json([]);
        }
        res.status(500).json({ error: 'Error reading data' });
    }
});

// Save data (Admin only)
app.post('/api/data/:type', authenticate, async (req, res) => {
    const { type } = req.params;
    if (!allowedFiles.includes(type)) {
        return res.status(400).json({ error: 'Invalid data type' });
    }
    const newData = req.body; // Expecting the full array or object to replace content, or logic to append? 
    // Simplified: Expecting the Frontend to send the Modified State or I can implement specific actions.
    // For simplicity, let's assume the frontend sends the requested object to ADD.
    // Actually, to support CRUD properly "modify", "delete", it's safer if frontend sends the whole updated list OR we implement granular IDs.
    // Requirement says: "modify them and just do CRUD".
    // Let's implement a simple "Overwrite" for now, or " Append" ?
    // "We'll add article text in the JSON file we already have".
    // Let's stick to: Endpoint receives the Full List to save. It's easiest for JSON files.

    const filePath = path.join(DATA_DIR, `${type}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify(newData, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error saving data' });
    }
});

// File Upload
// File Upload
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Return relative path
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

app.post('/api/delete-file', authenticate, async (req, res) => {
    const { url } = req.body;


    if (!url) return res.status(400).json({ error: 'No url provided' });

    // Sanitize and resolve path
    const filename = path.basename(url);
    const filePath = path.join(UPLOADS_DIR, filename);


    try {
        await fs.unlink(filePath);

        res.json({ success: true });
    } catch (err) {
        console.error('[API] Error deleting file:', err);
        // We generally return success even if file not found to avoid blocking UI
        res.json({ success: true, message: 'File could not be deleted or not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
