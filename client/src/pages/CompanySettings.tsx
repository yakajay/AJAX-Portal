import { useEffect, useState } from 'react';
import { Copy, Mail, ShieldCheck } from 'lucide-react';
import { apiFetch, apiJson, apiSend, readError } from '../lib/api';
import { loadWorkspace } from '../lib/workspace';
import { errorMessage, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, Spinner, StatTile, Tabs, Th, inputClass, PasswordInput } from '../components/ui';

interface CompanyRecord {
  name: string;
  slug: string;
  domain: string;
  origin: string;
  status: string;
  primaryContact: { name: string; email: string; phone: string };
  profile: { industry: string; website: string; address: string; timezone: string };
  subscription: { plan: string; seatLimit: number; expiresAt: string | null };
  modules: string[];
  features: { customLogo: boolean; customEmail?: boolean };
  logoUpdatedAt: string | null;
  letterheadUpdatedAt?: string | null;
  settings: { allowSelfSignup: boolean };
  usage: { employees: number; seatLimit: number };
}

interface SsoSettings {
  enabled: boolean;
  protocol: 'oidc' | 'saml';
  providerName: string;
  allowedDomains: string[];
  autoProvision: boolean;
  oidc: { issuer: string; clientId: string; clientSecretSet: boolean };
  saml: { entryPoint: string; idpIssuer: string; idpCert: string };
  registration: { oidcRedirectUri: string; samlAcsUrl: string; samlEntityId: string; samlMetadataUrl: string };
}

interface MailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordSet: boolean;
  fromName: string;
  fromEmail: string;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
}

interface SupportGrant {
  id: string;
  reason: string;
  grantedByName: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  views: number;
  lastViewedAt: string | null;
}

type TabId = 'details' | 'sso' | 'mail' | 'support';

const Toggle = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>
      <span className="block text-sm font-bold text-slate-700">{label}</span>
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </span>
  </label>
);

const CopyField = ({ label, value }: { label: string; value: string }) => (
  <Field label={label}>
    <div className="flex gap-2">
      <input readOnly className={`${inputClass} font-mono text-xs`} value={value} onFocus={(e) => e.currentTarget.select()} />
      <Button variant="secondary" small aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard?.writeText(value)}><Copy size={14} /></Button>
    </div>
  </Field>
);

// ---------------------------------------------------------------- Letterhead
const LETTERHEAD_TYPES = ['image/png', 'image/jpeg'];
const MAX_LETTERHEAD_BYTES = 1024 * 1024;

