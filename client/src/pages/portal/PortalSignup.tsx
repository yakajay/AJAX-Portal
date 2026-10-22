import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { Button, ErrorNote, Field, inputClass } from '../../components/ui';

type Role = 'viewer' | 'admin' | 'super';
const ROLES: { id: Role; name: string; desc: string }[] = [
  { id: 'viewer', name: 'Portal Viewer', desc: 'View only: track clients, plans and activity. For accounts and finance. No changes.' },
  { id: 'admin', name: 'Portal Admin', desc: 'Monitor clients and edit their profiles, plans and admins. No delete.' },
  { id: 'super', name: 'Portal Super Admin', desc: 'Everything above, plus deleting clients and managing the platform team. Usually for team leads.' }
];
const TEAMS = ['Customer success', 'Onboarding', 'Support', 'Finance', 'Sales', 'Platform engineering', 'Other'];
const EMPTY = { name: '', email: '', phone: '', employeeId: '', title: '', team: TEAMS[0], manager: '', wantedRole: 'admin' as Role, reason: '', agree: false };
type Status = { id: string; status: 'Pending' | 'Approved' | 'Rejected'; role: string | null; note: string };

/** Public page on the platform address: Ajax staff ask for a Portal account; a Portal Super Admin decides the role. */
const PortalSignup = () => {
  const [f, setF] = useState(EMPTY);
  const [view, setView] = useState<'form' | 'sent' | 'status'>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');
  const [result, setResult] = useState<Status | null>(null);
  const [notFound, setNotFound] = useState(false);
  const set = (changes: Partial<typeof f>) => { setF({ ...f, ...changes }); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend('POST', '/auth/portal-access', f);
      setView('sent');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setNotFound(false);
    try {
      setResult(await apiJson<Status>(`/auth/portal-access/status?email=${encodeURIComponent(lookup.trim())}`));
    } catch {
      setNotFound(true);
    }
  };

  const card = 'w-full max-w-3xl bg-white rounded-2xl border border-slate-200 p-8 space-y-5';
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-[10px] bg-blue-600 text-white flex items-center justify-center font-extrabold text-xl">A</div>
        <div className="flex flex-col leading-tight"><span className="font-extrabold text-lg text-slate-900">Ajax HRMS</span><span className="text-xs text-slate-500">Platform · Portal admin</span></div>
      </div>

      {view === 'form' && (
        <form onSubmit={submit} className={card}>
          <div className="space-y-1">
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Request portal access</h1>
            <p className="text-[15px] text-slate-600">For Ajax staff who manage client companies. A Portal Super Admin reviews every request and decides your role.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name"><input required autoComplete="name" className={inputClass} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Ajax work email"><input required type="email" autoComplete="email" className={inputClass} value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Phone"><input required type="tel" autoComplete="tel" className={inputClass} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
            <Field label="Ajax employee ID"><input required className={inputClass} value={f.employeeId} onChange={(e) => set({ employeeId: e.target.value })} /></Field>
            <Field label="Job title"><input required className={inputClass} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Team"><select className={inputClass} value={f.team} onChange={(e) => set({ team: e.target.value })}>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Reporting manager"><input required className={inputClass} value={f.manager} onChange={(e) => set({ manager: e.target.value })} /></Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-extrabold text-slate-900 mb-2">Access you need</legend>
            {ROLES.map((r) => (
              <button key={r.id} type="button" aria-pressed={f.wantedRole === r.id} onClick={() => set({ wantedRole: r.id })}
                className={`w-full text-left p-4 rounded-xl border-2 flex flex-col gap-1 ${f.wantedRole === r.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                <span className="flex justify-between font-extrabold text-slate-900">{r.name}{f.wantedRole === r.id && <span aria-hidden="true">✓</span>}</span>
                <span className="text-[13px] text-slate-600">{r.desc}</span>
              </button>
            ))}
            <p className="text-[13px] text-slate-500">The approver can give you a different role than you ask for.</p>
          </fieldset>
          <Field label="Why do you need access?"><textarea required rows={3} className={`${inputClass} py-2`} placeholder="Which clients or tasks you'll handle" value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
          <label className="flex items-start gap-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" className="mt-1" checked={f.agree} onChange={(e) => set({ agree: e.target.checked })} />
            I'll only access client data needed for my work, and I understand every action is recorded in the activity log.
          </label>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request for approval'}</Button>
          <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-slate-100 text-sm">
            <button type="button" className="font-bold text-blue-800 hover:underline min-h-11" onClick={() => { setView('status'); setLookup(f.email); }}>Check a request's status</button>
            <Link to="/login" className="font-bold text-blue-800 hover:underline min-h-11 inline-flex items-center">Already approved? Sign in</Link>
          </div>
        </form>
      )}

      {view === 'sent' && (
        <section className={`${card} border-2 border-blue-600`}>
          <h1 className="text-2xl font-extrabold text-slate-900">Thanks, {f.name.trim().split(/\s+/)[0]}. We'll review it soon.</h1>
          <p className="text-[15px] leading-relaxed text-slate-600">A Portal Super Admin will review it. You'll get an email at <strong>{f.email}</strong> when they decide, usually within one working day. You can't sign in until then.</p>
          <div className="flex gap-3"><Button variant="secondary" onClick={() => { setView('status'); setLookup(f.email); }}>Check status</Button><Link to="/login" className="inline-flex items-center min-h-11 px-5 font-bold text-blue-800">Back to sign in</Link></div>
        </section>
      )}

      {view === 'status' && (
        <form onSubmit={check} className={card}>
          <h1 className="text-2xl font-extrabold text-slate-900">Check request status</h1>
          <Field label="Ajax work email"><input required type="email" className={inputClass} value={lookup} onChange={(e) => { setLookup(e.target.value); setResult(null); setNotFound(false); }} /></Field>
          <Button type="submit" className="self-start">Check</Button>
          {result && (
            <div role="status" className="p-4 rounded-xl bg-slate-50 space-y-1">
              <p className="font-extrabold text-slate-900">{result.status}{result.status === 'Approved' && result.role ? ` · ${result.role}` : ''}</p>
              <p className="text-sm text-slate-600">
                {result.status === 'Pending' ? 'Waiting for a Portal Super Admin to review.' : result.status === 'Approved' ? 'Check your email for how to set your password, then sign in.' : `Rejected${result.note ? `: ${result.note}` : '.'}`}
              </p>
            </div>
          )}
          {notFound && <p role="alert" className="text-sm font-bold text-rose-700">No request found for that email.</p>}
          <button type="button" className="self-start font-bold text-blue-800 hover:underline min-h-11" onClick={() => setView('form')}>Back to the sign-up form</button>
        </form>
      )}
    </div>
  );
};

export default PortalSignup;
