// User records are kept apart per workspace instead of in one shared collection:
//   users.<company subdomain>   one collection per company (users.acme, users.globex, ...)
//   users.platform              the platform's own administrators (no company; "platform" is a reserved subdomain)
// The collection is chosen from the current request/script scope (see utils/tenantContext.js), so code that
// says `User.find()` can only ever reach the records of the workspace it is running for.
//
// This file is a leaf (no model imports) so schemas defined before user.model.js can point `ref` at it.
import { tenantStore } from '../utils/tenantContext.js';

export const PLATFORM_USERS = 'platform';
export const userCollectionName = (slug) => `users.${slug}`;

let factory = null;
export const setUserModelFactory = (fn) => {
  factory = fn;
};

export const currentUserSlug = () => {
  const store = tenantStore();
  if (store?.scope === 'tenant') return store.slug;
  if (store?.scope === 'platform') return PLATFORM_USERS;
  throw new Error('User records are stored per company: run this inside runAsTenant() or runAsPlatform().');
};

export const scopedUserModel = () => factory(currentUserSlug());

// For `ref:` on schema paths and virtuals - resolves to the model of the workspace being served
export const USER_REF = () => scopedUserModel();