const LetterheadCard = ({ company, onChanged }: { company: CompanyRecord; onChanged: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const version = company.letterheadUpdatedAt;

  // The preview needs the sign-in token, so it is fetched and shown from a blob rather than an <img src>
  useEffect(() => {
    if (!version) { setPreview(null); return; }
    let url: string | null = null;
    let cancelled = false;
    apiFetch('/admin/company/letterhead')
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (blob && !cancelled) { url = URL.createObjectURL(blob); setPreview(url); } })
      .catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [version]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!LETTERHEAD_TYPES.includes(file.type)) return setError('Choose a PNG or JPEG image.');
    if (file.size > MAX_LETTERHEAD_BYTES) return setError('The letterhead must be 1 MB or smaller.');
    setBusy(true);
    try {
      const res = await apiFetch('/admin/company/letterhead', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend('DELETE', '/admin/company/letterhead');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Letterhead" actions={<Badge tone={version ? 'green' : 'slate'}>{version ? 'Uploaded' : 'Not set'}</Badge>}>
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center min-h-[5rem]">
          {preview ? <img src={preview} alt="Current letterhead" className="w-full max-h-40 object-contain" /> : <span className="text-xs text-slate-400">Plain text header with your company name</span>}
        </div>
        <p className="text-xs text-slate-400">PNG or JPEG, up to 1 MB. Use a wide banner (about A4 width, ideally under 130 px tall when printed). It is printed at the top of every payslip and of the letters you create in the HR Hub.</p>
        <div className="flex flex-wrap gap-3">
          <label className={`inline-flex items-center rounded-xl bg-blue-600 text-white px-5 py-2.5 text-xs font-extrabold cursor-pointer hover:bg-blue-700 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {version ? 'Replace letterhead' : 'Upload letterhead'}
            <input type="file" accept={LETTERHEAD_TYPES.join(',')} aria-label="Letterhead image" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {version && <Button variant="secondary" disabled={busy} onClick={() => void remove()}>Remove letterhead</Button>}
        </div>
        <ErrorNote error={error} />
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- Logo
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 256 * 1024;

const BrandingCard = ({ company, onChanged }: { company: CompanyRecord; onChanged: () => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLogo = !!company.logoUpdatedAt;

  const done = async () => {
    await loadWorkspace(true);
    window.location.reload(); // header, sidebar and login pick up the new logo
    onChanged();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!LOGO_TYPES.includes(file.type)) return setError('Choose a PNG, JPEG or WebP image.');
    if (file.size > MAX_LOGO_BYTES) return setError('The logo must be 256 KB or smaller.');
    setBusy(true);
    try {
      const res = await apiFetch('/admin/company/logo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      await done();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend('DELETE', '/admin/company/logo');
      await done();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Company logo" actions={<Badge tone={company.features.customLogo ? 'green' : 'slate'}>{company.features.customLogo ? 'Included' : 'Not in your plan'}</Badge>}>
      {!company.features.customLogo ? (
        <p className="text-sm text-slate-500">Showing your logo instead of ours is an optional feature. Ask the platform administrator to enable it for your company.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-40 h-20 rounded-xl border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
              {hasLogo ? <img src={`/api/auth/logo?v=${company.logoUpdatedAt}`} alt="Current logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">Platform logo</span>}
            </div>
            <p className="text-xs text-slate-400">PNG, JPEG or WebP, up to 256 KB. A wide image on a transparent background works best. It replaces our logo in the header, menu and login page.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className={`inline-flex items-center rounded-xl bg-blue-600 text-white px-5 py-2.5 text-xs font-extrabold cursor-pointer hover:bg-blue-700 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {hasLogo ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {hasLogo && <Button variant="secondary" disabled={busy} onClick={() => void remove()}>Remove logo</Button>}
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------- Details & domain
const DetailsTab = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<CompanyRecord>('/admin/company'), []);
  const [form, setForm] = useState<CompanyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const value = form ?? data;
  const patch = (changes: Partial<CompanyRecord>) => setForm({ ...value, ...changes });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);
    try {
      await apiSend('PUT', '/admin/company', {
        name: value.name, primaryContact: value.primaryContact, profile: value.profile, settings: value.settings
      });
      setForm(null);
      await reload();
      setMessage('Company details saved.');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form onSubmit={save} className="lg:col-span-2 space-y-6">
        <Card title="Company details">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Company name"><input required className={inputClass} value={value.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
            <Field label="Industry"><input className={inputClass} value={value.profile.industry} onChange={(e) => patch({ profile: { ...value.profile, industry: e.target.value } })} /></Field>
            <Field label="Primary contact"><input className={inputClass} value={value.primaryContact.name} onChange={(e) => patch({ primaryContact: { ...value.primaryContact, name: e.target.value } })} /></Field>
            <Field label="Contact email"><input type="email" className={inputClass} value={value.primaryContact.email} onChange={(e) => patch({ primaryContact: { ...value.primaryContact, email: e.target.value } })} /></Field>
            <Field label="Contact phone"><input className={inputClass} value={value.primaryContact.phone} onChange={(e) => patch({ primaryContact: { ...value.primaryContact, phone: e.target.value } })} /></Field>
            <Field label="Website"><input className={inputClass} value={value.profile.website} onChange={(e) => patch({ profile: { ...value.profile, website: e.target.value } })} /></Field>
            <Field label="Time zone"><input className={inputClass} placeholder="Asia/Kolkata" value={value.profile.timezone} onChange={(e) => patch({ profile: { ...value.profile, timezone: e.target.value } })} /></Field>
            <Field label="Address"><input className={inputClass} value={value.profile.address} onChange={(e) => patch({ profile: { ...value.profile, address: e.target.value } })} /></Field>
          </div>
          <div className="mt-5">
            <Toggle
              label="Let people create their own account"
              hint="Off by default. People are normally added by an admin or on first single sign-on."
              checked={value.settings.allowSelfSignup}
              onChange={(v) => patch({ settings: { ...value.settings, allowSelfSignup: v } })}
            />
          </div>
          <ErrorNote error={formError} />
          {message && <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">{message}</p>}
          <div className="mt-5"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
        </Card>
      </form>

      <div className="space-y-6">
        <Card title="Domain">
          <p className="text-xs font-extrabold text-slate-400">Your workspace address</p>
          <a className="block mt-1 font-mono text-sm text-blue-700 break-all" href={data.origin}>{data.domain}</a>
          <p className="text-xs text-slate-400 mt-3">
            Created for you when your company was set up. Your people sign in here. To change it, contact the platform administrator.
            A custom domain (for example hr.yourcompany.com) is an optional upgrade.
          </p>
        </Card>
        <BrandingCard company={data} onChanged={() => void reload()} />
        <LetterheadCard company={data} onChanged={() => void reload()} />
        <StatTile label="Employees" value={`${data.usage.employees} / ${data.usage.seatLimit}`} hint={`${data.subscription.plan} plan`} />
        <Card title="Modules in your plan">
          <div className="flex flex-wrap gap-2">{data.modules.map((m) => <Badge key={m} tone="blue">{m}</Badge>)}</div>
        </Card>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Single sign-on
const SsoTab = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<SsoSettings>('/admin/company/sso'), []);
  const [form, setForm] = useState<SsoSettings | null>(null);
  const [secret, setSecret] = useState('');
  const [domains, setDomains] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const value = form ?? data;
  const patch = (changes: Partial<SsoSettings>) => setForm({ ...value, ...changes });
  const domainText = domains ?? value.allowedDomains.join(', ');

  const submit = async (extra: { enabled?: boolean } = {}, done = 'Single sign-on settings saved.') => {
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      await apiSend('PUT', '/admin/company/sso', {
        protocol: value.protocol,
        providerName: value.providerName,
        autoProvision: value.autoProvision,
        allowedDomains: domainText,
        oidc: { issuer: value.oidc.issuer, clientId: value.oidc.clientId, clientSecret: secret },
        saml: value.saml,
        ...extra
      });
      setForm(null);
      setSecret('');
      setDomains(null);
      await reload();
      setMessage(done);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form className="lg:col-span-2 space-y-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Card
          title="Single sign-on"
          actions={<Badge tone={data.enabled ? 'green' : 'slate'}>{data.enabled ? 'Enabled' : 'Off'}</Badge>}
        >
          <p className="text-sm text-slate-500 mb-5">
            Let your people sign in with your own identity provider (Google Workspace, Microsoft Entra ID, Okta…). Optional: when it is on,
            the login page offers both <strong>Sign in with SSO</strong> and <strong>Sign in with password</strong>.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Protocol">
              <select className={inputClass} value={value.protocol} onChange={(e) => patch({ protocol: e.target.value as 'oidc' | 'saml' })}>
                <option value="oidc">OpenID Connect</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </Field>
            <Field label="Button label (provider name)"><input className={inputClass} value={value.providerName} onChange={(e) => patch({ providerName: e.target.value })} placeholder="Okta" /></Field>
          </div>

          {value.protocol === 'oidc' ? (
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div className="sm:col-span-2">
                <Field label="Issuer URL" hint="e.g. https://login.microsoftonline.com/<tenant-id>/v2.0 or https://accounts.google.com">
                  <input className={inputClass} value={value.oidc.issuer} onChange={(e) => patch({ oidc: { ...value.oidc, issuer: e.target.value } })} />
                </Field>
              </div>
              <Field label="Client ID"><input className={inputClass} value={value.oidc.clientId} onChange={(e) => patch({ oidc: { ...value.oidc, clientId: e.target.value } })} /></Field>
              <Field label="Client secret" hint={value.oidc.clientSecretSet ? 'A secret is saved. Leave blank to keep it.' : 'Stored encrypted. It is never shown again.'}>
                <PasswordInput autoComplete="new-password" className={inputClass} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={value.oidc.clientSecretSet ? '••••••••' : ''} />
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 mt-4">
              <Field label="Identity provider sign-on URL"><input className={inputClass} value={value.saml.entryPoint} onChange={(e) => patch({ saml: { ...value.saml, entryPoint: e.target.value } })} /></Field>
              <Field label="Identity provider entity ID (issuer)"><input className={inputClass} value={value.saml.idpIssuer} onChange={(e) => patch({ saml: { ...value.saml, idpIssuer: e.target.value } })} /></Field>
              <Field label="Signing certificate (PEM)" hint="Paste the certificate your provider signs with.">
                <textarea rows={5} className={`${inputClass} font-mono text-xs`} value={value.saml.idpCert} onChange={(e) => patch({ saml: { ...value.saml, idpCert: e.target.value } })} />
              </Field>
            </div>
          )}

          <div className="grid gap-4 mt-4">
            <Field label="Allowed email domains" hint="Only these company email domains can sign in with SSO. Separate with commas.">
              <input className={inputClass} placeholder="yourcompany.com" value={domainText} onChange={(e) => setDomains(e.target.value)} />
            </Field>
            <Toggle
              label="Create an account on first sign-in"
              hint="Off: only people an admin has already added can sign in."
              checked={value.autoProvision}
              onChange={(v) => patch({ autoProvision: v })}
            />
          </div>

          <ErrorNote error={formError} />
          {message && <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">{message}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>Save settings</Button>
            {data.enabled ? (
              <Button variant="danger" disabled={busy} onClick={() => void submit({ enabled: false }, 'Single sign-on turned off. Password sign-in is unchanged.')}>Disable SSO</Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => void submit({ enabled: true }, 'Single sign-on is on.')}><ShieldCheck size={14} />Save and enable</Button>
            )}
          </div>
        </Card>
      </form>

      <Card title={value.protocol === 'oidc' ? 'Register with your provider' : 'Give this to your provider'}>
        <p className="text-xs text-slate-400 mb-4">Enter these values in your identity provider&apos;s application settings.</p>
        <div className="space-y-4">
          {value.protocol === 'oidc' ? (
            <CopyField label="Redirect URI" value={data.registration.oidcRedirectUri} />
          ) : (
            <>
              <CopyField label="ACS / reply URL" value={data.registration.samlAcsUrl} />
              <CopyField label="Entity ID / audience" value={data.registration.samlEntityId} />
              <CopyField label="Metadata URL" value={data.registration.samlMetadataUrl} />
              <p className="text-xs text-slate-400">Use the email address as the NameID, or send an <code>email</code> attribute.</p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------- Outgoing mail
const MailForm = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<MailSettings>('/admin/company/mail'), []);
  const [form, setForm] = useState<MailSettings | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const value = form ?? data;
  const patch = (changes: Partial<MailSettings>) => setForm({ ...value, ...changes });

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      await action();
      await reload();
      setMessage(done);
    } catch (err) {
      setFormError(errorMessage(err));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    await apiSend('PUT', '/admin/company/mail', {
      host: value.host, port: value.port, secure: value.secure, username: value.username,
      password, fromName: value.fromName, fromEmail: value.fromEmail
    });
    setForm(null);
    setPassword('');
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <form className="lg:col-span-2 space-y-6" onSubmit={(e) => { e.preventDefault(); void run(save, 'Mail settings saved. Send a test email, then turn it on.'); }}>
        <Card title="Company email" actions={<Badge tone={data.enabled ? 'green' : 'slate'}>{data.enabled ? 'Sending from your mailbox' : 'Using platform sender'}</Badge>}>
          <p className="text-sm text-slate-500 mb-5">
            Send sign-in codes, password resets, attendance, leave and approval emails from your own mailbox instead of the platform&apos;s.
            Use an app password if your provider requires one (Gmail, Microsoft 365, Zoho…).
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2"><Field label="SMTP server"><input className={inputClass} placeholder="smtp.office365.com" value={value.host} onChange={(e) => patch({ host: e.target.value })} /></Field></div>
            <Field label="Port"><input type="number" className={inputClass} value={value.port} onChange={(e) => patch({ port: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-4">
            <Toggle label="Use SSL/TLS from the start (port 465)" hint="Leave off for port 587; the connection is still encrypted (STARTTLS)." checked={value.secure} onChange={(v) => patch({ secure: v, port: v ? 465 : 587 })} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <Field label="Email address / username"><input className={inputClass} autoComplete="off" value={value.username} onChange={(e) => patch({ username: e.target.value })} placeholder="hr@yourcompany.com" /></Field>
            <Field label="Password" hint={value.passwordSet ? 'A password is saved. Leave blank to keep it.' : 'Stored encrypted. It is never shown again.'}>
              <PasswordInput autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={value.passwordSet ? '••••••••' : ''} />
            </Field>
            <Field label="Sender name"><input className={inputClass} value={value.fromName} onChange={(e) => patch({ fromName: e.target.value })} placeholder="Acme HR" /></Field>
            <Field label="Sender email address" hint="Must be allowed by your mail provider."><input type="email" className={inputClass} value={value.fromEmail} onChange={(e) => patch({ fromEmail: e.target.value })} placeholder="hr@yourcompany.com" /></Field>
          </div>

          <ErrorNote error={formError} />
          {message && <p role="status" className="mt-4 text-sm font-semibold text-emerald-700">{message}</p>}
          {data.lastTestAt && (
            <p className="mt-4 text-xs text-slate-400">
              Last test: {data.lastTestOk ? 'sent' : 'failed'} · {formatDateTime(data.lastTestAt)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>Save settings</Button>
            <Button variant="secondary" disabled={busy || !data.host || !data.fromEmail || form !== null} onClick={() => void run(() => apiSend('POST', '/admin/company/mail/test', {}), 'Test email sent to your address.')}>
              <Mail size={14} />Send test email
            </Button>
            {data.enabled ? (
              <Button variant="danger" disabled={busy} onClick={() => void run(() => apiSend('PUT', '/admin/company/mail', { enabled: false }), 'Switched back to the platform sender.')}>Turn off</Button>
            ) : (
              <Button variant="secondary" disabled={busy || !data.lastTestOk || form !== null} onClick={() => void run(() => apiSend('PUT', '/admin/company/mail', { enabled: true }), 'Emails now go out from your mailbox.')}>
                <ShieldCheck size={14} />Turn on
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400">Save first, then send a test email; it can only be turned on after a test succeeds. If your mailbox later stops working, sign-in codes will fail, so keep the platform sender in mind as a fallback by turning this off.</p>
        </Card>
      </form>
    </div>
  );
};

// Only shown to a company whose plan includes it; the platform administrator switches it on
const MailTab = () => {
  const { data, error, loading } = useAsync(() => apiJson<CompanyRecord>('/admin/company'), []);
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  if (!data.features.customEmail) {
    return (
      <Card title="Company email" actions={<Badge tone="slate">Not in your plan</Badge>}>
        <p className="text-sm text-slate-500">Sending sign-in codes and notifications from your own email address is an optional feature. Ask the platform administrator to enable it for your company.</p>
      </Card>
    );
  }
  return <MailForm />;
};

// ---------------------------------------------------------------- Support access
const SupportTab = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<SupportGrant[]>('/admin/support-access'), []);
  const [hours, setHours] = useState('24');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await apiSend('POST', '/admin/support-access', { hours: Number(hours), reason });
      setReason('');
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    try { await apiSend('POST', `/admin/support-access/${id}/revoke`); await reload(); } catch (err) { setFormError(errorMessage(err)); }
  };

  return (
    <div className="space-y-6">
      <Card title="Temporary support access">
        <p className="text-sm text-slate-500 mb-4">
          By default our platform team sees only your company profile, plan, usage and status. Salary, bank details and government IDs stay
          masked. If you ask for help that needs them, you can allow temporary access here. It ends automatically, you can end it sooner, and every
          view is recorded in your audit log.
        </p>
        <form onSubmit={grant} className="grid sm:grid-cols-[8rem_1fr_auto] gap-3 items-end">
          <Field label="Hours"><input type="number" min={1} max={168} className={inputClass} value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
          <Field label="What is it for?"><input required className={inputClass} placeholder="e.g. Help with a payroll issue" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button type="submit" disabled={busy}>Grant access</Button>
        </form>
        <ErrorNote error={formError} />
      </Card>

      <Card title="Access history" flush>
        <ErrorNote error={error} />
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>Support access has never been granted.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Status</Th><Th>Reason</Th><Th>Granted by</Th><Th>Expires</Th><Th>Views</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((g) => (
                  <tr key={g.id}>
                    <td className="px-6 py-3"><Badge tone={g.active ? 'amber' : 'slate'}>{g.active ? 'Active' : g.revokedAt ? 'Revoked' : 'Expired'}</Badge></td>
                    <td className="px-6 py-3 text-sm text-slate-700">{g.reason}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">{g.grantedByName}</td>
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(g.expiresAt)}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">{g.views}</td>
                    <td className="px-6 py-3 text-right">{g.active && <Button small variant="danger" onClick={() => void revoke(g.id)}>End access</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const CompanySettings = () => {
  const [tab, setTab] = useState<TabId>('details');
  return (
    <div className="space-y-6">
      <PageHeader title="Company settings" subtitle="Your company profile, workspace address, single sign-on, email and support access." />
      <Tabs
        tabs={[{ id: 'details', label: 'Company & domain' }, { id: 'sso', label: 'Single sign-on' }, { id: 'mail', label: 'Email' }, { id: 'support', label: 'Support access' }]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'details' && <DetailsTab />}
      {tab === 'sso' && <SsoTab />}
      {tab === 'mail' && <MailTab />}
      {tab === 'support' && <SupportTab />}
    </div>
  );
};

export default CompanySettings;
