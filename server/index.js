import app from './src/app.js';
import { env } from './src/config/env.js';
import { connectDB } from './src/config/db.js';
import { logger } from './src/utils/logger.js';
import { startJobs } from './src/jobs.js';
import { version, commit, revision } from './src/utils/version.js';

try {
  await connectDB();
} catch (error) {
  logger.fatal({ err: error }, `Failed to connect to MongoDB: ${error.message}`);
  process.exit(1);
}

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, version, commit, revision }, `YakFlow API v${version} (${commit.slice(0, 7)}) listening`);
});
const stopJobs = startJobs();

// Finish in-flight requests before exiting (Docker sends SIGTERM)
const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
