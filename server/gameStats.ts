import { Db } from 'mongodb';
import { getDb } from './db';

export interface GamePlayerRecord {
  playerId: string;
  userId?: string;       // Logto sub — present only for logged-in players
  username: string;
  avatar: string;
  elo: number;
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
      players: { userId: 1, username: 1, score: 1, isAI: 1 },
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
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalGames: { $sum: 1 },
              wins: {
                $sum: {
                  $cond: [
                    { $eq: [
                      { $arrayElemAt: [
                        { $filter: { input: '$players', as: 'p', cond: { $eq: ['$$p.userId', userId] } } },
                        0
                      ] },
                      null
                    ] },
                    0,
                    {
                      $cond: [
                        { $eq: [
                          '$winnerId',
                          { $getField: {
                            field: 'playerId',
                            input: { $arrayElemAt: [
                              { $filter: { input: '$players', as: 'p', cond: { $eq: ['$$p.userId', userId] } } },
                              0
                            ] }
                          } }
                        ] },
                        1,
                        0
                      ]
                    }
                  ]
                }
              },
            },
          },
        ],
        bestScore: [
          { $unwind: '$players' },
          { $match: { 'players.userId': userId } },
          { $sort: { 'players.score': -1 } },
          { $limit: 1 },
          { $project: { score: '$players.score', gameId: 1, endedAt: 1 } },
        ],
        bestWord: [
          { $unwind: '$players' },
          { $match: { 'players.userId': userId, 'players.stats.bestWord': { $ne: null } } },
          { $sort: { 'players.stats.bestWord.score': -1 } },
          { $limit: 1 },
          { $project: { bestWord: '$players.stats.bestWord', gameId: 1, endedAt: 1 } },
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

  const totals = data.totals?.[0] || { totalGames: 0, wins: 0 };
  const losses = totals.totalGames - totals.wins;

  return {
    totalGames: totals.totalGames,
    wins: totals.wins,
    losses,
    winRate: totals.totalGames > 0 ? Math.round((totals.wins / totals.totalGames) * 100) : 0,
    bestScore: data.bestScore?.[0] || null,
    bestWord: data.bestWord?.[0]?.bestWord || null,
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
    { $unwind: '$players' },
    { $match: { 'players.userId': { $ne: userId } } },
    {
      $group: {
        _id: {
          // Group by opponent username (AI or named player)
          opponentName: '$players.username',
          isAI: '$players.isAI',
        },
        totalGames: { $sum: 1 },
        wins: {
          $sum: {
            $cond: [
              { $ne: ['$winnerId', '$players.playerId'] },
              1,
              0,
            ],
          },
        },
        losses: {
          $sum: {
            $cond: [
              { $eq: ['$winnerId', '$players.playerId'] },
              1,
              0,
            ],
          },
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
        lastPlayed: 1,
      },
    },
  ];

  return db.collection('games').aggregate(pipeline).toArray();
}
