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

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('📦 Connected to MongoDB');

    // Create indexes for efficient queries
    await db.collection('games').createIndex({ 'players.userId': 1, endedAt: -1 });
    await db.collection('games').createIndex({ gameId: 1 }, { unique: true });

    return db;
  } catch (err) {
    console.error('❌ MongoDB connection failed — game stats will not be saved:', err);
    connectionFailed = true;
    client = null;
    db = null;
    return null;
  }
}

export function getDb(): Db | null {
  return db;
}
