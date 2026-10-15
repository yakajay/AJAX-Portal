// Turns a module on for every existing company (new companies get all modules by default).
//   node scripts/enable-module.js recruitment
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Company } from '../src/models/company.model.js';
import { MODULES } from '../src/utils/permissions.js';

const module = process.argv[2];
if (!MODULES.includes(module)) {
  console.error(`Usage: node scripts/enable-module.js <${MODULES.join('|')}>`);
  process.exit(1);
}
try {
  await connectDB();
  const result = await Company.updateMany({ modules: { $ne: module } }, { $addToSet: { modules: module } });
  console.log(`Enabled "${module}" for ${result.modifiedCount} company(ies).`);
} finally {
  await disconnectDB();
}
