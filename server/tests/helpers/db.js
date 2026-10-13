import mongoose from 'mongoose';
import crypto from 'node:crypto';

let memory = null;

// Connects to MONGODB_TEST_URI when given (a throw-away database per test file), otherwise to an
// in-memory MongoDB. Each test file gets its own database so files can run in parallel.
export const connectTestDb = async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `yakflow_test_${crypto.randomBytes(5).toString('hex')}` });
};

export const disconnectTestDb = async () => {
  if (mongoose.connection.readyState === 1 && process.env.MONGODB_TEST_URI) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memory) await memory.stop();
};
