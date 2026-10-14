// Creates (or resets) an administrator account in the database MONGODB_URI points to.
//
//   Platform Super Admin (manages companies, lives outside every company):
//     ADMIN_PASSWORD='...' node scripts/create-admin.js <email> ["Full Name"]
//   Company admin (the top admin inside one company's workspace):
//     COMPANY_SLUG=acme ADMIN_PASSWORD='...' node scripts/create-admin.js <email> ["Full Name"]
//
//   docker compose run --rm -e ADMIN_PASSWORD='...' api node scripts/create-admin.js <email> ["Full Name"]
//
// The password is read from ADMIN_PASSWORD (never from a file in the repo). Running it again for the
// same email resets that account's password and re-enables it. The account is created already
// verified, so no emailed code is needed to verify it (sign-in itself still asks for the login code).
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/user.model.js';
import { Company } from '../src/models/company.model.js';
import { hashPassword } from '../src/utils/password.js';
import { runAsPlatform, runAsTenant } from '../src/utils/tenantContext.js';
import { loadCompanyKey } from '../src/utils/tenants.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
const name = process.argv[3] || email.split('@')[0].replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const password = process.env.ADMIN_PASSWORD;
const slug = String(process.env.COMPANY_SLUG || '').trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 6) {
  console.error('Usage: [COMPANY_SLUG=<company>] ADMIN_PASSWORD=<at least 6 chars> node scripts/create-admin.js <email> ["Full Name"]');
  process.exit(1);
}

try {
  await connectDB();

  let run = runAsPlatform;
  let role = 'PLATFORM_ADMIN';
  let label = 'platform Super Admin';
  if (slug) {
    const company = await Company.findOne({ slug });
    if (!company) throw new Error(`No company with the subdomain "${slug}".`);
    await loadCompanyKey(company.id);
    run = (fn) => runAsTenant(company._id, fn);
    role = 'SUPER_ADMIN';
    label = `company admin of ${company.name}`;
  }

  const existing = await run(() => User.findOne({ email }));
  await run(() =>
    User.findOneAndUpdate(
      { email },
      {
        $set: {
          name: existing?.name ?? name,
          role,
          permissions: 'read,write,delete',
          password: hashPassword(password),
          emailVerified: true,
          locked: false
        },
        $setOnInsert: { department: slug ? 'Management' : 'Platform', email }
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
  );
  console.log(`${existing ? 'Updated' : 'Created'} ${label} ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
