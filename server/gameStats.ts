import { Db } from 'mongodb';
import { getDb, getSharedDb, getClient } from './db';

export interface GamePlayerRecord {
  playerId: string;
  userId?: string;       // Logto sub — present only for logged-in players
  username: string;
  avatar: string;
  score: number;
  isAI: boolean;
  aiDifficulty?: string;
  stats: any;            // per-player stats from GAME_OVER payload
}

export interface GameRecord {
  gameId: string;        // roomId
  players: GamePlayerRecord[];
  winnerIdx: number;     // index into players array
  reason: string;
  timedOutPlayerIdx?: number; // index into players array
  gameSummary: any;
  scoreProgression: any; // keyed by player index
  turnEvents: any;       // { turn, pIdx, type }[]
  turnHistory: any;      // entries use pIdx instead of playerId
  settings: any;         // includes timeoutMode as 'SD'|'OT'|'N/A'
  isSolo: boolean;
  endedAt: Date;
}

/**
 * Hydrate a stored game record: expand compact player indices back to
 * full playerIds so client code can reference them uniformly.
 */
export function hydrateGameRecord(game: any): any {
  if (!game || !game.players) return game;

  const players = game.players;

  // Expand winnerIdx → winnerId + winnerUsername
  game.winnerId = players[game.winnerIdx]?.playerId;
  game.winnerUsername = players[game.winnerIdx]?.username;
  if (game.timedOutPlayerIdx !== undefined) {
    game.timedOutPlayer = players[game.timedOutPlayerIdx]?.playerId;
  }

  // Expand scoreProgression keys: numeric index → playerId
  if (game.scoreProgression) {
    const expanded: any = {};
    for (const [key, val] of Object.entries(game.scoreProgression)) {
      const idx = parseInt(key);
      if (!isNaN(idx) && players[idx]) {
        expanded[players[idx].playerId] = val;
      }
    }
    game.scoreProgression = expanded;
  }

  // Expand turnEvents pIdx → playerId
  if (game.turnEvents) {
    game.turnEvents = game.turnEvents.map((e: any) => ({
      ...e, playerId: players[e.pIdx]?.playerId,
    }));
  }

  // Expand turnHistory pIdx → playerId + username, restore abbreviated actions
  const actionExpand: Record<string, string> = { p: 'play', s: 'pass', x: 'exchange' };
  if (game.turnHistory) {
    game.turnHistory = game.turnHistory.map((t: any) => {
      const p = players[t.pIdx];
      return { ...t, action: actionExpand[t.action] || t.action, playerId: p?.playerId, username: p?.username };
    });
  }

  // Expand gameSummary pIdx → player (username)
  if (game.gameSummary) {
    for (const field of ['bestWord', 'bestTurn', 'longestWord']) {
      const item = game.gameSummary[field];
      if (item && item.pIdx !== undefined) {
        item.player = players[item.pIdx]?.username || '';
      }
    }
  }

  return game;
}

/**
 * Save a completed game to MongoDB.
 * Fails silently — the game continues to work even if MongoDB is unavailable.
 */
export async function saveGameRecord(record: GameRecord): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      console.warn('⚠️ MongoDB not connected — game stats not saved');
      return;
    }

    await db.collection('games').insertOne({
      ...record,
      endedAt: record.endedAt,
    });
    console.log(`📊 Game ${record.gameId} stats saved to MongoDB`);
  } catch (err) {
    console.error('Failed to save game stats:', err);
  }
}

/**
 * Get paginated list of past games for a user.
 */
