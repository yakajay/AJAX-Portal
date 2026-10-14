import { Company } from '../models/company.model.js';
import { primeCompanyKey } from './crypto.js';
import { runAsTenant, runAcrossTenants } from './tenantContext.js';

// Loads a company's data key into memory (needed before reading or writing its encrypted fields
// outside an HTTP request, e.g. in jobs and scripts)
export const loadCompanyKey = async (companyId) => {
  const company = await Company.findById(companyId).select('+dataKey');
  if (company) primeCompanyKey(company.id, company.dataKey);
  return company;
};

// Runs `fn(company)` once per active company, each inside that company's scope
export const forEachActiveCompany = async (fn) => {
  const companies = await runAcrossTenants(() => Company.find({ status: 'active' }).select('+dataKey'));
  const results = [];
  for (const company of companies) {
    primeCompanyKey(company.id, company.dataKey);
    results.push(await runAsTenant(company._id, () => fn(company)));
  }
  return results;
};
