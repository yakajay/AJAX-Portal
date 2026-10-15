import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin } from './helpers/fixtures.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const upload = (who, csv, query = '') =>
  api().post(`/api/admin/users/import${query}`).set(who.auth).set('Content-Type', 'text/csv').send(csv);

describe('bulk employee import', () => {
  it('is permission-gated and serves a template', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    await upload(user, 'name,email,phone,employee_id\nA,a@x.test,+911234567890,E1').expect(403);
    const tpl = await api().get('/api/admin/users/import/template').set(admin.auth).expect(200);
    expect(tpl.text).toContain('manager_email');
  });

  it('validates the whole file and creates nothing when a row is bad', async () => {
    const admin = await makeAdmin();
    const taken = await makeUser();
    await upload(admin, 'name,email\nA,a@x.test').expect(400); // no phone / employee_id columns
    await upload(admin, 'name,email,phone,employee_id,salary\nA,a@x.test,1234567,E1,1').expect(400); // unknown column
    const res = await upload(admin, `name,email,phone,employee_id,join_date,manager_email
Good One,good1@bulk.test,+91 98765 43210,B-1,2026-01-01,
,bad@bulk.test,+91 98765 43211,B-2,,
Dup,${taken.user.email},+91 98765 43212,B-3,,
Twin,good1@bulk.test,+91 98765 43213,B-4,,
Late,late@bulk.test,+91 98765 43214,B-5,2026-13-45,nobody@bulk.test
NoPhone,nophone@bulk.test,,B-6,,
BadPhone,badphone@bulk.test,abc,B-7,,
NoId,noid@bulk.test,+91 98765 43215,,,
SameId,sameid@bulk.test,+91 98765 43216,b-1,,`).expect(422);
    const lines = res.body.errors.map((e) => e.line);
    expect(lines).toEqual(expect.arrayContaining([3, 4, 5, 6, 7, 8, 9, 10]));
    const users = await api().get('/api/admin/users').set(admin.auth).expect(200);
    expect(users.body.some((u) => u.email === 'good1@bulk.test')).toBe(false);
  });

  it('dry-runs, then imports with managers (even listed later) and temporary passwords', async () => {
    const admin = await makeAdmin();
    const csv = `name,email,phone,employee_id,department,designation,manager_email,join_date
Report,report@bulk2.test,+91 90000 00001,R-100,Sales,Rep,boss@bulk2.test,2026-02-02
"Boss, The",boss@bulk2.test,(555) 010-9999,R-101,Sales,Lead,,2025-01-01
`;
    const dry = await upload(admin, csv, '?dryRun=1').expect(200);
    expect(dry.body).toMatchObject({ dryRun: true, count: 2 });
    expect((await api().get('/api/admin/users').set(admin.auth)).body.some((u) => u.email === 'boss@bulk2.test')).toBe(false);

    const done = await upload(admin, csv).expect(201);
    expect(done.body.count).toBe(2);
    expect(done.body.created[0].tempPassword.length).toBeGreaterThanOrEqual(6);

    const users = (await api().get('/api/admin/users').set(admin.auth).expect(200)).body;
    const boss = users.find((u) => u.email === 'boss@bulk2.test');
    const report = users.find((u) => u.email === 'report@bulk2.test');
    expect(boss.name).toBe('Boss, The');
    expect(report).toMatchObject({ department: 'Sales', designation: 'Rep', role: 'USER', joinDate: '2026-02-02', phone: '+91 90000 00001', employeeId: 'R-100' });
    expect(report.managerId).toBe(boss.id);

    await upload(admin, csv).expect(422); // now they exist

    // the same Employee ID cannot be given by hand either
    await api().post('/api/admin/users').set(admin.auth).send({ name: 'Dup', email: 'dupid@bulk2.test', password: 'secret1', employeeId: 'r-100'.toUpperCase() }).expect(409);
    await api().post('/api/admin/users').set(admin.auth).send({ name: 'Bad', email: 'badph@bulk2.test', password: 'secret1', phone: 'xyz' }).expect(400);
  });
});