export async function getUserGames(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ games: any[]; total: number; page: number; totalPages: number }> {
  const db = getDb();
  if (!db) return { games: [], total: 0, page, totalPages: 0 };

  const filter = { 'players.userId': userId };
  const total = await db.collection('games').countDocuments(filter);
  const totalPages = Math.ceil(total / limit);

  const games = await db.collection('games')
    .find(filter)
    .sort({ endedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .project({
      gameId: 1,
      players: { userId: 1, playerId: 1, username: 1, score: 1, isAI: 1, isDeleted: 1 },
      winnerIdx: 1,
      reason: 1,
      isSolo: 1,
      endedAt: 1,
      'gameSummary.totalTurns': 1,
      'gameSummary.totalWordsPlayed': 1,
      settings: 1,
    })
    .toArray();

  return { games: games.map(g => hydrateGameRecord(g)), total, page, totalPages };
}

/**
 * Get detailed view of a specific game.
 */
export async function getGameDetail(gameId: string, userId: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;

  const game = await db.collection('games').findOne({
    gameId,
    'players.userId': userId,
  });
  return hydrateGameRecord(game);
}

/**
 * Get overall stats summary for a user.
 */
export async function getUserStatsSummary(userId: string): Promise<any> {
  const db = getDb();
  if (!db) return null;

  const pipeline = [
    { $match: { 'players.userId': userId } },
    // Add user position (1-based rank by score descending) and player count
    {
      $addFields: {
        _sortedScores: {
          $sortArray: { input: '$players', sortBy: { score: -1 } },
        },
        _playerCount: { $size: '$players' },
      },
    },
    {
      $addFields: {
        _userPlayer: {
          $arrayElemAt: [
            { $filter: { input: '$players', as: 'p', cond: { $eq: ['$$p.userId', userId] } } },
            0,
          ],
        },
        _userPosition: {
          $add: [
            {
              $indexOfArray: [
                {
                  $map: {
                    input: { $sortArray: { input: '$players', sortBy: { score: -1 } } },
                    as: 's',
                    in: '$$s.userId',
                  },
                },
                userId,
              ],
            },
            1,
          ],
        },
      },
    },
    {
      $facet: {
        totals: [
          { $match: { $expr: { $gt: ['$_playerCount', 1] } } },
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              wins: { $sum: { $cond: [{ $eq: ['$_userPosition', 1] }, 1, 0] } },
              second: { $sum: { $cond: [{ $eq: ['$_userPosition', 2] }, 1, 0] } },
              third: { $sum: { $cond: [{ $eq: ['$_userPosition', 3] }, 1, 0] } },
              fourth: { $sum: { $cond: [{ $eq: ['$_userPosition', 4] }, 1, 0] } },
              lastPlace: { $sum: { $cond: [{ $eq: ['$_userPosition', '$_playerCount'] }, 1, 0] } },
            },
          },
        ],
        soloGamesTotal: [
          { $match: { $expr: { $eq: ['$_playerCount', 1] } } },
          { $count: 'count' },
        ],
        bestScore1p: [
          { $match: { $expr: { $eq: ['$_playerCount', 1] } } },
          { $sort: { '_userPlayer.score': -1 } },
          { $limit: 1 },
          { $project: { score: '$_userPlayer.score' } },
        ],
        bestScore2p: [
          { $match: { $expr: { $eq: ['$_playerCount', 2] } } },
          { $sort: { '_userPlayer.score': -1 } },
          { $limit: 1 },
          { $project: { score: '$_userPlayer.score' } },
        ],
        bestScore3p: [
          { $match: { $expr: { $eq: ['$_playerCount', 3] } } },
          { $sort: { '_userPlayer.score': -1 } },
          { $limit: 1 },
          { $project: { score: '$_userPlayer.score' } },
        ],
        bestScore4p: [
          { $match: { $expr: { $eq: ['$_playerCount', 4] } } },
          { $sort: { '_userPlayer.score': -1 } },
          { $limit: 1 },
          { $project: { score: '$_userPlayer.score' } },
        ],
        bestWord: [
          { $match: { '_userPlayer.stats.bestWord': { $ne: null } } },
          { $sort: { '_userPlayer.stats.bestWord.score': -1 } },
          { $limit: 1 },
          { $project: { bestWord: '$_userPlayer.stats.bestWord' } },
        ],
        bestTurn: [
          { $match: { '_userPlayer.stats.bestTurn': { $ne: null } } },
          { $sort: { '_userPlayer.stats.bestTurn.score': -1 } },
          { $limit: 1 },
          { $project: { bestTurn: '$_userPlayer.stats.bestTurn' } },
        ],
        totalBingos: [
          {
            $addFields: {
              _userStats: {
                $arrayElemAt: [
                  { $filter: { input: '$players', as: 'p', cond: { $eq: ['$$p.userId', userId] } } },
                  0,
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$_userStats.stats.bingoCount' },
            },
          },
        ],
        recentGames: [
          { $sort: { endedAt: -1 } },
          { $limit: 10 },
          {
            $project: {
              gameId: 1,
              winnerIdx: 1,
              endedAt: 1,
              players: { playerId: 1, userId: 1, username: 1, score: 1, isAI: 1 },
            },
          },
        ],
      },
    },
  ];

  const results = await db.collection('games').aggregate(pipeline).toArray();
  const data = results[0] || {};

  const totals = data.totals?.[0] || { totalGames: 0, wins: 0, second: 0, third: 0, fourth: 0, lastPlace: 0 };

  return {
    totalGames: totals.totalGames,
    wins: totals.wins,
    second: totals.second,
    third: totals.third,
    fourth: totals.fourth,
    lastPlace: totals.lastPlace ?? 0,
    soloGames: data.soloGamesTotal?.[0]?.count ?? 0,
    totalBingos: data.totalBingos?.[0]?.total ?? 0,
    bestScore1p: data.bestScore1p?.[0]?.score ?? null,
    bestScore2p: data.bestScore2p?.[0]?.score ?? null,
    bestScore3p: data.bestScore3p?.[0]?.score ?? null,
    bestScore4p: data.bestScore4p?.[0]?.score ?? null,
    bestWord: data.bestWord?.[0]?.bestWord || null,
    bestTurn: data.bestTurn?.[0]?.bestTurn || null,
    recentGames: (data.recentGames || []).map((g: any) => hydrateGameRecord(g)),
  };
}

/**
 * Get win/loss record against each opponent.
 */
export async function getOpponentStats(userId: string): Promise<any[]> {
  const db = getDb();
  if (!db) return [];

  const pipeline = [
    { $match: { 'players.userId': userId } },
    // Extract the user's score for comparison
    {
      $addFields: {
        _userScore: {
          $getField: {
            field: 'score',
            input: {
              $arrayElemAt: [
                { $filter: { input: '$players', as: 'p', cond: { $eq: ['$$p.userId', userId] } } },
                0,
              ],
            },
          },
        },
      },
    },
    { $unwind: '$players' },
    // Keep only opponent rows
    { $match: { 'players.userId': { $ne: userId }, 'players.isAI': { $in: [true, false] } } },
    {
      $group: {
        _id: {
          opponentName: '$players.username',
          isAI: '$players.isAI',
          opponentUserId: { $ifNull: ['$players.userId', null] },
        },
        totalGames: { $sum: 1 },
        wins: {
          $sum: { $cond: [{ $gt: ['$_userScore', '$players.score'] }, 1, 0] },
        },
        losses: {
          $sum: { $cond: [{ $lt: ['$_userScore', '$players.score'] }, 1, 0] },
        },
        draws: {
          $sum: { $cond: [{ $eq: ['$_userScore', '$players.score'] }, 1, 0] },
        },
        lastPlayed: { $max: '$endedAt' },
      },
    },
    { $sort: { totalGames: -1 } },
    {
      $project: {
        _id: 0,
        opponentName: '$_id.opponentName',
        isAI: '$_id.isAI',
        isRegistered: { $cond: [{ $ne: ['$_id.opponentUserId', null] }, true, false] },
        totalGames: 1,
        wins: 1,
        losses: 1,
        draws: 1,
        lastPlayed: 1,
      },
    },
  ];

  return db.collection('games').aggregate(pipeline).toArray();
}

/**
 * Handle game data when a user deletes their account:
 * - Games with NO other registered players: delete entirely
 * - Games WITH other registered players: anonymize the deleted user
 *   (clear userId, mark as deleted) so other players keep their history
 */
export async function deleteUserGameData(userId: string): Promise<{ deleted: number; anonymized: number }> {
  const db = getDb();
  if (!db) return { deleted: 0, anonymized: 0 };

  const games = await db.collection('games').find({ 'players.userId': userId }).toArray();

  let deleted = 0;
  let anonymized = 0;

  for (const game of games) {
    const hasOtherRegistered = game.players.some(
      (p: any) => p.userId && p.userId !== userId && !p.isAI
    );

    if (hasOtherRegistered) {
      // Anonymize the deleted user in this game
      await db.collection('games').updateOne(
        { _id: game._id },
        {
          $set: {
            'players.$[elem].userId': null,
            'players.$[elem].username': 'Deleted User',
            'players.$[elem].isDeleted': true,
          },
        },
        { arrayFilters: [{ 'elem.userId': userId }] }
      );
      anonymized++;
    } else {
      // No other registered players — safe to delete
      await db.collection('games').deleteOne({ _id: game._id });
      deleted++;
    }
  }

  console.log(`🗑️ User ${userId}: deleted ${deleted} games, anonymized in ${anonymized} games`);
  return { deleted, anonymized };
}

/**
 * Scan ALL databases in the MongoDB cluster for `games` collections
 * that use the `players.userId` schema, and apply the same
 * delete/anonymize logic. Skips the current scrabble database
 * (handled by deleteUserGameData).
 */
export async function deleteUserGameDataAcrossCluster(
  userId: string
): Promise<{ deleted: number; anonymized: number; databases: string[] }> {
  const mongoClient = getClient();
  if (!mongoClient) return { deleted: 0, anonymized: 0, databases: [] };

  const gameDbs = process.env.SHARED_USER_GAME_DBS;
  if (!gameDbs) {
    console.warn('⚠️  SHARED_USER_GAME_DBS not set — skipping cross-cluster deletion');
    return { deleted: 0, anonymized: 0, databases: [] };
  }

  const currentDbName = getDb()?.databaseName;
  const sharedDbName = getSharedDb()?.databaseName;
  const allowedDbs = gameDbs.split(',').map(s => s.trim()).filter(s => s);

  let totalDeleted = 0;
  let totalAnonymized = 0;
  const touchedDbs: string[] = [];

  for (const dbName of allowedDbs) {
    // Skip the current game database and the shared users database (handled separately)
    if (dbName === currentDbName || dbName === sharedDbName) continue;

    const otherDb = mongoClient.db(dbName);
    const collections = await otherDb.listCollections({ name: 'games' }).toArray();
    if (collections.length === 0) continue;

    const gamesCol = otherDb.collection('games');
    const games = await gamesCol.find({ 'players.userId': userId }).toArray();
    if (games.length === 0) continue;

    touchedDbs.push(dbName);

    for (const game of games) {
      const hasOtherRegistered = game.players.some(
        (p: any) => p.userId && p.userId !== userId && !p.isAI
      );

      if (hasOtherRegistered) {
        await gamesCol.updateOne(
          { _id: game._id },
          {
            $set: {
              'players.$[elem].userId': null,
              'players.$[elem].username': 'Deleted User',
              'players.$[elem].isDeleted': true,
            },
          },
          { arrayFilters: [{ 'elem.userId': userId }] }
        );
        totalAnonymized++;
      } else {
        await gamesCol.deleteOne({ _id: game._id });
        totalDeleted++;
      }
    }
  }

  if (touchedDbs.length > 0) {
    console.log(`🗑️ Cross-cluster cleanup for ${userId}: deleted ${totalDeleted}, anonymized ${totalAnonymized} across [${touchedDbs.join(', ')}]`);
  }

  return { deleted: totalDeleted, anonymized: totalAnonymized, databases: touchedDbs };
}

/**
 * Delete a single game by gameId, only if the user participated in it.
 * Returns true if the game was deleted.
 */
export async function deleteSingleGame(gameId: string, userId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const result = await db.collection('games').deleteOne({ gameId, 'players.userId': userId });
  return result.deletedCount > 0;
}

// ─── User Profile ────────────────────────────────────────────

export interface UserProfile {
  logtoUserId: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Get a user profile by Logto user ID. */
export async function getUserProfile(logtoUserId: string): Promise<UserProfile | null> {
  const db = getSharedDb();
  if (!db) return null;
  return db.collection<UserProfile>('users').findOne({ logtoUserId });
}

/** Set or update the display name for a user. Returns true if successful. */
export async function setUserDisplayName(logtoUserId: string, displayName: string): Promise<{ success: boolean; error?: string }> {
  const db = getSharedDb();
  if (!db) return { success: false, error: 'Database not available' };

  // Check uniqueness (case-insensitive)
  const existing = await db.collection<UserProfile>('users').findOne({
    displayName: { $regex: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    logtoUserId: { $ne: logtoUserId },
  });
  if (existing) {
    return { success: false, error: 'This username is already taken' };
  }

  const now = new Date();
  await db.collection<UserProfile>('users').updateOne(
    { logtoUserId },
    { $set: { displayName, updatedAt: now }, $setOnInsert: { logtoUserId, createdAt: now } },
    { upsert: true },
  );
  return { success: true };
}

/** Check if a display name is available (case-insensitive). */
export async function isDisplayNameAvailable(displayName: string, excludeUserId?: string): Promise<boolean> {
  const db = getSharedDb();
  if (!db) return true; // If no DB, allow any name

  const filter: any = {
    displayName: { $regex: new RegExp(`^${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  };
  if (excludeUserId) filter.logtoUserId = { $ne: excludeUserId };

  const existing = await db.collection<UserProfile>('users').findOne(filter);
  return !existing;
}

/** Delete a user profile. */
export async function deleteUserProfile(logtoUserId: string): Promise<void> {
  const db = getSharedDb();
  if (!db) return;
  await db.collection('users').deleteOne({ logtoUserId });
}
