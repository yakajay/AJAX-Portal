// One-off move of user records from the shared `users` collection into per-company collections
// (users.acme, users.globex, ... and users.platform for platform administrators):
//
//   node scripts/segregate-users.js
//
// Safe to run again. The old collection is renamed to `users_legacy`, not deleted. Back up first.
import { connectDB, disconnectDB } from '../src/config/db.js';
import { segregateUsers } from '../src/utils/segregateUsers.js';
import '../src/models/index.js';

try {
  await connectDB();
  await segregateUsers(console.log);
  console.log('Done.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
