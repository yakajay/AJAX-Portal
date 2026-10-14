import mongoose from 'mongoose';
import { scopeFilter, currentCompanyId, tenantStore } from '../utils/tenantContext.js';

// Isolates companies from each other at the data layer. Registered globally (see schemaOptions.js), so
// every model gets a `companyId` and every query/aggregate/insert is confined to the current tenant -
// a controller that forgets to filter still cannot read or write another company's data.
// Opt a model out with `schema.tenantExempt = true` (only the Company collection itself does).
const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'countDocuments', 'distinct'
];

export const tenantPlugin = (schema) => {
  if (schema.tenantExempt) return;

  schema.add({ companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null, index: true } });

  schema.pre(QUERY_OPS, { document: false, query: true }, function applyTenantFilter() {
    const filter = scopeFilter();
    if (filter) this.setQuery({ ...this.getFilter(), ...filter });
  });

  schema.pre('aggregate', function applyTenantMatch() {
    const filter = scopeFilter();
    if (filter) this.pipeline().unshift({ $match: filter });
  });

  // New documents belong to the tenant that creates them; a different explicit companyId is refused
  schema.pre('validate', function stampTenant() {
    if (!this.isNew) return;
    const store = tenantStore();
    if (store?.scope !== 'tenant') return;
    if (this.companyId && String(this.companyId) !== String(store.companyId)) {
      throw new Error('Cross-tenant write refused.');
    }
    this.companyId = store.companyId;
  });

  schema.pre('insertMany', function stampTenantOnInsertMany(docs) {
    const id = currentCompanyId();
    if (!id || !Array.isArray(docs)) return;
    for (const doc of docs) {
      if (doc.companyId && String(doc.companyId) !== String(id)) throw new Error('Cross-tenant write refused.');
      doc.companyId = id;
    }
  });
};
