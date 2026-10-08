import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async () => {
  if (!env.mongo.uri) {
    throw new Error('MONGODB_URI is not set. Copy server/.env.example to server/.env and fill in your MongoDB credentials.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongo.uri, env.mongo.dbName ? { dbName: env.mongo.dbName } : {});
  console.log(`MongoDB connected (db: ${mongoose.connection.name})`);
};

export const disconnectDB = () => mongoose.disconnect();
