import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiSend } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { MODULES } from '../../lib/permissions';
import { Button, Card, ErrorNote, Field, PageHeader, Spinner, inputClass } from '../../components/ui';
import { ModuleBoxes, usePortalStats } from './shared';
import AddressChoice from './AddressChoice';

/** Onboard a client company: profile, plan, modules, and an optional first admin who is emailed an invitation. */
const PortalOnboard = () => {
  const navigate = useNavigate();
  const stats = usePortalStats();
  const [form, setForm] = useState({
    name: '', slug: '', contactName: '', contactEmail: '', contactPhone: '', plan: 'trial', seatLimit: '',
    dedicated: false, dedicatedTouched: false, modules: [...MODULES] as string[], customLogo: false, customEmail: false, adminName: '', adminEmail: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes });
  // Paid business and enterprise clients get their own address unless the platform chooses otherwise
  const dedicated = form.dedicatedTouched ? form.dedicated : form.plan === 'business' || form.plan === 'enterprise';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<{ id: string }>('POST', '/platform/companies', {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        primaryContact: { name: form.contactName, email: form.contactEmail, phone: form.contactPhone },
        plan: form.plan,
        dedicatedAddress: form.plan !== 'trial' && dedicated,
        ...(form.seatLimit ? { seatLimit: Number(form.seatLimit) } : {}),
        modules: form.modules,
        features: { customLogo: form.customLogo, customEmail: form.customEmail },
        ...(form.adminEmail ? { firstAdmin: { name: form.adminName, email: form.adminEmail } } : {})
      });
      navigate(`/portal/clients/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (!stats.data) return stats.error ? <ErrorNote error={stats.error} /> : <Spinner />;
  const plans = stats.data.plans;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Onboard client" subtitle="Create the company, pick a plan and invite its first admin." />
      <form onSubmit={submit} className="space-y-6">
        <Card title="Company">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Company name"><input required className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Primary contact"><input className={inputClass} value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
            <Field label="Contact email"><input type="email" className={inputClass} value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></Field>
            <Field label="Contact phone"><input className={inputClass} value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></Field>
          </div>
        </Card>
        <Card title="Plan & modules">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Plan">
                <select className={inputClass} value={form.plan} onChange={(e) => set({ plan: e.target.value })}>
                  {Object.entries(plans).map(([id, p]) => <option key={id} value={id}>{p.label} ({p.seats} seats)</option>)}
                </select>
              </Field>
              <Field label="Seat limit" hint="Defaults to the plan's seats."><input type="number" min={1} className={inputClass} value={form.seatLimit} onChange={(e) => set({ seatLimit: e.target.value })} /></Field>
            </div>
            <Field label="Enabled modules"><ModuleBoxes value={form.modules} onChange={(modules) => set({ modules })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.customLogo} onChange={(e) => set({ customLogo: e.target.checked })} />Custom company logo (they can upload their own instead of ours)</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.customEmail} onChange={(e) => set({ customEmail: e.target.checked })} />Own sender email (their admin can send OTPs and notifications from their own mailbox)</label>
          </div>
        </Card>
        <Card title="Sign-in address">
          <AddressChoice
            plan={form.plan} dedicated={dedicated} onDedicated={(on) => set({ dedicated: on, dedicatedTouched: true })}
            slug={form.slug} onSlug={(slug) => set({ slug })} shared={stats.data.addresses?.shared ?? 'crm'} base={stats.data.addresses?.baseDomain ?? ''}
          />
          {!(dedicated && form.plan !== 'trial') && <p className="mt-3 text-xs text-slate-500">A short name is still created from the company name to identify the client; it is not used as an address.</p>}
        </Card>
        <Card title="First admin (optional)">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name"><input className={inputClass} value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} /></Field>
            <Field label="Email" hint="We email an invitation to set a password."><input type="email" className={inputClass} value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} /></Field>
          </div>
        </Card>
        <ErrorNote error={error} />
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create client'}</Button>
          <Button variant="secondary" onClick={() => navigate('/portal/clients')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
};

export default PortalOnboard;
