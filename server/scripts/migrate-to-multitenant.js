// One-off upgrade of a single-company database to the multi-tenant layout.
//
//   COMPANY_NAME="Acme Corp" COMPANY_SLUG=acme node scripts/migrate-to-multitenant.js
//
// - creates the company that owns all existing data (or reuses the one with that subdomain)
// - stamps every existing document with that company
// - replaces the old global unique indexes (email, department name, invoice number) with per-company ones
// - seals existing salary and payslip figures with the company's key
// Safe to run again: documents that already belong to a company are left alone.
// Back up the database first. Users with the SUPER_ADMIN role become that company's admins; create the
// platform's own Super Admin afterwards with scripts/create-admin.js (without COMPANY_SLUG).
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Company } from '../src/models/company.model.js';
import { createCompany } from '../src/services/company.service.js';
import { loadCompanyKey } from '../src/utils/tenants.js';
import { runAsTenant } from '../src/utils/tenantContext.js';
import { SalaryStructure, Payslip } from '../src/models/salary.model.js';
import '../src/models/index.js';

const name = process.env.COMPANY_NAME;
const slug = String(process.env.COMPANY_SLUG || '').trim().toLowerCase();
if (!name || !slug) {
  console.error('Usage: COMPANY_NAME="Acme Corp" COMPANY_SLUG=acme node scripts/migrate-to-multitenant.js');
  process.exit(1);
}

// Old unique indexes that must now be per company
const OLD_INDEXES = { users: 'email_1', departments: 'name_1', invoices: 'number_1' };
const SEALED = {
  salarystructures: { model: SalaryStructure, paths: ['basic', 'hra', 'allowances', 'pfPercent', 'taxPercent', 'otherDeductions'] },
  payslips: { model: Payslip, paths: ['earnings.basic', 'earnings.hra', 'earnings.allowances', 'deductions.pf', 'deductions.tax', 'deductions.other', 'gross', 'totalDeductions', 'net'] }
};

try {
  await connectDB();

  let company = await Company.findOne({ slug });
  if (company) await loadCompanyKey(company.id);
  else company = await createCompany({ name, slug, plan: 'enterprise', seatLimit: 100000 });
  console.log(`Company: ${company.name} (${company.slug})`);

  const collections = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const model of Object.values(mongoose.models)) {
    if (model.schema.tenantExempt) continue;
    const coll = model.collection.collectionName;
    if (!collections.includes(coll)) continue;
    const result = await model.collection.updateMany({ companyId: { $exists: false } }, { $set: { companyId: company._id } });
    console.log(`  ${coll}: ${result.modifiedCount} document(s) assigned`);
  }

  for (const [coll, index] of Object.entries(OLD_INDEXES)) {
    try {
      await mongoose.connection.collection(coll).dropIndex(index);
      console.log(`  dropped ${coll}.${index}`);
    } catch {
      /* already gone */
    }
  }
  await mongoose.syncIndexes();

  // Sealing goes through the models' setters, inside the company's scope
  await runAsTenant(company._id, async () => {
    for (const { model, paths } of Object.values(SEALED)) {
      let sealed = 0;
      for await (const doc of model.find()) {
        let touched = false;
        for (const path of paths) {
          const raw = doc.get(path, null, { getters: false });
          if (raw !== undefined && raw !== null && !String(raw).startsWith('enc:v1:')) {
            doc.set(path, doc.get(path));
            touched = true;
          }
        }
        if (touched) {
          await doc.save();
          sealed++;
        }
      }
      console.log(`  ${model.collection.collectionName}: ${sealed} document(s) sealed`);
    }
  });
  console.log('Done.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
