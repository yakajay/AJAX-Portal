// Usage: npm run digest | npm run jobs   (one-off runs of the scheduled jobs, e.g. from cron)
import { connectDB, disconnectDB } from '../src/config/db.js';
import { sendDigests, contractAlerts } from '../src/jobs.js';

const task = process.argv[2] || 'all';
try {
  await connectDB();
  if (task === 'digest' || task === 'all') console.log(`digests sent: ${await sendDigests()}`);
  if (task === 'contracts' || task === 'all') console.log(`contract alerts created: ${await contractAlerts()}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
