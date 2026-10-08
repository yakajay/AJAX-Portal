import { connectDB, disconnectDB } from './src/config/db.js';
import { User } from './src/models/user.model.js';
import { Holiday } from './src/models/holiday.model.js';
import { LeaveRequest } from './src/models/leave.model.js';
import { HRDocument } from './src/models/document.model.js';
import { Attendance } from './src/models/attendance.model.js';
import { Contractor } from './src/models/contractor.model.js';
import { Transaction } from './src/models/transaction.model.js';
import { hashPassword } from './src/utils/password.js';

// Development/test accounts only. Re-running the seed resets these passwords.
// Change them (or don't seed) before using the data anywhere real.
const ADMIN_PASSWORD = 'Admin@123';
const USER_PASSWORD = 'Welcome@123';

const users = [
  { email: 'admin@organization.com', name: 'Super Admin', role: 'SUPER_ADMIN', department: 'Management', permissions: 'read,write,delete', password: ADMIN_PASSWORD },
  { email: 'hr.admin@organization.com', name: 'Priya Sharma', role: 'ADMIN', department: 'Human Resources', permissions: 'read,write', password: ADMIN_PASSWORD, manager: 'admin@organization.com' },
  { email: 'readonly.admin@organization.com', name: 'Rahul Verma', role: 'ADMIN', department: 'Finance', permissions: 'read', password: ADMIN_PASSWORD, manager: 'admin@organization.com' },
  { email: 'jane@organization.com', name: 'Jane Smith', role: 'USER', department: 'Engineering', permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'john@organization.com', name: 'John Doe', role: 'USER', department: 'Sales', permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'alice@organization.com', name: 'Alice Johnson', role: 'USER', department: 'Engineering', permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'bob@organization.com', name: 'Bob Williams', role: 'USER', department: 'Finance', permissions: 'read', password: USER_PASSWORD, manager: 'readonly.admin@organization.com' },
  // Edge cases for testing the auth flows
  { email: 'locked@organization.com', name: 'Locked Account', role: 'USER', department: 'Sales', permissions: 'read', password: USER_PASSWORD, locked: true },
  { email: 'unverified@organization.com', name: 'Unverified Account', role: 'USER', department: 'Sales', permissions: 'read', password: USER_PASSWORD, emailVerified: false }
];

const holidays = [
  { date: 'Jan 1, 2026', name: "New Year's Day" },
  { date: 'Jan 26, 2026', name: 'Republic Day' },
  { date: 'Aug 15, 2026', name: 'Independence Day' },
  { date: 'Oct 2, 2026', name: 'Gandhi Jayanti' },
  { date: 'Dec 25, 2026', name: 'Christmas' }
];

const contractors = [
  { name: 'Marcus Chen', role: 'Backend Developer', company: 'Digital Solutions Inc.', status: 'Active', country: 'Singapore', rating: 4.8 },
  { name: 'Sofia Rossi', role: 'UI/UX Designer', company: 'Creative Labs', status: 'Active', country: 'Italy', rating: 4.5 },
  { name: 'Omar Haddad', role: 'DevOps Engineer', company: 'CloudWorks', status: 'On Bench', country: 'UAE', rating: 4.2 },
  { name: 'Lena Fischer', role: 'QA Engineer', company: 'TechSquad', status: 'Pending', country: 'Germany', rating: 0 }
];

const transactions = [
  { recipient: 'Digital Solutions Inc.', date: 'Sep 30, 2026', amount: '$12,500.00', status: 'Success', method: 'Bank Transfer' },
  { recipient: 'Creative Labs', date: 'Sep 30, 2026', amount: '$8,200.00', status: 'Success', method: 'Bank Transfer' },
  { recipient: 'CloudWorks', date: 'Oct 1, 2026', amount: '$5,750.00', status: 'Processing', method: 'Wire' }
];

// Only insert sample records into empty collections so re-running never duplicates them
const seedIfEmpty = async (Model, label, docs) => {
  if ((await Model.countDocuments()) > 0) return console.log(`  ${label}: already has data, skipped`);
  await Model.insertMany(docs);
  console.log(`  ${label}: added ${docs.length}`);
};

async function main() {
  await connectDB();
  console.log('Seeding database...');

  for (const { password, manager, ...profile } of users) {
    await User.findOneAndUpdate(
      { email: profile.email },
      { $set: { emailVerified: true, locked: false, ...profile, password: hashPassword(password) } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  const byEmail = Object.fromEntries((await User.find()).map((u) => [u.email, u]));
  for (const { email, manager } of users) {
    if (manager) await User.updateOne({ email }, { managerId: byEmail[manager].id });
  }
  console.log(`  users: ${users.length} accounts ready`);

  for (const holiday of holidays) {
    await Holiday.updateOne(holiday, { $setOnInsert: holiday }, { upsert: true });
  }

  const id = (email) => byEmail[email].id;
  await seedIfEmpty(LeaveRequest, 'leave requests', [
    { userId: id('jane@organization.com'), type: 'Annual Leave', startDate: '2026-11-10', endDate: '2026-11-12', days: 3, status: 'Pending', reason: 'Family trip' },
    { userId: id('jane@organization.com'), type: 'Sick Leave', startDate: '2026-09-15', endDate: '2026-09-16', days: 2, status: 'Approved', reason: 'Fever' },
    { userId: id('john@organization.com'), type: 'Casual Leave', startDate: '2026-11-20', endDate: '2026-11-20', days: 1, status: 'Pending', reason: 'Personal work' },
    { userId: id('alice@organization.com'), type: 'Annual Leave', startDate: '2026-08-03', endDate: '2026-08-07', days: 5, status: 'Rejected', reason: 'Vacation' }
  ]);
  await seedIfEmpty(HRDocument, 'documents', [
    { userId: id('jane@organization.com'), name: 'Offer Letter', type: 'Letter', date: 'Jan 5, 2026' },
    { userId: id('jane@organization.com'), name: 'Payslip - September 2026', type: 'Payslip', date: 'Sep 30, 2026' },
    { userId: id('john@organization.com'), name: 'Form 16 - FY 2025-26', type: 'Tax', date: 'Jun 15, 2026' }
  ]);
  await seedIfEmpty(Attendance, 'attendance', [
    { userId: id('jane@organization.com'), checkInAt: new Date('2026-10-05T09:02:00+05:30'), checkOutAt: new Date('2026-10-05T18:10:00+05:30'), status: 'Present' },
    { userId: id('jane@organization.com'), checkInAt: new Date('2026-10-06T09:15:00+05:30'), checkOutAt: new Date('2026-10-06T18:00:00+05:30'), status: 'Present' },
    { userId: id('john@organization.com'), checkInAt: new Date('2026-10-05T10:01:00+05:30'), checkOutAt: new Date('2026-10-05T19:05:00+05:30'), status: 'Present' }
  ]);
  await seedIfEmpty(Contractor, 'contractors', contractors);
  await seedIfEmpty(Transaction, 'transactions', transactions);

  console.log('Seed completed successfully!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
