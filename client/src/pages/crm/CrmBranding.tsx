import { useEffect, useState } from 'react';
import { apiFetch, apiJson, apiSend, readError } from '../../lib/api';
import { loadWorkspace } from '../../lib/workspace';
import { errorMessage } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, ErrorNote, Field, PageHeader, Spinner, inputClass } from '../../components/ui';

interface CompanyRecord {
  name: string;
  features: { customLogo: boolean };
  branding?: { displayName: string; showPoweredBy: boolean };
  logoUpdatedAt: string | null;
}
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 256 * 1024;

/** The company's logo and name as employees see them in the HRMS portal and the CRM (a feature the platform enables per company). */
const CrmBranding = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<CompanyRecord>('/admin/company'), []);
  const [name, setName] = useState('');
  const [powered, setPowered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.branding?.displayName || data.name);
    setPowered(data.branding?.showPoweredBy !== false);
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const hasLogo = !!data.logoUpdatedAt;

  const applied = async (message: string) => {
    setNotice(message);
    await loadWorkspace(true);
    await reload();
    window.location.reload(); // header, menu and login pick up the change
  };
  const guard = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      await applied(message);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | undefined) => {
    if (!file) return;
    setActionError(null);
    if (!LOGO_TYPES.includes(file.type)) return setActionError('Choose a PNG, JPEG or WebP image.');
    if (file.size > MAX_LOGO_BYTES) return setActionError('The logo must be 256 KB or smaller.');
    void guard(async () => {
      const res = await apiFetch('/admin/company/logo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
    }, 'Logo updated.');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Branding" subtitle="Your company's logo and name in the HRMS portal and CRM" />
      {!data.features.customLogo ? (
        <Card title="Custom branding is off for your workspace" actions={<Badge tone="slate">Not enabled</Badge>}>
          <p className="text-sm text-slate-600">Your employees currently see Ajax HRMS. To show your own logo and company name instead, ask your Ajax account manager to turn on custom branding. Once it's on, you can upload your logo here.</p>
          <a className="mt-4 inline-flex items-center min-h-11 px-5 rounded-[10px] bg-blue-600 text-white font-bold text-[15px] hover:bg-blue-700" href="mailto:support@ajaxhrms.com?subject=Enable%20custom%20branding">Email Ajax support</a>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Your brand" actions={<Badge tone="green">Included</Badge>}>
            <form
              className="space-y-5"
              onSubmit={(e) => { e.preventDefault(); void guard(() => apiSend('PUT', '/admin/company/branding', { displayName: name, showPoweredBy: powered }), 'Branding saved.'); }}
            >
              <Field label="Company name shown to employees" hint={`${name.length} / 40 characters`}>
                <input required maxLength={40} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <div className="space-y-2">
                <span className="block text-[13px] font-bold text-slate-600">Logo</span>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-40 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {hasLogo ? <img src={`/api/auth/logo?v=${data.logoUpdatedAt}`} alt="Your logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">No logo yet</span>}
                  </div>
                  <label className="inline-flex items-center min-h-11 px-4 rounded-[10px] border-[1.5px] border-blue-600 text-blue-800 font-bold text-sm cursor-pointer hover:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-500">
                    {hasLogo ? 'Replace logo' : 'Upload logo'}
                    <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
                  </label>
                  {hasLogo && <Button variant="secondary" disabled={busy} onClick={() => void guard(() => apiSend('DELETE', '/admin/company/logo'), 'Logo removed.')}>Remove</Button>}
                </div>
                <p className="text-xs text-slate-500">PNG, JPEG or WebP, up to 256 KB. A wide logo on a transparent background works best.</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={powered} onChange={(e) => setPowered(e.target.checked)} />Show "Powered by Ajax HRMS" under your name
              </label>
              <ErrorNote error={actionError} />
              {notice && <p role="status" className="text-sm font-semibold text-emerald-700">{notice}</p>}
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save and apply'}</Button>
            </form>
          </Card>
          <Card title="Preview">
            <div className="rounded-xl border border-slate-200 p-4 flex items-center gap-3 bg-white">
              {hasLogo
                ? <img src={`/api/auth/logo?v=${data.logoUpdatedAt}`} alt="" className="h-10 max-w-[10rem] object-contain" />
                : <div className="w-10 h-10 rounded-[10px] bg-blue-600 text-white flex items-center justify-center font-extrabold text-xl">{(name || 'A').charAt(0).toUpperCase()}</div>}
              <div className="flex flex-col leading-tight">
                <span className="font-extrabold text-lg text-slate-900">{name || 'Your company'}</span>
                <span className="text-xs text-slate-500">CRM · Admin console</span>
                {powered && <span className="text-[11px] text-slate-400">Powered by Ajax HRMS</span>}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">This is how the top bar looks to your employees once you save.</p>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CrmBranding;
