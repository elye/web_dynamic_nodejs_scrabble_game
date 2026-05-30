import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'scrabble';

let client: MongoClient | null = null;
let db: Db | null = null;
let connectionFailed = false;

export async function connectToMongo(): Promise<Db | null> {
  if (db) return db;
  if (connectionFailed || !MONGODB_URI) {
    if (!MONGODB_URI) {
      console.warn('⚠️  MONGODB_URI not set — game stats will not be saved');
    }
    return null;
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });
      await client.connect();
      db = client.db(DB_NAME);
      console.log('📦 Connected to MongoDB');

      // Create indexes for efficient queries
      await db.collection('games').createIndex({ 'players.userId': 1, endedAt: -1 });
      await db.collection('games').createIndex({ gameId: 1 }, { unique: true });
      await db.collection('users').createIndex({ logtoUserId: 1 }, { unique: true });
      await db.collection('users').createIndex(
        { displayName: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 } },
      );

      return db;
    } catch (err) {
      console.error(`❌ MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed:`, err);
      client = null;
      db = null;

      if (attempt < MAX_RETRIES) {
        console.log(`⏳ Retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  console.error('❌ MongoDB connection failed after all retries — game stats will not be saved');
  connectionFailed = true;
  return null;
}

export function getDb(): Db | null {
  return db;
}
