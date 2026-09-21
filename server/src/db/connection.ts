import mongoose from 'mongoose';

let isConnected = false;

/**
 * Connects to MongoDB using the configured or provided URI.
 */
export async function connectDb(uri?: string): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const mongoUri = uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/trao_dev';

  await mongoose.connect(mongoUri, {
    autoIndex: true,
  });

  isConnected = true;
  return mongoose;
}

/**
 * Disconnects from MongoDB cleanly.
 */
export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
}

/**
 * Clears all documents in all registered collections.
 * Used exclusively for test isolation.
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
