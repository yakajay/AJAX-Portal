import mongoose from 'mongoose';
import crypto from 'node:crypto';

let memory = null;
export let testCompany = null;

// Connects to MONGODB_TEST_URI when given (a throw-away database per test file), otherwise to an
// in-memory MongoDB. Each test file gets its own database so files can run in parallel.
// Also creates the default company ("acme" -> acme.localhost) that the fixtures' users belong to.
export const connectTestDb = async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memory = await MongoMemoryServer.create();
    uri = memory.getUri();
  }
  await mongoose.connect(uri, { dbName: `yakflow_test_${crypto.randomBytes(5).toString('hex')}` });
  // Build the indexes now (the per-company unique ones matter to several tests) rather than racing them
  await mongoose.syncIndexes();

  const { createCompany } = await import('../../src/services/company.service.js');
  testCompany = await createCompany({ name: 'Acme Corp', slug: 'acme', plan: 'enterprise', seatLimit: 1000 });
  testCompany.settings.allowSelfSignup = true;
  await testCompany.save();
};

export const disconnectTestDb = async () => {
  if (mongoose.connection.readyState === 1 && process.env.MONGODB_TEST_URI) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memory) await memory.stop();
};
