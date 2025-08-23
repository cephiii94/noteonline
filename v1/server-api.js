const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// File untuk menyimpan data notes
const NOTES_FILE = path.join(__dirname, 'notes.json');

// Pastikan file notes.json ada
if (!fs.existsSync(NOTES_FILE)) {
    fs.writeFileSync(NOTES_FILE, JSON.stringify([]));
}

// Helper functions
function loadNotes() {
    try {
        const data = fs.readFileSync(NOTES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading notes:', error);
        return [];
    }
}

function saveNotes(notes) {
    try {
        fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving notes:', error);
        return false;
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// CORS headers
function setCORSHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Parse request body
function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Send JSON response
function sendJSONResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// API Routes
async function handleAPIRequest(req, res, pathname) {
    setCORSHeaders(res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        if (pathname === '/api/notes' && req.method === 'GET') {
            // GET all notes
            const notes = loadNotes();
            sendJSONResponse(res, 200, { success: true, data: notes });
            
        } else if (pathname === '/api/notes' && req.method === 'POST') {
            // CREATE new note
            const body = await parseRequestBody(req);
            const { title, content, category } = body;
            
            if (!title || !content) {
                sendJSONResponse(res, 400, { success: false, message: 'Title and content are required' });
                return;
            }
            
            const notes = loadNotes();
            const newNote = {
                id: generateId(),
                title,
                content,
                category: category || 'general',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            notes.unshift(newNote);
            
            if (saveNotes(notes)) {
                sendJSONResponse(res, 201, { success: true, data: newNote });
            } else {
                sendJSONResponse(res, 500, { success: false, message: 'Failed to save note' });
            }
            
        } else if (pathname.startsWith('/api/notes/') && req.method === 'PUT') {
            // UPDATE existing note
            const noteId = pathname.split('/')[3];
            const body = await parseRequestBody(req);
            const { title, content, category } = body;
            
            if (!title || !content) {
                sendJSONResponse(res, 400, { success: false, message: 'Title and content are required' });
                return;
            }
            
            const notes = loadNotes();
            const noteIndex = notes.findIndex(note => note.id === noteId);
            
            if (noteIndex === -1) {
                sendJSONResponse(res, 404, { success: false, message: 'Note not found' });
                return;
            }
            
            notes[noteIndex] = {
                ...notes[noteIndex],
                title,
                content,
                category: category || 'general',
                updatedAt: Date.now()
            };
            
            if (saveNotes(notes)) {
                sendJSONResponse(res, 200, { success: true, data: notes[noteIndex] });
            } else {
                sendJSONResponse(res, 500, { success: false, message: 'Failed to update note' });
            }
            
        } else if (pathname.startsWith('/api/notes/') && req.method === 'DELETE') {
            // DELETE note
            const noteId = pathname.split('/')[3];
            const notes = loadNotes();
            const noteIndex = notes.findIndex(note => note.id === noteId);
            
            if (noteIndex === -1) {
                sendJSONResponse(res, 404, { success: false, message: 'Note not found' });
                return;
            }
            
            const deletedNote = notes.splice(noteIndex, 1)[0];
            
            if (saveNotes(notes)) {
                sendJSONResponse(res, 200, { success: true, data: deletedNote });
            } else {
                sendJSONResponse(res, 500, { success: false, message: 'Failed to delete note' });
            }
            
        } else {
            // API endpoint not found
            sendJSONResponse(res, 404, { success: false, message: 'API endpoint not found' });
        }
        
    } catch (error) {
        console.error('API Error:', error);
        sendJSONResponse(res, 500, { success: false, message: 'Internal server error' });
    }
}

// Static file serving
function serveStaticFile(req, res, filePath) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// Main server
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    console.log(`${req.method} ${pathname}`);

    // Handle API requests
    if (pathname.startsWith('/api/')) {
        await handleAPIRequest(req, res, pathname);
        return;
    }

    // Handle static file requests
    let filePath = '.' + pathname;
    if (pathname === '/') {
        filePath = './index.html';
    }

    serveStaticFile(req, res, filePath);
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}/`);
    console.log(`📝 Notes API available at http://localhost:${PORT}/api/notes`);
    console.log(`💾 Notes stored in: ${NOTES_FILE}`);
});