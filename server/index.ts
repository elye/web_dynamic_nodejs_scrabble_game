import 'dotenv/config';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import expressSession from 'express-session';
import MemoryStore from 'memorystore';
import { withLogto } from '@logto/express';
import type { default as NodeClientType } from '@logto/node';
import { connectToMongo } from './db';
import { getUserGames, getGameDetail, getUserStatsSummary, getOpponentStats, deleteUserGameData, deleteUserGameDataAcrossCluster, getUserProfile, setUserDisplayName, isDisplayNameAvailable, deleteUserProfile, deleteSingleGame } from './gameStats';

const SessionStore = MemoryStore(expressSession);

import WebSocket from 'ws';
import { GameManager } from './game/GameManager';
import { setupWebSocketHandlers } from './ws/handlers';

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const logtoConfig = {
  appId: process.env.LOGTO_APP_ID!,
  appSecret: process.env.LOGTO_APP_SECRET!,
  endpoint: process.env.LOGTO_ENDPOINT!,
  baseUrl: BASE_URL,
};

// M2M credentials for Logto Management API (used for account deletion)
const LOGTO_M2M_APP_ID = process.env.LOGTO_M2M_APP_ID;
const LOGTO_M2M_APP_SECRET = process.env.LOGTO_M2M_APP_SECRET;

const REDIRECT_URI = process.env.LOGTO_REDIRECT_URI || `${BASE_URL}/callback`;
const POST_LOGOUT_URI = process.env.LOGTO_POST_LOGOUT_REDIRECT_URI || BASE_URL;

// @logto/node is ESM-only — load via native import() to avoid CJS require() transformation by TypeScript
let _NodeClient: typeof NodeClientType | null = null;
async function getNodeClientClass(): Promise<typeof NodeClientType> {
  if (!_NodeClient) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const mod = await (new Function('m', 'return import(m)')('@logto/node') as Promise<{ default: typeof NodeClientType }>);
    _NodeClient = mod.default;
  }
  return _NodeClient;
}

// Helper: create a Logto Node client for a given request/response
async function makeLogtoClient(req: express.Request, res: express.Response) {
  const Client = await getNodeClientClass();
  return new Client(logtoConfig, {
    storage: {
      async getItem(key: string) {
        return (req.session as Record<string, string | undefined>)[key] ?? null;
      },
      async setItem(key: string, value: string) {
        (req.session as Record<string, string | undefined>)[key] = value;
      },
      async removeItem(key: string) {
        delete (req.session as Record<string, string | undefined>)[key];
      },
    },
    navigate: (url: string) => res.redirect(url),
  });
}

// --- Logto Management API helpers (account deletion) ---

let cachedMgmtToken: { token: string; expiresAt: number } | null = null;

