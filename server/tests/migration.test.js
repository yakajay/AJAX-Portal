import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Runs the real upgrade script against a database that looks like the old single-company layout
describe('migrate-to-multitenant script', () => {
  it('assigns existing data to a company, fixes indexes and seals salary figures', async () => {
    const memory = await MongoMemoryServer.create();
    const uri = memory.getUri();
    const conn = await mongoose.createConnection(uri, { dbName: 'legacy' }).asPromise();
    try {
      const userId = new mongoose.Types.ObjectId();
      // Old layout: global unique email index, plaintext pay figures, no companyId anywhere
      await conn.collection('users').createIndex({ email: 1 }, { unique: true });
      await conn.collection('users').insertMany([
        { _id: userId, email: 'old@legacy.test', name: 'Old Timer', role: 'SUPER_ADMIN', password: 'x', permissions: 'read,write,delete' },
        { email: 'other@legacy.test', name: 'Other', role: 'USER', password: 'x', permissions: 'read' }
      ]);
      await conn.collection('salarystructures').insertOne({ userId, currency: 'INR', basic: 40000, hra: 10000, allowances: 2000, pfPercent: 12, taxPercent: 10, otherDeductions: 0 });
      await conn.collection('payslips').insertOne({
        userId, month: '2026-09', currency: 'INR', earnings: { basic: 40000, hra: 10000, allowances: 2000 }, deductions: { pf: 4800, tax: 5200, other: 0 },
        gross: 52000, totalDeductions: 10000, net: 42000, workingDays: 22, paidDays: 22, status: 'Paid'
      });
      await conn.collection('departments').insertOne({ name: 'Ops', description: '' });

      // (asynchronous on purpose: a blocking spawn would starve this process while the script talks to MongoDB)
      const run = () => new Promise((resolve) => {
        const child = spawn(process.execPath, ['scripts/migrate-to-multitenant.js'], {
          env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: 'legacy', COMPANY_NAME: 'Legacy Co', COMPANY_SLUG: 'legacy', NODE_ENV: 'test' }
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('exit', (status) => resolve({ status, stdout, stderr }));
      });
      const first = await run();
      expect(first.status, first.stdout + first.stderr).toBe(0);

      const company = await conn.collection('companies').findOne({ slug: 'legacy' });
      expect(company).toBeTruthy();
      // Users now live in their company's own collection, and the shared one is parked
      const users = await conn.collection('users.legacy').find().toArray();
      expect(users).toHaveLength(2);
      expect(await conn.collection('users').countDocuments()).toBe(0);
      expect(users.every((u) => String(u.companyId) === String(company._id))).toBe(true);
      expect((await conn.collection('departments').findOne({ name: 'Ops' })).companyId).toEqual(company._id);

      // Pay figures are sealed and the old global email index is gone (same email may now exist in another company; the per-company one lives on users.legacy)
      const salary = await conn.collection('salarystructures').findOne({ userId });
      expect(salary.basic).toMatch(/^enc:v1:/);
      expect(JSON.stringify(salary)).not.toContain('40000');
      const slip = await conn.collection('payslips').findOne({ userId });
      expect(slip.net).toMatch(/^enc:v1:/);
      expect(slip.earnings.basic).toMatch(/^enc:v1:/);
      const indexes = (await conn.collection('users.legacy').indexes()).map((i) => i.name);
      expect(indexes).not.toContain('email_1');
      expect(indexes).toContain('companyId_1_email_1');

      // Running it again changes nothing
      const second = await run();
      expect(second.status, second.stdout + second.stderr).toBe(0);
      expect(await conn.collection('companies').countDocuments()).toBe(1);
      expect((await conn.collection('salarystructures').findOne({ userId })).basic).toBe(salary.basic);
    } finally {
      await conn.close();
      await memory.stop();
    }
  }, 120000);
});
