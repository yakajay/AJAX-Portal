// Moves user records out of the old shared `users` collection into one collection per workspace:
//   users  ->  users.<company subdomain>   (e.g. users.acme)
//              users.platform              (platform administrators, who belong to no company)
// Idempotent: records already present in their destination are skipped. The old collection is renamed to
// `users_legacy` (never deleted) once every record is accounted for.
import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { ensureAllUserCollections } from '../models/user.model.js';
import { userCollectionName, PLATFORM_USERS } from '../models/userScope.js';

export const segregateUsers = async (log = () => {}) => {
  const db = mongoose.connection.db;
  await ensureAllUserCollections();
  if (!(await db.listCollections({ name: 'users' }).toArray()).length) {
    log('No shared `users` collection found - nothing to move.');
    return { moved: 0, orphaned: 0 };
  }

  const old = db.collection('users');
  const slugById = new Map((await Company.find().select('slug')).map((c) => [String(c._id), c.slug]));
  const batches = new Map();
  let orphaned = 0;
  for await (const doc of old.find()) {
    const slug = doc.companyId ? slugById.get(String(doc.companyId)) : PLATFORM_USERS;
    if (!slug) {
      orphaned++;
      log(`  skipped ${doc.email}: company ${doc.companyId} no longer exists`);
      continue;
    }
    if (!batches.has(slug)) batches.set(slug, []);
    batches.get(slug).push(doc);
  }

  let moved = 0;
  for (const [slug, docs] of batches) {
    const target = db.collection(userCollectionName(slug));
    const result = await target.bulkWrite(docs.map((doc) => ({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } })));
    log(`  ${userCollectionName(slug)}: ${result.upsertedCount} copied, ${await target.countDocuments()} in total`);
    moved += docs.length;
  }

  if (moved + orphaned !== (await old.countDocuments())) throw new Error('User records were missed - leaving `users` untouched.');
  if (orphaned) log(`${orphaned} record(s) belong to a deleted company and were not copied; \`users\` is left in place.`);
  else {
    await old.rename('users_legacy', { dropTarget: true });
    log('Renamed `users` to `users_legacy`. Drop it once you have checked the new collections.');
  }
  return { moved, orphaned };
};
