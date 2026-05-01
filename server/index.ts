import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import WebSocket from 'ws';
import { GameManager } from './game/GameManager';
import { setupWebSocketHandlers } from './ws/handlers';

const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME_TYPES: { [ext: string]: string } = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

// Resolve client dir relative to project root (works from both dev and dist)
let clientDir = path.join(__dirname, '..', 'client');
if (!require('fs').existsSync(clientDir)) {
  clientDir = path.join(__dirname, '..', '..', 'client');
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  let filePath = req.url || '/';
  
  if (filePath === '/') {
    filePath = '/index.html';
  }

  const fullPath = path.join(clientDir, filePath);
  const ext = path.extname(fullPath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  // Security: prevent directory traversal
  if (!fullPath.startsWith(clientDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Try serving index.html for SPA routing
        fs.readFile(path.join(clientDir, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    }
  });
});

const wss = new WebSocket.Server({ server });
const gameManager = new GameManager();

setupWebSocketHandlers(wss, gameManager);

server.listen(PORT, () => {
  console.log(`🎮 Scrabble server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready`);
});

// Ping/pong keepalive to detect dead connections
const PING_INTERVAL = 15000;
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

wss.on('connection', (ws: any) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Catch unhandled errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
