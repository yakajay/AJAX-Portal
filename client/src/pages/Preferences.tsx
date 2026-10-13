import { useState } from 'react';
import { Laptop, LogOut, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { errorMessage, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useI18n } from '../lib/i18n';
import { LANGUAGES, type Lang } from '../lib/locales';
import { useTheme } from '../lib/theme';
import { Badge, Button, Card, ErrorNote, Field, PageHeader, Spinner, inputClass } from '../components/ui';

interface SessionRow { id: string; userAgent: string; ip: string; lastUsedAt: string; createdAt: string; current: boolean }

const describeAgent = (ua: string) => {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ');
};

const TwoFactor = ({ user, onUserUpdate }: { user: User; onUserUpdate: (u: User) => void }) => {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  const start = () => run(async () => setSetup(await apiSend('POST', '/user/2fa/setup')));
  const enable = () => run(async () => {
    onUserUpdate(await apiSend<User>('POST', '/user/2fa/enable', { code }));
    setSetup(null);
    setCode('');
  });
  const disable = () => run(async () => {
    onUserUpdate(await apiSend<User>('POST', '/user/2fa/disable', { password, code }));
    setCode('');
    setPassword('');
  });

  return (
    <Card title="Two-factor authentication" actions={user.totpEnabled ? <Badge tone="green"><ShieldCheck size={11} className="mr-1" />On</Badge> : <Badge>Off</Badge>}>
      <ErrorNote error={error} />
      {user.totpEnabled ? (
        <div className="space-y-4 mt-1">
          <p className="text-sm text-slate-600">Sign-in asks for a code from your authenticator app instead of an emailed code. You can still request an emailed code at sign-in if you lose your phone.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Password"><input type="password" autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Authenticator code"><input inputMode="numeric" maxLength={6} className={inputClass} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
          <Button variant="danger" disabled={busy || !password || code.length !== 6} onClick={disable}><ShieldOff size={14} />Turn off</Button>
        </div>
      ) : setup ? (
        <div className="space-y-4">
          <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1">
            <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
            <li>Add an account and choose <strong>enter a setup key</strong>.</li>
            <li>Enter the key below, then type the 6-digit code it shows.</li>
          </ol>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Setup key</p>
            <p className="font-mono text-lg tracking-widest text-slate-900 break-all select-all">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
            <a href={setup.otpauthUrl} className="text-xs font-bold text-blue-600 hover:underline">Open in authenticator app</a>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="6-digit code"><input inputMode="numeric" maxLength={6} autoComplete="one-time-code" className={`${inputClass} w-40`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button disabled={busy || code.length !== 6} onClick={enable}>Verify and turn on</Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Add a second step to sign-in using an authenticator app on your phone.</p>
          <Button disabled={busy} onClick={start}><ShieldCheck size={14} />Set up</Button>
        </div>
      )}
    </Card>
  );
};

const Sessions = ({ onLogout }: { onLogout: () => void }) => {
  const { data, loading, error, reload } = useAsync(() => apiJson<SessionRow[]>('/user/sessions'));
  const [actionError, setActionError] = useState<string | null>(null);

  const end = async (id: string) => {
    try { setActionError(null); await apiSend('DELETE', `/user/sessions/${id}`); await reload(); } catch (e) { setActionError(errorMessage(e)); }
  };
  const endAll = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    try { await apiSend('POST', '/user/sessions/logout-all'); onLogout(); } catch (e) { setActionError(errorMessage(e)); }
  };

  return (
    <Card title="Signed-in devices" actions={<Button small variant="secondary" onClick={endAll}><LogOut size={12} />Sign out everywhere</Button>} flush>
      <ErrorNote error={error ?? actionError} />
      {loading ? <Spinner /> : (
        <ul className="divide-y divide-slate-100">
          {data?.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-6 py-4">
              <Laptop size={20} className="text-slate-400 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{describeAgent(s.userAgent)} {s.current && <Badge tone="green">This device</Badge>}</p>
                <p className="text-xs text-slate-400">{s.ip || 'Unknown IP'} · active {formatDateTime(s.lastUsedAt)} · signed in {formatDateTime(s.createdAt)}</p>
              </div>
              {!s.current && <button aria-label="Sign out this device" onClick={() => end(s.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const Preferences = ({ user, onUserUpdate, onLogout }: { user: User | null; onUserUpdate: (u: User) => void; onLogout: () => void }) => {
  const { lang, setLang, t } = useI18n();
  const { theme, toggle } = useTheme();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const prefs = user.preferences ?? { language: lang, emailNotifications: true, emailDigest: false };

  const save = async (patch: Partial<NonNullable<User['preferences']>>) => {
    try {
      setError(null);
      onUserUpdate(await apiSend<User>('PUT', '/user/preferences', patch));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={t('prefs.title')} subtitle={t('prefs.subtitle')} actions={saved ? <Badge tone="green">{t('prefs.saved')}</Badge> : undefined} />
      <ErrorNote error={error} />
      <Card>
        <div className="grid sm:grid-cols-2 gap-6">
          <Field label={t('prefs.language')}>
            <select className={inputClass} value={lang} onChange={(e) => { setLang(e.target.value as Lang); void save({ language: e.target.value }); }}>
              {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </Field>
          <Field label={t('prefs.theme')}>
            <Button variant="secondary" className="w-full !normal-case !tracking-normal" onClick={toggle}>{theme === 'dark' ? 'Dark — switch to light' : 'Light — switch to dark'}</Button>
          </Field>
        </div>
        <div className="mt-6 space-y-3">
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={prefs.emailNotifications} onChange={(e) => save({ emailNotifications: e.target.checked })} />{t('prefs.emailNotifications')}
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={prefs.emailDigest} onChange={(e) => save({ emailDigest: e.target.checked })} />{t('prefs.emailDigest')}
          </label>
        </div>
      </Card>
      <TwoFactor user={user} onUserUpdate={onUserUpdate} />
      <Sessions onLogout={onLogout} />
    </div>
  );
};

export default Preferences;
