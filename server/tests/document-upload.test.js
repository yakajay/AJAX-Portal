import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin } from './helpers/fixtures.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
const put = (who, id, body, type = 'application/pdf', name = 'Offer letter.pdf') =>
  api().put(`/api/admin/documents/${id}/file`).set(who.auth).set('Content-Type', type).set('X-File-Name', encodeURIComponent(name)).send(body);

describe('HR document file uploads', () => {
  it('attaches a verified file, and only the owner or HR can download it', async () => {
    const admin = await makeAdmin();
    const emp = await makeUser();
    const other = await makeUser();
    const doc = (await api().post('/api/admin/documents').set(admin.auth).send({ userId: emp.user.id, name: 'Offer', type: 'Letter' }).expect(201)).body;
    expect(doc.hasFile).toBe(false);
    await api().get(`/api/user/documents/${doc.id}/file`).set(emp.auth).expect(404); // nothing attached yet

    await put(emp, doc.id, pdf).expect(403); // employees cannot upload
    await put(admin, doc.id, Buffer.from('<html><script>alert(1)</script></html>')).expect(415); // not a PDF
    await put(admin, doc.id, Buffer.from('not really a pdf')).expect(415); // type says PDF, bytes disagree
    await put(admin, doc.id, Buffer.alloc(0)).expect(400);
    await put(admin, '64b000000000000000000000', pdf).expect(404);
    await put(admin, doc.id, Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)])).expect(413); // over the limit

    const ok = await put(admin, doc.id, pdf, 'application/pdf', '../../etc/passwd.exe').expect(200);
    expect(ok.body).toMatchObject({ hasFile: true, size: pdf.length, contentType: 'application/pdf' });
    expect(ok.body.fileName).toBe('passwd.pdf');
    expect(ok.body.fileData).toBeUndefined();

    const mine = await api().get(`/api/user/documents/${doc.id}/file`).set(emp.auth).expect(200);
    expect(mine.headers['content-disposition']).toContain('attachment');
    expect(mine.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(mine.body).equals(pdf)).toBe(true);
    await api().get(`/api/user/documents/${doc.id}/file`).set(other.auth).expect(404); // someone else's
    await api().get(`/api/admin/documents/${doc.id}/file`).set(admin.auth).expect(200);
    await api().get(`/api/admin/documents/${doc.id}/file`).set(emp.auth).expect(403);

    const list = await api().get('/api/user/documents').set(emp.auth).expect(200);
    expect(list.body[0]).toMatchObject({ hasFile: true, fileName: 'passwd.pdf' });
    expect(JSON.stringify(list.body)).not.toContain('fileData');
  });
});
