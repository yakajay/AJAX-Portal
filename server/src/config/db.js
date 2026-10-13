import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const connectDB = async () => {
  if (!env.mongo.uri) {
    throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env and fill in your MongoDB credentials.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongo.uri, env.mongo.dbName ? { dbName: env.mongo.dbName } : {});
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
};

export const disconnectDB = () => mongoose.disconnect();
