import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', false);

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  const cache = globalThis.__vayuronMongoose || (globalThis.__vayuronMongoose = { promise: null });
  if (!cache.promise) {
    cache.promise = mongoose.connect(env.mongoUri, {
      dbName: env.mongoDbName,
      authSource: 'admin',
      serverSelectionTimeoutMS: 15000
    }).catch((error) => {
      cache.promise = null;
      throw error;
    });
  }

  await cache.promise;
  console.log(`MongoDB connected: ${env.mongoDbName}`);
  return mongoose.connection;
}
