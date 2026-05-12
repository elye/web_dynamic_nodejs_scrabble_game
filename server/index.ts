import 'dotenv/config';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import expressSession from 'express-session';
import MemoryStore from 'memorystore';
import { handleAuthRoutes, withLogto } from '@logto/express';

const SessionStore = MemoryStore(expressSession);
import WebSocket from 'ws';
import { GameManager } from './game/GameManager';
import { setupWebSocketHandlers } from './ws/handlers';

const PORT = parseInt(process.env.PORT || '3000', 10);

const logtoConfig = {
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.LOGTO_ENDPOINT!,
  baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`,
  redirectUri: process.env.LOGTO_REDIRECT_URI!,
  postLogoutRedirectUri: process.env.LOGTO_POST_LOGOUT_REDIRECT_URI!,
};

// Resolve client dir relative to project root (works from both dev and dist)
let clientDir = path.join(__dirname, '..', 'client');
if (!fs.existsSync(clientDir)) {
  clientDir = path.join(__dirname, '..', '..', 'client');
}

const app = express();

// Session middleware (required by @logto/express)
// Uses memorystore (LRU-evicting) instead of the default MemoryStore to avoid memory leaks in production
app.use(expressSession({
  store: new SessionStore({ checkPeriod: 86400000 }), // prune expired sessions every 24h
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Logto auth routes: GET /sign-in, GET /sign-in-callback, GET /sign-out
app.use(handleAuthRoutes(logtoConfig));

// Health check
app.get('/health', (_req, res) => {
  res.send('ok');
});

// Auth status endpoint — returns the current user's info (or null if not signed in)
app.get('/auth/me', withLogto(logtoConfig), (req, res) => {
  const { isAuthenticated, claims } = req.user;
  if (!isAuthenticated) {
    res.json({ isAuthenticated: false, user: null });
    return;
  }
  res.json({ isAuthenticated: true, user: { sub: claims?.sub, name: claims?.name, email: claims?.email } });
});

// Static files
app.use(express.static(clientDir));

// SPA fallback (Express 5 compatible: use app.use instead of app.get('*'))
app.use((_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

const server = http.createServer(app);

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
