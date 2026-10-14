import { connectDB, disconnectDB } from './src/config/db.js';
import { User } from './src/models/user.model.js';
import { Holiday } from './src/models/holiday.model.js';
import { LeaveRequest } from './src/models/leave.model.js';
import { HRDocument } from './src/models/document.model.js';
import { Attendance } from './src/models/attendance.model.js';
import { Contractor } from './src/models/contractor.model.js';
import { Transaction } from './src/models/transaction.model.js';
import { SupportTicket } from './src/models/ticket.model.js';
import { Department } from './src/models/department.model.js';
import { Announcement } from './src/models/announcement.model.js';
import { SalaryStructure, Payslip } from './src/models/salary.model.js';
import { ReviewCycle, Review, Goal } from './src/models/performance.model.js';
import { Expense } from './src/models/expense.model.js';
import { ChecklistTemplate } from './src/models/checklist.model.js';
import { Timesheet, Invoice } from './src/models/timesheet.model.js';
import { Company } from './src/models/company.model.js';
import { createCompany } from './src/services/company.service.js';
import { loadCompanyKey } from './src/utils/tenants.js';
import { runAsTenant, runAsPlatform } from './src/utils/tenantContext.js';
import { hashPassword } from './src/utils/password.js';
import { computePayslip } from './src/utils/payroll.js';
import { workingDays, monthBounds } from './src/utils/dates.js';

// Development/test accounts only. Re-running the seed resets these passwords.
// Change them (or don't seed) before using the data anywhere real.
const ADMIN_PASSWORD = 'Admin@123';
const USER_PASSWORD = 'Welcome@123';
const PLATFORM_EMAIL = 'platform@yakflow.local';
const PLATFORM_PASSWORD = 'Platform@123';
// The sample company lives at <slug>.<BASE_DOMAIN> (e.g. demo.localhost); the sample users below belong to it
const COMPANY_SLUG = (process.env.SEED_COMPANY_SLUG || 'demo').toLowerCase();

