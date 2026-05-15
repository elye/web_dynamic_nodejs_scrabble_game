import { Db } from 'mongodb';
import { getDb } from './db';

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
  winnerId: string;
  winnerUsername: string;
  reason: string;
  timedOutPlayer?: string;
  gameSummary: any;
  scoreProgression: any;
  turnEvents: any;
  turnHistory: any;
  settings: any;
  gameTime?: string;    // e.g. "15 min", "Unlimited"
  timeoutMode?: string; // e.g. "sudden", "penalty", "N/A"
  isSolo: boolean;
  endedAt: Date;
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
      players: { userId: 1, playerId: 1, username: 1, score: 1, isAI: 1 },
      winnerId: 1,
      winnerUsername: 1,
      reason: 1,
      isSolo: 1,
      endedAt: 1,
      'gameSummary.totalTurns': 1,
      'gameSummary.totalWordsPlayed': 1,
      settings: 1,
    })
    .toArray();

  return { games, total, page, totalPages };
}

/**
 * Get detailed view of a specific game.
 */
export async function getGameDetail(gameId: string, userId: string): Promise<any | null> {
  const db = getDb();
  if (!db) return null;

  return db.collection('games').findOne({
    gameId,
    'players.userId': userId,
  });
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
              winnerId: 1,
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
    recentGames: data.recentGames || [],
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
