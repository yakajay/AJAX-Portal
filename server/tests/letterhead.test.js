import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import zlib from 'node:zlib';
import * as db from './helpers/db.js';
import { makeCompany, makeSuperAdmin, makeAdmin, makeUser } from './helpers/fixtures.js';
import { computePayslip, buildPayslipPdf } from '../src/utils/payroll.js';

beforeAll(db.connectTestDb);
afterAll(db.disconnectTestDb);

// A real 8x2 grey PNG, so the PDF builder can actually embed it
const crc = (buf) => {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const makePng = () => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; // 8-bit grey
  const rows = Buffer.concat([0, 1].map(() => Buffer.concat([Buffer.from([0]), Buffer.alloc(8, 120)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
};
const png = makePng();
const isPdf = (b) => Buffer.from(b).subarray(0, 5).toString() === '%PDF-';
const hasImage = (b) => Buffer.from(b).toString('latin1').includes('/Subtype /Image');
const binary = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

describe('payslip PDF', () => {
  const slip = { month: '2030-02', currency: 'USD', ...computePayslip({ basic: 4000, hra: 1000, allowances: 500, pfPercent: 12, taxPercent: 10, otherDeductions: 0 }, { workingDays: 20 }) };
  it('prints the letterhead when there is one, and a text header when there is not', async () => {
    const plain = await buildPayslipPdf(slip, { name: 'Ada', email: 'ada@x.co' }, 'Acme');
    const branded = await buildPayslipPdf(slip, { name: 'Ada', email: 'ada@x.co' }, 'Acme', png);
    expect(isPdf(branded)).toBe(true);
    expect(hasImage(plain)).toBe(false);
    expect(hasImage(branded)).toBe(true);
  });
  it('survives a corrupt letterhead by falling back to the text header', async () => {
    const pdf = await buildPayslipPdf(slip, { name: 'Ada', email: 'ada@x.co' }, 'Acme', Buffer.from('not an image'));
    expect(isPdf(pdf)).toBe(true);
    expect(hasImage(pdf)).toBe(false);
  });
});

describe('company letterhead', () => {
  it('is uploaded by the company admin and only accepts PNG or JPEG', async () => {
    const co = await makeCompany('lhrules');
    const admin = await makeSuperAdmin({}, co.company);
    const plain = await makeAdmin({}, co.company);
    const put = (who, body, type = 'image/png') => co.api().put('/api/admin/company/letterhead').set(who.auth).set('Content-Type', type).send(body);

    await co.api().get('/api/admin/company/letterhead').set(admin.auth).expect(404);
    await put(admin, Buffer.from('<svg/>')).expect(400);
    await put(admin, png, 'image/webp').expect(400); // PDFs cannot embed WebP
    await put(admin, Buffer.concat([png, Buffer.alloc(1100 * 1024)])).expect(413);
    await put(plain, png).expect(403);
    await put(admin, png).expect(200);

    const company = (await co.api().get('/api/admin/company').set(admin.auth).expect(200)).body;
    expect(company.letterheadUpdatedAt).toBeTruthy();
    expect(JSON.stringify(company)).not.toContain('letterheadData');
    const img = await co.api().get('/api/admin/company/letterhead').set(admin.auth).buffer(true).parse(binary).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.body.equals(png)).toBe(true);
    await co.api().get('/api/admin/company/letterhead').set(plain.auth).expect(403);

    await co.api().delete('/api/admin/company/letterhead').set(plain.auth).expect(403);
    await co.api().delete('/api/admin/company/letterhead').set(admin.auth).expect(200);
    await co.api().get('/api/admin/company/letterhead').set(admin.auth).expect(404);
  });

  it('is printed on the letters HR issues, which land in the employee\'s documents', async () => {
    const co = await makeCompany('lhletters');
    const admin = await makeSuperAdmin({}, co.company);
    const emp = await makeUser({}, co.company);
    const other = await makeUser({}, co.company);
    const letter = { userId: emp.user.id, subject: 'Salary revision', body: 'Your salary is revised with effect from 1 April.' };
    const issue = (body) => co.api().post('/api/admin/documents/letter').set(admin.auth).send(body);

    await issue({ ...letter, subject: ' ' }).expect(400);
    await issue({ ...letter, userId: '64b000000000000000000000' }).expect(404);
    await co.api().post('/api/admin/documents/letter').set(emp.auth).send(letter).expect(403);

    // Before a letterhead exists the letter has a text header
    const first = (await issue(letter).expect(201)).body;
    expect(first).toMatchObject({ type: 'Letter', name: 'Salary revision', hasFile: true, contentType: 'application/pdf' });
    const plainPdf = await co.api().get(`/api/user/documents/${first.id}/file`).set(emp.auth).buffer(true).parse(binary).expect(200);
    expect(isPdf(plainPdf.body)).toBe(true);
    expect(hasImage(plainPdf.body)).toBe(false);

    await co.api().put('/api/admin/company/letterhead').set(admin.auth).set('Content-Type', 'image/png').send(png).expect(200);
    const second = (await issue(letter).expect(201)).body;
    const branded = await co.api().get(`/api/user/documents/${second.id}/file`).set(emp.auth).buffer(true).parse(binary).expect(200);
    expect(hasImage(branded.body)).toBe(true);
    await co.api().get(`/api/user/documents/${second.id}/file`).set(other.auth).expect(404); // not theirs
  });
});
