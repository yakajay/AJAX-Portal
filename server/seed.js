import { connectDB, disconnectDB } from './src/config/db.js';
import { User } from './src/models/user.model.js';
import { Holiday } from './src/models/holiday.model.js';
import { hashPassword } from './src/utils/password.js';

// Development seed accounts. Change these passwords before using the data anywhere real.
const users = [
  { email: 'admin@organization.com', name: 'Super Admin', role: 'SUPER_ADMIN', department: 'Management', permissions: 'read,write,delete', password: 'Admin@123' },
  { email: 'jane@organization.com', name: 'Jane Smith', role: 'USER', department: 'Engineering', permissions: 'read', password: 'Welcome@123' },
  { email: 'john@organization.com', name: 'John Doe', role: 'USER', department: 'Sales', permissions: 'read', password: 'Welcome@123' }
];

const holidays = [
  { date: 'Jan 1, 2026', name: "New Year's Day" },
  { date: 'Jan 26, 2026', name: 'Republic Day' },
  { date: 'Aug 15, 2026', name: 'Independence Day' },
  { date: 'Oct 2, 2026', name: 'Gandhi Jayanti' },
  { date: 'Dec 25, 2026', name: 'Christmas' }
];

async function main() {
  await connectDB();
  console.log('Seeding database...');

  for (const { password, ...profile } of users) {
    await User.findOneAndUpdate(
      { email: profile.email },
      { $set: { ...profile, password: hashPassword(password), emailVerified: true } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  for (const holiday of holidays) {
    await Holiday.updateOne(holiday, { $setOnInsert: holiday }, { upsert: true });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
