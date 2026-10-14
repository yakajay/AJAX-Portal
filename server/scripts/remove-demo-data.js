// Removes the sample data the old seed script created: the "demo" company with everything in it (its
// users, employees, payroll, leave, audit log...) and the sample platform Super Admin.
//
//   node scripts/remove-demo-data.js            # dry run: shows what would be deleted
//   node scripts/remove-demo-data.js --apply    # deletes it
//   docker compose run --rm api node scripts/remove-demo-data.js --apply
//
// Only the company with subdomain DEMO_SLUG (default "demo") and the account PLATFORM_EMAIL (default
// platform@yakflow.local) are touched; other companies and accounts are left alone. This is permanent:
// back up first if the "demo" company holds anything you want to keep. Create your own platform Super Admin
// BEFORE running it with --apply, or you will be unable to sign in to the console:
//   ADMIN_PASSWORD='...' node scripts/create-admin.js you@example.com "Your Name"
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Company } from '../src/models/company.model.js';
import { User } from '../src/models/user.model.js';
import { runAsPlatform } from '../src/utils/tenantContext.js';
import '../src/models/index.js';

const apply = process.argv.includes('--apply');
const slug = (process.env.DEMO_SLUG || 'demo').toLowerCase();
const platformEmail = (process.env.PLATFORM_EMAIL || 'platform@yakflow.local').toLowerCase();

try {
  await connectDB();
  const company = await Company.findOne({ slug });
  const platformUser = await runAsPlatform(() => User.findOne({ email: platformEmail, role: 'PLATFORM_ADMIN' }));
  const otherPlatformAdmins = await runAsPlatform(() => User.countDocuments({ role: 'PLATFORM_ADMIN', email: { $ne: platformEmail } }));

  if (!company && !platformUser) {
    console.log('Nothing to remove: no demo company and no sample platform account found.');
  } else {
    console.log(apply ? 'Deleting:' : 'Dry run - would delete:');
    if (company) {
      for (const model of Object.values(mongoose.models)) {
        if (model.schema.tenantExempt) continue;
        const count = await model.collection.countDocuments({ companyId: company._id });
        if (count) {
          console.log(`  ${model.collection.collectionName}: ${count}`);
          if (apply) await model.collection.deleteMany({ companyId: company._id });
        }
      }
      console.log(`  company "${company.name}" (${company.slug})`);
      if (apply) await Company.deleteOne({ _id: company._id });
    }
    if (platformUser) {
      console.log(`  platform account ${platformEmail}`);
      if (apply) {
        await mongoose.connection.collection('sessions').deleteMany({ userId: platformUser._id });
        await mongoose.connection.collection('otps').deleteMany({ email: platformEmail });
        await mongoose.connection.collection('users').deleteOne({ _id: platformUser._id });
      }
      if (!otherPlatformAdmins) console.log('  WARNING: no other platform Super Admin exists. Create one with scripts/create-admin.js.');
    }
    if (!apply) console.log('Re-run with --apply to delete.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
