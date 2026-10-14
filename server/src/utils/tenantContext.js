import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

// Who a piece of code is acting for. Every HTTP request runs inside one of these (set by
// middleware/tenant.js from the Host header), and the tenant plugin reads it to scope all queries:
//   tenant   - only documents of one company
//   platform - only platform-owned documents (companyId: null), e.g. the Super Admin's own account
//   all      - explicitly across companies (platform reporting); must be requested by name
// Outside a request (scripts, tests) there is no store and queries are not scoped.
const storage = new AsyncLocalStorage();

const toId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Mongoose queries only run when awaited, so `fn` is awaited *inside* the scope. Without that, a callback
// like `() => Model.find()` would hand back an unexecuted query that runs after the scope has ended.
const within = (store, fn) => storage.run(store, async () => await fn());

export const tenantStore = () => storage.getStore();
// The company's subdomain names its collection of user records (users.<slug>), so it travels with the scope.
// Looked up each time rather than cached: a platform admin can rename a subdomain from any server instance.
const slugOf = async (id) => {
  const company = await mongoose.model('Company').collection.findOne({ _id: id }, { projection: { slug: 1 } });
  if (!company) throw new Error('Unknown company.');
  return company.slug;
};

export const runAsTenant = async (companyId, fn) => {
  const id = toId(companyId);
  return within({ scope: 'tenant', companyId: id, slug: await slugOf(id) }, fn);
};
export const runAsPlatform = (fn) => within({ scope: 'platform', companyId: null }, fn);
export const runAcrossTenants = (fn) => within({ scope: 'all', companyId: null }, fn);
// Express hands control to the next middleware inside this callback, so the rest of the request keeps the store
export const enterScope = (store, next) => storage.run(store, next);

export const currentCompanyId = () => {
  const store = storage.getStore();
  return store?.scope === 'tenant' ? store.companyId : null;
};

// The filter the tenant plugin adds to queries, or null when the current scope is unrestricted
export const scopeFilter = () => {
  const store = storage.getStore();
  if (store?.scope === 'tenant') return { companyId: store.companyId };
  if (store?.scope === 'platform') return { companyId: null };
  return null;
};
