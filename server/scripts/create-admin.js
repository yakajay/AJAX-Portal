// Creates (or resets) a Super Admin account in the database MONGODB_URI points to.
//
//   ADMIN_PASSWORD='...' node scripts/create-admin.js <email> ["Full Name"]
//   docker compose run --rm -e ADMIN_PASSWORD='...' api node scripts/create-admin.js <email> ["Full Name"]
//
// The password is read from ADMIN_PASSWORD (never from a file in the repo). Running it again for the
// same email resets that account's password and re-enables it. The account is created already
// verified, so no emailed code is needed to verify it (sign-in itself still asks for the login code).
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/user.model.js';
import { hashPassword } from '../src/utils/password.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
const name = process.argv[3] || email.split('@')[0].replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const password = process.env.ADMIN_PASSWORD;

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 6) {
  console.error('Usage: ADMIN_PASSWORD=<at least 6 chars> node scripts/create-admin.js <email> ["Full Name"]');
  process.exit(1);
}

try {
  await connectDB();
  const existing = await User.findOne({ email });
  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: existing?.name ?? name,
        role: 'SUPER_ADMIN',
        permissions: 'read,write,delete',
        password: hashPassword(password),
        emailVerified: true,
        locked: false
      },
      $setOnInsert: { department: 'Management', email }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
  console.log(`${existing ? 'Updated' : 'Created'} Super Admin ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
