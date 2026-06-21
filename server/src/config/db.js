import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', false);

  await mongoose.connect(env.mongoUri, {
    dbName: env.mongoDbName,
    authSource: 'admin',
    serverSelectionTimeoutMS: 15000
  });

  console.log(`MongoDB connected: ${env.mongoDbName}`);
}
