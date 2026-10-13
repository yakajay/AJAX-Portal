// Collapses duplicate attendance entries (several clock-ins on the same day) into one entry per person per day:
// the earliest clock-in to the latest clock-out. Pending/rejected corrections are never touched.
//
//   node scripts/merge-attendance.js --tz Asia/Kolkata            # dry run: shows what would change
//   node scripts/merge-attendance.js --tz Asia/Kolkata --apply    # does it
//   docker compose run --rm api node scripts/merge-attendance.js --tz Asia/Kolkata --apply
//
// --tz     the timezone that defines "a day" (default UTC). Use your office's timezone.
// --apply  write the changes. Without it nothing is modified.
// Back up the attendance collection first if the data matters: merged-away entries are deleted.
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Attendance } from '../src/models/attendance.model.js';
import { planMerges } from '../src/utils/attendanceMerge.js';
import { safeTimeZone } from '../src/utils/time.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const tzIndex = args.indexOf('--tz');
const timeZone = safeTimeZone(tzIndex >= 0 ? args[tzIndex + 1] : 'UTC');
if (tzIndex >= 0 && timeZone !== args[tzIndex + 1]) {
  console.error(`Unknown timezone "${args[tzIndex + 1]}". Use an IANA name such as Asia/Kolkata.`);
  process.exit(1);
}

try {
  await connectDB();
  const entries = await Attendance.find({ status: 'Present' });
  const plans = planMerges(entries, timeZone);

  const removed = plans.reduce((n, p) => n + p.removeIds.length, 0);
  console.log(`Timezone: ${timeZone}`);
  console.log(`${plans.length} day(s) have duplicate entries; ${removed} extra entr${removed === 1 ? 'y' : 'ies'} would be merged away.`);
  for (const p of plans.slice(0, 20)) {
    console.log(`  user ${p.userId}  ${p.day}  -> ${p.checkInAt.toISOString()} to ${p.checkOutAt ? p.checkOutAt.toISOString() : '(still open)'}  (merging ${p.removeIds.length + 1} entries)`);
  }
  if (plans.length > 20) console.log(`  ... and ${plans.length - 20} more`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to make these changes.');
  } else {
    for (const p of plans) {
      await Attendance.updateOne({ _id: p.keepId }, { checkInAt: p.checkInAt, checkOutAt: p.checkOutAt });
      await Attendance.deleteMany({ _id: { $in: p.removeIds } });
    }
    console.log(`\nDone: merged ${removed} entr${removed === 1 ? 'y' : 'ies'} across ${plans.length} day(s).`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
