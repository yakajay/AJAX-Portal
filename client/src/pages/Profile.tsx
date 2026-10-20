import React, { useState } from 'react';
import { apiFetch, readError } from '../lib/api';
import { formatDate } from '../lib/format';
import { ProfilePhoto } from '../components/profile/ProfilePhoto';
import { Badge, Button, Field, PasswordInput, inputClass } from '../components/ui';
import type { User } from '../types';

const Locked = () => <Badge tone="slate">HR managed</Badge>;

const Profile = ({ user, onUserUpdate }: { user: User; onUserUpdate?: (u: User) => void }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user?.name || '', dateOfBirth: user?.dateOfBirth || '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => setForm({ name: user?.name || '', dateOfBirth: user?.dateOfBirth || '', currentPassword: '', newPassword: '', confirmPassword: '' });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const wantsPasswordChange = !!(form.currentPassword || form.newPassword || form.confirmPassword);
    if (wantsPasswordChange && form.newPassword !== form.confirmPassword) {
      setStatus({ ok: false, text: 'New passwords do not match.' });
      return;
    }
    try {
      const profileRes = await apiFetch('/user/profile', { method: 'PUT', body: JSON.stringify({ name: form.name, dateOfBirth: form.dateOfBirth || null }) });
      if (!profileRes.ok) throw new Error(await readError(profileRes, 'Failed to update profile'));
      const updated = await profileRes.json();
      if (wantsPasswordChange) {
        const pwRes = await apiFetch('/user/password', { method: 'PUT', body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
        if (!pwRes.ok) throw new Error(await readError(pwRes, 'Failed to update password'));
      }
      onUserUpdate?.({ ...user, ...updated });
      setForm((f) => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setEditing(false);
      setStatus({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong' });
    }
  };

  const subtitle = [user?.designation, user?.department].filter(Boolean).join(' · ') || user?.role?.replace('_', ' ');
  const set = (k: 'name' | 'dateOfBirth' | 'currentPassword' | 'newPassword' | 'confirmPassword') => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const hrRows: [string, string][] = [
    ['Employee ID', user?.employeeId || '—'],
    ['Designation', user?.designation || '—'],
    ['Department', user?.department || '—'],
    ['Date of joining', formatDate(user?.joinDate)],
    ['Phone', user?.phone || '—']
  ];

  return (
    <form onSubmit={save} className="space-y-6 max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-5 min-w-0">
          <ProfilePhoto user={user} onUserUpdate={onUserUpdate} />
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-[32px] leading-tight font-extrabold text-slate-900 tracking-tight break-words">{user?.name}</h1>
            <span className="text-[15px] text-slate-600">{subtitle}</span>
          </div>
        </div>
        <div className="flex gap-2.5">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => { reset(); setEditing(false); setStatus(null); }}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => { setEditing(true); setStatus(null); }}>Edit profile</Button>
          )}
        </div>
      </header>

      {status && <p role="status" className={`text-sm font-semibold ${status.ok ? 'text-blue-800' : 'text-rose-700'}`}>{status.text}</p>}
      {editing && <p className="text-sm text-slate-600">Fields marked “HR managed” can only be changed by the People team.</p>}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5 items-start">
        <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
          <h2 className="text-lg font-extrabold text-slate-900">Personal</h2>
          <Field label="Full name"><input className={inputClass} value={form.name} onChange={set('name')} disabled={!editing} required /></Field>
          <Field label="Work email">
            <div className="flex items-center gap-3"><input type="email" className={inputClass} value={user?.email ?? ''} disabled readOnly /><Locked /></div>
          </Field>
          <Field label="Date of birth" hint="Colleagues see your birthday (not the year) on the dashboard.">
            <input type="date" className={inputClass} max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={set('dateOfBirth')} disabled={!editing} />
          </Field>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-1">
          <h2 className="text-lg font-extrabold text-slate-900 mb-2">Employment</h2>
          {hrRows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
              <span className="flex flex-col"><span className="text-[13px] text-slate-500">{k}</span><span className="text-[15px] font-semibold text-slate-900">{v}</span></span>
              {editing && <Locked />}
            </div>
          ))}
        </div>

        {editing && (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4 md:col-span-2">
            <h2 className="text-lg font-extrabold text-slate-900">Change password</h2>
            <p className="text-sm text-slate-600">Leave these empty to keep your current password.</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field label="Current password"><PasswordInput autoComplete="current-password" className={inputClass} value={form.currentPassword} onChange={set('currentPassword')} /></Field>
              <Field label="New password"><PasswordInput autoComplete="new-password" className={inputClass} value={form.newPassword} onChange={set('newPassword')} /></Field>
              <Field label="Confirm new password"><PasswordInput autoComplete="new-password" className={inputClass} value={form.confirmPassword} onChange={set('confirmPassword')} /></Field>
            </div>
          </div>
        )}
      </section>
    </form>
  );
};

export default Profile;
