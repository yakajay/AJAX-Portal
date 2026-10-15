import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin, makeCompany } from './helpers/fixtures.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
const job = (extra = {}) => ({ title: 'Backend Engineer', department: 'Engineering', location: 'Remote', openings: 2, ...extra });

describe('recruitment', () => {
  it('manages job openings (permission-gated, validated)', async () => {
    const admin = await makeAdmin();
    const user = await makeUser();
    await api().post('/api/admin/recruitment/jobs').set(user.auth).send(job()).expect(403);
    await api().post('/api/admin/recruitment/jobs').set(admin.auth).send(job({ title: ' ' })).expect(400);
    await api().post('/api/admin/recruitment/jobs').set(admin.auth).send(job({ openings: 0 })).expect(400);
    const made = await api().post('/api/admin/recruitment/jobs').set(admin.auth).send(job()).expect(201);
    expect(made.body).toMatchObject({ title: 'Backend Engineer', status: 'Open', openings: 2 });
    const closed = await api().put(`/api/admin/recruitment/jobs/${made.body.id}`).set(admin.auth).send({ status: 'Closed' }).expect(200);
    expect(closed.body.status).toBe('Closed');
    await api().put(`/api/admin/recruitment/jobs/${made.body.id}`).set(admin.auth).send({ status: 'Maybe' }).expect(400);
    const list = await api().get('/api/admin/recruitment/jobs').set(admin.auth).expect(200);
    expect(list.body.find((j) => j.id === made.body.id).stageCounts).toEqual({});
  });

  it('moves candidates through the pipeline with notes and a verified resume', async () => {
    const admin = await makeAdmin();
    const j = (await api().post('/api/admin/recruitment/jobs').set(admin.auth).send(job()).expect(201)).body;
    const body = { jobId: j.id, name: 'Asha Rao', email: 'Asha@Cand.test', phone: '+91 98765 43210', source: 'Referral' };
    await api().post('/api/admin/recruitment/candidates').set(admin.auth).send({ ...body, email: 'nope' }).expect(400);
    await api().post('/api/admin/recruitment/candidates').set(admin.auth).send({ ...body, jobId: '64b000000000000000000000' }).expect(404);
    const cand = (await api().post('/api/admin/recruitment/candidates').set(admin.auth).send(body).expect(201)).body;
    expect(cand).toMatchObject({ stage: 'Applied', email: 'asha@cand.test', hasResume: false });
    await api().post('/api/admin/recruitment/candidates').set(admin.auth).send(body).expect(409); // same email, same job

    const url = `/api/admin/recruitment/candidates/${cand.id}`;
    await api().put(`${url}/stage`).set(admin.auth).send({ stage: 'Interview' }).expect(200);
    await api().put(`${url}/stage`).set(admin.auth).send({ stage: 'Hired' }).expect(400); // only via the hire step
    await api().put(`${url}/stage`).set(admin.auth).send({ stage: 'Bogus' }).expect(400);
    await api().post(`${url}/notes`).set(admin.auth).send({ text: '  ' }).expect(400);
    const noted = await api().post(`${url}/notes`).set(admin.auth).send({ text: 'Strong systems skills' }).expect(201);
    expect(noted.body.notes[0]).toMatchObject({ text: 'Strong systems skills', authorName: admin.user.name });

    const put = (data, type = 'application/pdf') => api().put(`${url}/resume`).set(admin.auth).set('Content-Type', type).set('X-File-Name', 'cv.pdf').send(data);
    await put(Buffer.from('<html></html>')).expect(415);
    await put(Buffer.from('plain'), 'image/png').expect(400); // not a resume type: the raw parser skips it, leaving no file
    const ok = await put(pdf).expect(200);
    expect(ok.body).toMatchObject({ hasResume: true, resumeName: 'cv.pdf', resumeSize: pdf.length });
    expect(ok.body.resumeData).toBeUndefined();
    const dl = await api().get(`${url}/resume`).set(admin.auth).expect(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(Buffer.from(dl.body).equals(pdf)).toBe(true);

    const rejected = await api().put(`${url}/stage`).set(admin.auth).send({ stage: 'Rejected', reason: 'Not a fit' }).expect(200);
    expect(rejected.body.rejectionReason).toBe('Not a fit');
    const counts = (await api().get('/api/admin/recruitment/jobs').set(admin.auth).expect(200)).body.find((x) => x.id === j.id).stageCounts;
    expect(counts).toEqual({ Rejected: 1 });
    const filtered = await api().get(`/api/admin/recruitment/candidates?jobId=${j.id}&stage=Rejected`).set(admin.auth).expect(200);
    expect(filtered.body).toHaveLength(1);

    // a closed position takes no new candidates
    await api().put(`/api/admin/recruitment/jobs/${j.id}`).set(admin.auth).send({ status: 'Closed' }).expect(200);
    await api().post('/api/admin/recruitment/candidates').set(admin.auth).send({ ...body, email: 'late@cand.test' }).expect(409);
  });

  it('hiring creates the employee account; it needs users permission and unique details', async () => {
    const sa = await makeSuperAdmin();
    const recruiter = await makeAdmin({ permissions: 'read,recruitment:write' }); // cannot manage users
    const j = (await api().post('/api/admin/recruitment/jobs').set(sa.auth).send(job({ title: 'Designer', department: 'Design' })).expect(201)).body;
    const cand = (await api().post('/api/admin/recruitment/candidates').set(sa.auth).send({ jobId: j.id, name: 'Ben Hire', email: 'ben@cand.test', phone: '+44 7700 900123' }).expect(201)).body;
    const url = `/api/admin/recruitment/candidates/${cand.id}/hire`;

    await api().post(url).set(recruiter.auth).send({ employeeId: 'H-1' }).expect(403);
    await api().post(url).set(sa.auth).send({}).expect(400); // employee id required
    await api().post(url).set(sa.auth).send({ employeeId: 'H-1', phone: 'abc' }).expect(400);
    const taken = await makeUser({ employeeId: 'H-2' });
    await api().post(url).set(sa.auth).send({ employeeId: taken.user.employeeId }).expect(409);

    const done = await api().post(url).set(sa.auth).send({ employeeId: 'h-1', joinDate: '2026-11-01' }).expect(201);
    expect(done.body.tempPassword.length).toBeGreaterThanOrEqual(6);
    expect(done.body.user).toMatchObject({ email: 'ben@cand.test', name: 'Ben Hire', role: 'USER', employeeId: 'H-1', department: 'Design', designation: 'Designer', joinDate: '2026-11-01' });
    expect(done.body.candidate).toMatchObject({ stage: 'Hired', hiredUserId: done.body.user.id });

    await api().post(url).set(sa.auth).send({ employeeId: 'H-3' }).expect(409); // already hired
    await api().put(`/api/admin/recruitment/candidates/${cand.id}/stage`).set(sa.auth).send({ stage: 'Screening' }).expect(409);
    const users = (await api().get('/api/admin/users').set(sa.auth).expect(200)).body;
    expect(users.some((u) => u.email === 'ben@cand.test')).toBe(true);
  });

  it('is blocked when the company plan lacks the module, and candidates stay inside their company', async () => {
    const co = await makeCompany('norecruit', { modules: ['users', 'hr'] });
    const admin = await makeAdmin({}, co.company);
    const res = await co.api().get('/api/admin/recruitment/jobs').set(admin.auth).expect(403);
    expect(res.body.code).toBe('MODULE_DISABLED');

    const mine = await makeAdmin();
    const j = (await api().post('/api/admin/recruitment/jobs').set(mine.auth).send(job()).expect(201)).body;
    const other = await makeCompany('hasrecruit');
    const theirs = await makeAdmin({}, other.company);
    expect((await other.api().get('/api/admin/recruitment/jobs').set(theirs.auth).expect(200)).body.find((x) => x.id === j.id)).toBeUndefined();
  });
});
