import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectTestDb, disconnectTestDb } from './helpers/db.js';
import { api, makeUser, makeAdmin, makeSuperAdmin, makeCompany } from './helpers/fixtures.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);

// 1x1 PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const put = (who, data, type = 'image/png') => api().put('/api/user/profile/avatar').set(who.auth).set('Content-Type', type).send(data);

describe('profile photos', () => {
  it('lets a user set, view and remove their own photo', async () => {
    const me = await makeUser();
    const other = await makeUser();
    expect((await api().get('/api/user/profile').set(me.auth).expect(200)).body.avatarVersion).toBeNull();
    await api().get(`/api/user/avatars/${me.user.id}`).set(other.auth).expect(404);

    await put(me, Buffer.from('<svg onload=alert(1)>'), 'image/png').expect(415); // bytes are not an image
    await put(me, Buffer.from('<svg/>'), 'image/svg+xml').expect(400); // type not accepted
    await put(me, Buffer.concat([png, Buffer.alloc(600 * 1024)])).expect(413);

    const set = await put(me, png).expect(200);
    expect(set.body.avatarVersion).toBeGreaterThan(0);
    expect(set.body.avatarData).toBeUndefined();
    expect(set.body.password).toBeUndefined();

    const seen = await api().get(`/api/user/avatars/${me.user.id}`).set(other.auth).expect(200); // colleagues can see it
    expect(seen.headers['content-type']).toContain('image/png');
    expect(seen.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(seen.body).equals(png)).toBe(true);
    await api().get(`/api/user/avatars/${me.user.id}`).expect(401);

    const dir = await api().get('/api/user/directory').set(other.auth).expect(200);
    expect(dir.body.find((u) => u.id === me.user.id).avatarVersion).toBe(set.body.avatarVersion);
    expect(JSON.stringify(dir.body)).not.toContain('avatarData');

    const gone = await api().delete('/api/user/profile/avatar').set(me.auth).expect(200);
    expect(gone.body.avatarVersion).toBeNull();
    await api().get(`/api/user/avatars/${me.user.id}`).set(other.auth).expect(404);
  });

  it('lets an admin with users permission remove a photo, and photos stay inside their company', async () => {
    const admin = await makeAdmin();
    const noUsers = await makeAdmin({ permissions: 'read' });
    const sa = await makeSuperAdmin();
    const emp = await makeUser();
    await put(emp, png).expect(200);
    await api().delete(`/api/admin/users/${emp.user.id}/avatar`).set(emp.auth).expect(403);
    await api().delete(`/api/admin/users/${emp.user.id}/avatar`).set(noUsers.auth).expect(403);
    await api().delete(`/api/admin/users/${sa.user.id}/avatar`).set(admin.auth).expect(403); // admins cannot manage a Super Admin
    const res = await api().delete(`/api/admin/users/${emp.user.id}/avatar`).set(admin.auth).expect(200);
    expect(res.body.avatarVersion).toBeNull();

    await put(emp, png).expect(200);
    const other = await makeCompany('avatarother');
    const stranger = await makeUser({}, other.company);
    await other.api().get(`/api/user/avatars/${emp.user.id}`).set(stranger.auth).expect(404);
  });
});