// Birthdays / anniversaries are set relative to today so the dashboard feed always has something to show
const inDays = (n, year) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${year ?? d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const users = [
  { email: 'admin@organization.com', name: 'Super Admin', role: 'SUPER_ADMIN', department: 'Management', designation: 'Chief Executive Officer', joinDate: '2019-04-01', dateOfBirth: '1980-06-15', permissions: 'read,write,delete', password: ADMIN_PASSWORD },
  { email: 'hr.admin@organization.com', name: 'Priya Sharma', role: 'ADMIN', department: 'Human Resources', designation: 'HR Manager', joinDate: '2021-02-15', dateOfBirth: '1988-03-22', permissions: 'read,write', password: ADMIN_PASSWORD, manager: 'admin@organization.com' },
  // Read-only everywhere, but may change expenses: shows off per-module permissions
  { email: 'readonly.admin@organization.com', name: 'Rahul Verma', role: 'ADMIN', department: 'Finance', designation: 'Finance Analyst', joinDate: '2022-07-01', dateOfBirth: '1990-11-09', permissions: 'read,expenses:write', password: ADMIN_PASSWORD, manager: 'admin@organization.com' },
  { email: 'jane@organization.com', name: 'Jane Smith', role: 'USER', department: 'Engineering', designation: 'Senior Engineer', joinDate: inDays(5, 2023), dateOfBirth: inDays(3, 1994), permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'john@organization.com', name: 'John Doe', role: 'USER', department: 'Sales', designation: 'Account Executive', joinDate: '2024-01-08', dateOfBirth: '1992-09-30', permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'alice@organization.com', name: 'Alice Johnson', role: 'USER', department: 'Engineering', designation: 'Software Engineer', joinDate: '2024-05-20', dateOfBirth: '1996-01-12', permissions: 'read', password: USER_PASSWORD, manager: 'hr.admin@organization.com' },
  { email: 'bob@organization.com', name: 'Bob Williams', role: 'USER', department: 'Finance', designation: 'Accountant', joinDate: '2023-10-02', dateOfBirth: '1993-07-04', permissions: 'read', password: USER_PASSWORD, manager: 'readonly.admin@organization.com' },
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
  { name: 'Marcus Chen', role: 'Backend Developer', company: 'Digital Solutions Inc.', status: 'Active', country: 'Singapore', rating: 4.8, email: 'marcus@digitalsolutions.example', contractStart: '2026-01-05', contractEnd: inDays(18), hourlyRate: 3500 },
  { name: 'Sofia Rossi', role: 'UI/UX Designer', company: 'Creative Labs', status: 'Active', country: 'Italy', rating: 4.5, email: 'sofia@creativelabs.example', contractStart: '2026-03-01', contractEnd: '2027-02-28', hourlyRate: 3000 },
  { name: 'Omar Haddad', role: 'DevOps Engineer', company: 'CloudWorks', status: 'On Bench', country: 'UAE', rating: 4.2, email: 'omar@cloudworks.example', contractStart: '2025-10-01', contractEnd: inDays(-6), hourlyRate: 3800 },
  { name: 'Lena Fischer', role: 'QA Engineer', company: 'TechSquad', status: 'Pending', country: 'Germany', rating: 0, email: 'lena@techsquad.example', contractStart: inDays(10), contractEnd: inDays(200), hourlyRate: 2600 }
];

const transactions = [
  { recipient: 'Digital Solutions Inc.', date: 'Sep 30, 2026', amount: '₹10,00,000.00', status: 'Success', method: 'Bank Transfer' },
  { recipient: 'Creative Labs', date: 'Sep 30, 2026', amount: '₹6,56,000.00', status: 'Success', method: 'Bank Transfer' },
  { recipient: 'CloudWorks', date: 'Oct 1, 2026', amount: '₹4,60,000.00', status: 'Processing', method: 'Wire' }
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

  let company = await Company.findOne({ slug: COMPANY_SLUG });
  if (company) await loadCompanyKey(company.id);
  else company = await createCompany({ name: 'Demo Company', slug: COMPANY_SLUG, plan: 'enterprise', seatLimit: 500, primaryContact: { name: 'Super Admin', email: 'admin@organization.com' } });
  company.settings.allowSelfSignup = true; // lets you try the signup screen locally
  await company.save();
  console.log(`  company: ${company.name} (${company.slug})`);

  // The platform's own Super Admin lives outside every company
  await runAsPlatform(() =>
    User.findOneAndUpdate(
      { email: PLATFORM_EMAIL },
      { $set: { name: 'Platform Super Admin', role: 'PLATFORM_ADMIN', permissions: 'read,write,delete', department: 'Platform', emailVerified: true, locked: false, password: hashPassword(PLATFORM_PASSWORD) } },
      { upsert: true, setDefaultsOnInsert: true }
    )
  );
  console.log(`  platform admin: ${PLATFORM_EMAIL}`);

  await runAsTenant(company._id, seedCompany);
  console.log('Seed completed successfully!');
}

async function seedCompany() {

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

  const admin = id('admin@organization.com');
  const hr = id('hr.admin@organization.com');

  // Departments (heads are looked up by email)
  for (const [name, description, head] of [
    ['Management', 'Executive leadership', 'admin@organization.com'],
    ['Human Resources', 'People operations, hiring and payroll', 'hr.admin@organization.com'],
    ['Engineering', 'Product development', null],
    ['Sales', 'Revenue and customer success', null],
    ['Finance', 'Accounting and budgets', 'readonly.admin@organization.com']
  ]) {
    await Department.updateOne({ name }, { $setOnInsert: { name, description, headId: head ? id(head) : null } }, { upsert: true });
  }

  // Salary structures + last month's payslips
  const salaries = {
    'hr.admin@organization.com': { basic: 75000, hra: 30000, allowances: 10000 },
    'readonly.admin@organization.com': { basic: 65000, hra: 26000, allowances: 8000 },
    'jane@organization.com': { basic: 90000, hra: 36000, allowances: 12000 },
    'john@organization.com': { basic: 55000, hra: 22000, allowances: 6000 },
    'alice@organization.com': { basic: 70000, hra: 28000, allowances: 8000 },
    'bob@organization.com': { basic: 50000, hra: 20000, allowances: 5000 }
  };
  const prev = new Date();
  prev.setUTCDate(1);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevMonth = prev.toISOString().slice(0, 7);
  const { start, end } = monthBounds(prevMonth);
  for (const [email, amounts] of Object.entries(salaries)) {
    const structure = await SalaryStructure.findOneAndUpdate(
      { userId: id(email) }, { $setOnInsert: { userId: id(email), ...amounts } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    const slip = computePayslip(structure, { workingDays: workingDays(start, end) });
    await Payslip.updateOne(
      { userId: id(email), month: prevMonth },
      { $setOnInsert: { userId: id(email), month: prevMonth, currency: structure.currency, status: 'Paid', paidAt: new Date(), generatedById: hr, ...slip } },
      { upsert: true }
    );
  }
  console.log(`  salary structures & ${prevMonth} payslips: ready`);

  await seedIfEmpty(Announcement, 'announcements', [
    { title: 'Welcome to the new portal', body: 'Leave balances, payslips, expenses and performance reviews now live here. Press Ctrl+K to jump anywhere.', pinned: true, authorId: admin },
    { title: 'Year-end holiday schedule', body: 'The office is closed on 25 December. Please plan your leave early.', authorId: hr }
  ]);

  await seedIfEmpty(ChecklistTemplate, 'checklist templates', [
    { name: 'New hire onboarding', kind: 'ONBOARDING', tasks: [
      { title: 'Read and sign the Code of Conduct', description: 'Available in HR Hub.', owner: 'EMPLOYEE', requiresAck: true },
      { title: 'Acknowledge the IT acceptable-use policy', owner: 'EMPLOYEE', requiresAck: true },
      { title: 'Set up your profile and emergency contact', owner: 'EMPLOYEE' },
      { title: 'Issue laptop and accounts', owner: 'HR' },
      { title: 'Add to payroll', owner: 'HR' }
    ] },
    { name: 'Employee offboarding', kind: 'OFFBOARDING', tasks: [
      { title: 'Return laptop and access cards', owner: 'EMPLOYEE' },
      { title: 'Hand over ongoing work to your manager', owner: 'EMPLOYEE' },
      { title: 'Exit interview', owner: 'HR' },
      { title: 'Final settlement', owner: 'HR' },
      { title: 'Revoke system access', owner: 'HR' }
    ] }
  ]);

  const cycleCount = await ReviewCycle.countDocuments();
  if (!cycleCount) {
    const cycle = await ReviewCycle.create({ name: 'H2 2026 Review', startDate: '2026-07-01', endDate: '2026-12-31' });
    const reviewees = ['jane@organization.com', 'john@organization.com', 'alice@organization.com', 'bob@organization.com'];
    await Review.insertMany(reviewees.map((email) => ({
      cycleId: cycle.id, userId: id(email), reviewerId: byEmail[email].managerId,
      ...(email === 'john@organization.com' ? { selfRating: 4, selfComment: 'Exceeded the quarterly target.', status: 'Pending Manager' } : {})
    })));
    await Goal.create({
      userId: id('jane@organization.com'), cycleId: cycle.id, title: 'Ship the payments revamp', description: 'Move checkout to the new payments service.',
      dueDate: '2026-12-15', keyResults: [
        { title: 'Migrate endpoints', target: 12, current: 8, unit: 'endpoints' },
        { title: 'Reduce p95 latency (ms) improvement', target: 30, current: 12, unit: '%' }
      ]
    });
    console.log('  performance: cycle, reviews and a goal added');
  }

  await seedIfEmpty(Expense, 'expenses', [
    { userId: id('jane@organization.com'), title: 'Client visit - train tickets', category: 'Travel', amount: 1450, date: inDays(-4).slice(0, 10), receiptRef: 'INV-20933', description: 'Round trip to client site' },
    { userId: id('john@organization.com'), title: 'Team lunch', category: 'Meals', amount: 3200, date: inDays(-9).slice(0, 10), status: 'Approved', reviewedById: id('readonly.admin@organization.com'), reviewedAt: new Date() }
  ]);

  await seedIfEmpty(SupportTicket, 'support tickets', [
    { userId: id('jane@organization.com'), subject: 'VPN access not working', category: 'IT Support', message: 'I cannot connect to the VPN since this morning.', priority: 'High', status: 'In Progress', assigneeId: hr, dueAt: new Date(Date.now() + 6 * 3600 * 1000),
      comments: [{ authorId: hr, authorName: 'Priya Sharma', authorRole: 'ADMIN', message: 'Looking into it - can you share the error message?' }] },
    { userId: id('bob@organization.com'), subject: 'Question about tax form', category: 'Payroll', message: 'Where can I download my Form 16?', priority: 'Low', dueAt: new Date(Date.now() + 100 * 3600 * 1000) }
  ]);

  const marcus = await Contractor.findOne({ name: 'Marcus Chen' });
  if (marcus && !(await Timesheet.countDocuments())) {
    await Timesheet.create({ contractorId: marcus.id, weekStart: '2026-10-05', hours: 38, notes: 'API work', status: 'Approved' });
    await Timesheet.create({ contractorId: marcus.id, weekStart: '2026-10-12', hours: 40 });
    await Invoice.create({ contractorId: marcus.id, number: 'DSI-2026-014', amount: 1000000, issueDate: '2026-09-25', dueDate: '2026-10-25', status: 'Sent' });
    console.log('  contractor timesheets & invoice added');
  }

}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