async function getLogtoMgmtToken(): Promise<string> {
  if (cachedMgmtToken && Date.now() < cachedMgmtToken.expiresAt) {
    return cachedMgmtToken.token;
  }

  const res = await fetch(`${logtoConfig.endpoint}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: LOGTO_M2M_APP_ID!,
      client_secret: LOGTO_M2M_APP_SECRET!,
      resource: `${logtoConfig.endpoint}/api`,
      scope: 'all',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain Logto management token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Cache with a 60-second safety margin
  cachedMgmtToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function deleteLogtoUser(userId: string): Promise<void> {
  const token = await getLogtoMgmtToken();
  const res = await fetch(`${logtoConfig.endpoint}/api/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete Logto user ${userId}: ${res.status} ${text}`);
  }
}

// Resolve client dir relative to project root (works from both dev and dist)
let clientDir = path.join(__dirname, '..', 'client');
if (!fs.existsSync(clientDir)) {
  clientDir = path.join(__dirname, '..', '..', 'client');
}

const app = express();

// Trust the reverse proxy (Render, etc.) so req.protocol returns 'https' correctly
app.set('trust proxy', 1);

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

// Logto auth routes — paths match what's registered in the Logto Console
app.get('/sign-in', async (req, res) => {
  const client = await makeLogtoClient(req, res);
  await client.signIn({ redirectUri: REDIRECT_URI });
});

app.get('/callback', async (req, res) => {
  const client = await makeLogtoClient(req, res);
  // Derive the full callback URL from the actual incoming request
  // to avoid mismatches when BASE_URL differs from the deployed hostname
  const callbackUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  await client.handleSignInCallback(callbackUrl);
  res.redirect(BASE_URL);
});

app.get('/sign-out', async (req, res) => {
  const client = await makeLogtoClient(req, res);
  await client.signOut(POST_LOGOUT_URI);
});

// Health check
app.get('/health', (_req, res) => {
  res.send('ok');
});

// Auth status endpoint — returns the current user's info (or null if not signed in)
app.get('/auth/me', withLogto(logtoConfig), async (req, res) => {
  const { isAuthenticated, claims } = req.user;
  if (!isAuthenticated) {
    res.json({ isAuthenticated: false, user: null });
    return;
  }
  // Look up the user's profile from MongoDB for their chosen display name
  const profile = claims?.sub ? await getUserProfile(claims.sub) : null;
  res.json({
    isAuthenticated: true,
    user: { sub: claims?.sub, name: claims?.name, email: claims?.email },
    profile: profile ? { displayName: profile.displayName } : null,
  });
});

// --- Stats API (protected — logged-in users only) ---

// Middleware: require authentication
const requireAuth: express.RequestHandler = (req, res, next) => {
  if (!req.user?.isAuthenticated || !req.user?.claims?.sub) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

// --- Profile API ---

// Check if a display name is available
app.get('/api/profile/check-name', withLogto(logtoConfig), requireAuth, async (req, res) => {
  const name = (req.query.name as string || '').trim();
  if (!name || name.length < 2 || name.length > 20) {
    res.json({ available: false, error: 'Name must be 2–20 characters' });
    return;
  }
  const userId = req.user.claims!.sub!;
  const available = await isDisplayNameAvailable(name, userId);
  res.json({ available });
});

// Set or update display name
app.post('/api/profile', express.json(), withLogto(logtoConfig), requireAuth, async (req, res) => {
  const displayName = (req.body.displayName || '').trim();
  if (!displayName || displayName.length < 2 || displayName.length > 20) {
    res.status(400).json({ error: 'Display name must be 2–20 characters' });
    return;
  }
  // Only allow alphanumeric, spaces, hyphens, underscores
  if (!/^[a-zA-Z0-9 _-]+$/.test(displayName)) {
    res.status(400).json({ error: 'Display name can only contain letters, numbers, spaces, hyphens, and underscores' });
    return;
  }
  const userId = req.user.claims!.sub!;
  const result = await setUserDisplayName(userId, displayName);
  if (!result.success) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.json({ success: true, displayName });
});

app.get('/api/stats/games', withLogto(logtoConfig), requireAuth, async (req, res) => {
  const userId = req.user.claims!.sub!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const result = await getUserGames(userId, page, limit);
  res.json(result);
});

app.get('/api/stats/summary', withLogto(logtoConfig), requireAuth, async (req, res) => {
  try {
    const userId = req.user.claims!.sub!;
    const result = await getUserStatsSummary(userId);
    res.json(result || { totalGames: 0, wins: 0, losses: 0, winRate: 0 });
  } catch (err) {
    console.error('Error loading stats summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/stats/opponents', withLogto(logtoConfig), requireAuth, async (req, res) => {
  const userId = req.user.claims!.sub!;
  const result = await getOpponentStats(userId);
  res.json(result);
});

app.get('/api/stats/games/:gameId', withLogto(logtoConfig), requireAuth, async (req, res) => {
  const userId = req.user.claims!.sub!;
  const game = await getGameDetail(req.params.gameId as string, userId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(game);
});

// Delete a single game by gameId
app.delete('/api/stats/games/:gameId', withLogto(logtoConfig), requireAuth, async (req, res) => {
  const userId = req.user.claims!.sub!;
  const deleted = await deleteSingleGame(req.params.gameId as string, userId);
  if (!deleted) {
    res.status(404).json({ error: 'Game not found or not authorized' });
    return;
  }
  res.json({ success: true });
});

// --- Account Danger Zone endpoints ---

// Delete all game data for the authenticated user
app.post('/api/account/delete-data', express.json(), withLogto(logtoConfig), requireAuth, async (req, res) => {
  try {
    const claims = req.user.claims!;
    const userId = claims.sub!;
    const profile = await getUserProfile(userId);
    const expectedUsername = profile?.displayName || claims.name || claims.email || claims.sub || 'Player';

    const { confirmUsername } = req.body;
    if (!confirmUsername || confirmUsername !== expectedUsername) {
      res.status(400).json({ error: 'Username confirmation does not match' });
      return;
    }

    const scrabbleResult = await deleteUserGameData(userId);
    res.json({
      success: true,
      scrabble: scrabbleResult,
    });
  } catch (err) {
    console.error('Error deleting user data:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete all game data, delete Logto user account, and sign out
app.post('/api/account/delete-account', express.json(), withLogto(logtoConfig), requireAuth, async (req, res) => {
  try {
    const claims = req.user.claims!;
    const userId = claims.sub!;
    const profile = await getUserProfile(userId);
    const expectedUsername = profile?.displayName || claims.name || claims.email || claims.sub || 'Player';

    const { confirmUsername } = req.body;
    if (!confirmUsername || confirmUsername !== expectedUsername) {
      res.status(400).json({ error: 'Username confirmation does not match' });
      return;
    }

    const scrabbleResult = await deleteUserGameData(userId);
    const clusterResult = await deleteUserGameDataAcrossCluster(userId);
    await deleteUserProfile(userId);

    // Delete the user from Logto via Management API
    let logtoWarning: string | undefined;
    if (LOGTO_M2M_APP_ID && LOGTO_M2M_APP_SECRET) {
      try {
        await deleteLogtoUser(userId);
      } catch (logtoErr) {
        console.error('Failed to delete Logto user account:', logtoErr);
        logtoWarning = 'Game data deleted but Logto account removal failed. Please contact support.';
      }
    } else {
      console.warn('LOGTO_M2M credentials not configured — skipping Logto user deletion');
      logtoWarning = 'Logto account removal skipped (M2M credentials not configured).';
    }

    // Destroy the session so the user is fully logged out
    (req.session as any)?.destroy?.();

    res.json({ success: true, scrabble: scrabbleResult, otherGames: clusterResult, ...(logtoWarning && { warning: logtoWarning }) });
  } catch (err) {
    console.error('Error deleting account:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
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

// Pre-warm the @logto/node dynamic ESM import so first sign-in is fast
getNodeClientClass().catch(() => {});

// Connect to MongoDB before starting the server
connectToMongo()
  .then((db) => {
    if (!db) {
      console.warn('⚠️  Server starting without MongoDB — game stats will not be saved');
    }
  })
  .catch((err) => {
    console.warn('⚠️  MongoDB connection failed — server starting without stats:', err);
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`🎮 Scrabble server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket server ready`);
    });
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
