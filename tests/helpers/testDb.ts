import mongoose from 'mongoose';

let mongodInstance: any = null;

/**
 * Sets up an isolated test database.
 * Tries local running MongoDB first (instant startup), falls back to MongoMemoryServer
 * if no local instance is active.
 */
export async function setupTestDb(): Promise<string> {
  const poolId = process.env.VITEST_POOL_ID || `${process.pid}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultBase = 'mongodb://127.0.0.1:27017';
  let localTestUri = process.env.MONGODB_TEST_URI;

  if (!localTestUri) {
    localTestUri = `${defaultBase}/trao_test_${poolId}`;
  } else if (localTestUri.includes('trao_test')) {
    localTestUri = localTestUri.replace(/trao_test[^?\/]*/, `trao_test_${poolId}`);
  }

  try {
    if (mongoose.connection.readyState === 1) {
      return localTestUri;
    }

    // Try local Mongo with short 1.5s timeout
    await mongoose.connect(localTestUri, { serverSelectionTimeoutMS: 1500 });
    return localTestUri;
  } catch {
    // Fall back to mongodb-memory-server
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodInstance = await MongoMemoryServer.create();
      const memUri = mongodInstance.getUri();
      await mongoose.connect(memUri);
      return memUri;
    } catch (err: any) {
      throw new Error(`Failed to initialize test database: ${err.message}`);
    }
  }
}

/**
 * Clears all collections between test cases for total isolation.
 */
export async function clearTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    const collection = collections[key];
    if (collection) {
      await collection.deleteMany({});
    }
  }
}

/**
 * Tears down and closes the test database connection cleanly.
 */
export async function teardownTestDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    // Drop test database so nothing persists
    try {
      if (mongoose.connection.db) {
        await mongoose.connection.db.dropDatabase();
      }
    } catch {
      // Ignore drop errors during teardown
    }
    await mongoose.disconnect();
  }

  if (mongodInstance) {
    await mongodInstance.stop();
    mongodInstance = null;
  }
}
