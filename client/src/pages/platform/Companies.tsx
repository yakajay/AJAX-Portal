import { useState } from 'react';
import { Building2, Plus, Users, Hourglass, Eye, EyeOff } from 'lucide-react';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { MODULES } from '../../lib/permissions';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, StatTile, Th, inputClass } from '../../components/ui';

type Status = 'active' | 'suspended' | 'inactive' | 'deleted';
interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  domain: string;
  origin: string;
  status: Status;
  statusReason: string;
  primaryContact: { name: string; email: string; phone: string };
  subscription: { plan: string; seatLimit: number; expiresAt: string | null };
  modules: string[];
  features: { customLogo: boolean; customEmail: boolean };
  usage: { employees: number; admins: number; seatLimit: number; lastActiveAt: string | null };
  pendingDeleteRequests?: number;
  supportAccess?: { active: boolean; expiresAt?: string; reason?: string };
}
interface Stats {
  companies: Record<Status, number>;
  employees: number;
  pendingDeleteRequests: number;
  plans: Record<string, { label: string; seats: number }>;
}
interface EmployeeRow {
  id: string; name: string; email: string; role: string; department: string; designation: string;
  sensitive: { bankName: string | null; bankAccount: string | null; bankIfsc: string | null; governmentId: string | null; taxId: string | null; monthlyGross: string | number | null; currency: string | null };
}
interface EmployeeView { unmasked: boolean; accessExpiresAt: string | null; employees: EmployeeRow[] }

const statusTone = (s: Status) => (s === 'active' ? 'green' : s === 'suspended' ? 'amber' : 'slate');

const ModuleBoxes = ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {MODULES.map((m) => (
      <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value.includes(m)} onChange={(e) => onChange(e.target.checked ? [...value, m] : value.filter((x) => x !== m))} />
        {m}
      </label>
    ))}
  </div>
);

// ---------------------------------------------------------------- Onboard a company
const CreateCompany = ({ plans, onClose, onCreated }: { plans: Stats['plans']; onClose: () => void; onCreated: () => void }) => {
  const [form, setForm] = useState({
    name: '', slug: '', contactName: '', contactEmail: '', contactPhone: '', plan: 'trial', seatLimit: '',
    modules: [...MODULES] as string[], customLogo: false, customEmail: false, adminName: '', adminEmail: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (changes: Partial<typeof form>) => setForm({ ...form, ...changes });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/platform/companies', {
        name: form.name,
        ...(form.slug ? { slug: form.slug } : {}),
        primaryContact: { name: form.contactName, email: form.contactEmail, phone: form.contactPhone },
        plan: form.plan,
        ...(form.seatLimit ? { seatLimit: Number(form.seatLimit) } : {}),
        modules: form.modules,
        features: { customLogo: form.customLogo, customEmail: form.customEmail },
        ...(form.adminEmail ? { firstAdmin: { name: form.adminName, email: form.adminEmail } } : {})
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Onboard a company" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name"><input required className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Subdomain" hint="Leave blank to create one from the name."><input className={inputClass} placeholder="acme" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase() })} /></Field>
          <Field label="Primary contact"><input className={inputClass} value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
          <Field label="Contact email"><input type="email" className={inputClass} value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></Field>
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
        <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">First admin (optional)</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name"><input className={inputClass} value={form.adminName} onChange={(e) => set({ adminName: e.target.value })} /></Field>
            <Field label="Email" hint="We email an invitation to set a password."><input type="email" className={inputClass} value={form.adminEmail} onChange={(e) => set({ adminEmail: e.target.value })} /></Field>
          </div>
        </div>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create company'}</Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------- One company
const CompanyDetail = ({ id, plans, onClose, onChanged }: { id: string; plans: Stats['plans']; onClose: () => void; onChanged: () => void }) => {
  const { data, error, loading, reload } = useAsync(() => apiJson<CompanySummary>(`/platform/companies/${id}`), [id]);
  const [edit, setEdit] = useState<{ plan: string; seatLimit: string; modules: string[]; customLogo: boolean; customEmail: boolean; contactName: string; contactEmail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [admin, setAdmin] = useState({ name: '', email: '' });
  const [people, setPeople] = useState<EmployeeView | null>(null);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      await reload();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status: 'active' | 'suspended' | 'inactive') => {
    let reason = '';
    if (status !== 'active') {
      const answer = window.prompt(`Why is this company being ${status === 'suspended' ? 'suspended' : 'deactivated'}? Everyone is signed out straight away.`);
      if (!answer) return;
      reason = answer;
    }
    void run(() => apiSend('PATCH', `/platform/companies/${id}/status`, { status, reason }), status === 'active' ? 'Company activated.' : 'Status updated.');
  };

  const loadPeople = () => run(async () => setPeople(await apiJson<EmployeeView>(`/platform/companies/${id}/employees`)));

  if (loading && !data) return <Modal open title="Company" onClose={onClose}><Spinner /></Modal>;
  if (!data) return <Modal open title="Company" onClose={onClose}><ErrorNote error={error} /></Modal>;
  const startEdit = () => setEdit({ plan: data.subscription.plan, seatLimit: String(data.subscription.seatLimit), modules: data.modules, customLogo: data.features.customLogo, customEmail: !!data.features.customEmail, contactName: data.primaryContact.name, contactEmail: data.primaryContact.email });

  return (
    <Modal open title={data.name} onClose={onClose} wide>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={statusTone(data.status)}>{data.status}</Badge>
          <a href={data.origin} target="_blank" rel="noreferrer" className="font-mono text-sm text-blue-700">{data.domain}</a>
          <span className="text-xs text-slate-400">{data.usage.employees} / {data.usage.seatLimit} seats · last active {data.usage.lastActiveAt ? formatDateTime(data.usage.lastActiveAt) : 'never'}</span>
        </div>
        {data.statusReason && <p className="text-sm text-slate-500">Reason: {data.statusReason}</p>}
        <ErrorNote error={actionError} />
        {notice && <p role="status" className="text-sm font-semibold text-emerald-700">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          {data.status !== 'active' && <Button small onClick={() => changeStatus('active')} disabled={busy}>Activate</Button>}
          {data.status === 'active' && <Button small variant="secondary" onClick={() => changeStatus('suspended')} disabled={busy}>Suspend</Button>}
          {data.status !== 'inactive' && <Button small variant="danger" onClick={() => changeStatus('inactive')} disabled={busy}>Deactivate</Button>}
        </div>

        <Card title="Subscription & modules" actions={!edit && <Button small variant="secondary" onClick={startEdit}>Edit</Button>}>
          {edit ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await apiSend('PUT', `/platform/companies/${id}`, {
                    plan: edit.plan, seatLimit: Number(edit.seatLimit), modules: edit.modules, features: { customLogo: edit.customLogo, customEmail: edit.customEmail },
                    primaryContact: { name: edit.contactName, email: edit.contactEmail, phone: data.primaryContact.phone }
                  });
                  setEdit(null);
                }, 'Saved.');
              }}
            >
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Plan"><select className={inputClass} value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value, seatLimit: String(plans[e.target.value]?.seats ?? edit.seatLimit) })}>{Object.entries(plans).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
                <Field label="Seat limit"><input type="number" min={1} className={inputClass} value={edit.seatLimit} onChange={(e) => setEdit({ ...edit, seatLimit: e.target.value })} /></Field>
                <Field label="Contact name"><input className={inputClass} value={edit.contactName} onChange={(e) => setEdit({ ...edit, contactName: e.target.value })} /></Field>
                <Field label="Contact email"><input type="email" className={inputClass} value={edit.contactEmail} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} /></Field>
              </div>
              <Field label="Modules"><ModuleBoxes value={edit.modules} onChange={(modules) => setEdit({ ...edit, modules })} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={edit.customLogo} onChange={(e) => setEdit({ ...edit, customLogo: e.target.checked })} />Custom company logo</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={edit.customEmail} onChange={(e) => setEdit({ ...edit, customEmail: e.target.checked })} />Own sender email (their admin enters the mailbox that sends OTPs and notifications)</label>
              <div className="flex gap-3"><Button type="submit" disabled={busy}>Save</Button><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button></div>
            </form>
          ) : (
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs font-black uppercase tracking-widest text-slate-400">Plan</dt><dd className="text-slate-800">{plans[data.subscription.plan]?.label ?? data.subscription.plan}</dd></div>
              <div><dt className="text-xs font-black uppercase tracking-widest text-slate-400">Primary contact</dt><dd className="text-slate-800">{data.primaryContact.name || '—'} {data.primaryContact.email && `· ${data.primaryContact.email}`}</dd></div>
              <div><dt className="text-xs font-black uppercase tracking-widest text-slate-400">Custom logo</dt><dd className="text-slate-800">{data.features.customLogo ? 'Enabled' : 'Not enabled'}</dd></div>
              <div><dt className="text-xs font-black uppercase tracking-widest text-slate-400">Own sender email</dt><dd className="text-slate-800">{data.features.customEmail ? 'Enabled' : 'Not enabled'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-black uppercase tracking-widest text-slate-400">Modules</dt><dd className="flex flex-wrap gap-2 mt-1">{data.modules.map((m) => <Badge key={m} tone="blue">{m}</Badge>)}</dd></div>
            </dl>
          )}
        </Card>

        <Card title="Invite a company admin">
          <form
            className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => { await apiSend('POST', `/platform/companies/${id}/admins`, admin); setAdmin({ name: '', email: '' }); }, 'Invitation sent.');
            }}
          >
            <Field label="Name"><input className={inputClass} value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" className={inputClass} value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></Field>
            <Button type="submit" disabled={busy}>Invite</Button>
          </form>
        </Card>

        <Card
          title="Employees"
          actions={
            <Button small variant="secondary" onClick={() => (people ? setPeople(null) : void loadPeople())} disabled={busy}>
              {people ? <><EyeOff size={14} />Hide</> : <><Eye size={14} />Show</>}
            </Button>
          }
        >
          {!people ? (
            <p className="text-sm text-slate-500">
              Sensitive data is masked. {data.supportAccess?.active
                ? `The company has granted support access until ${formatDateTime(data.supportAccess.expiresAt)}: opening this list shows it unmasked, and the view is logged for them.`
                : 'To see it, the company admin must grant temporary support access.'}
            </p>
          ) : (
            <div className="space-y-3">
              <p className={`text-xs font-bold ${people.unmasked ? 'text-amber-700' : 'text-slate-500'}`}>
                {people.unmasked ? `Unmasked under the company's support access (until ${formatDateTime(people.accessExpiresAt)}). This view was recorded in their audit log.` : 'Sensitive fields are masked.'}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr><Th>Name</Th><Th>Role</Th><Th>Bank account</Th><Th>Government ID</Th><Th>Monthly gross</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {people.employees.map((p) => (
                      <tr key={p.id}>
                        <td className="px-6 py-2"><span className="font-bold text-slate-900">{p.name}</span><span className="block text-xs text-slate-400">{p.email}</span></td>
                        <td className="px-6 py-2 text-slate-600">{p.role.replace('_', ' ')}</td>
                        <td className="px-6 py-2 font-mono text-xs">{p.sensitive.bankAccount ?? '—'}</td>
                        <td className="px-6 py-2 font-mono text-xs">{p.sensitive.governmentId ?? '—'}</td>
                        <td className="px-6 py-2 font-mono text-xs">{p.sensitive.monthlyGross === null ? '—' : `${p.sensitive.currency ?? ''} ${p.sensitive.monthlyGross}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- List
const Companies = () => {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const stats = useAsync(() => apiJson<Stats>('/platform/stats'), []);
  const list = useAsync(() => apiJson<CompanySummary[]>(`/platform/companies?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`), [q, status]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => { void list.reload(); void stats.reload(); };

  return (
    <div className="space-y-6">
      <PageHeader title="Companies" subtitle="Onboard client companies, manage their plan and status. You see platform-level details only." actions={<Button onClick={() => setCreating(true)}><Plus size={14} />Onboard a company</Button>} />
      {stats.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Active companies" value={stats.data.companies.active} icon={Building2} hint={`${stats.data.companies.suspended} suspended · ${stats.data.companies.inactive} inactive`} />
          <StatTile label="Employees" value={stats.data.employees} icon={Users} />
          <StatTile label="Delete requests" value={stats.data.pendingDeleteRequests} icon={Hourglass} hint="waiting for you" />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search companies" className={`${inputClass} flex-1 min-w-56`} placeholder="Search by name or subdomain…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Filter by status" className={`${inputClass} w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All (not deleted)</option>
          <option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option><option value="deleted">Deleted</option>
        </select>
      </div>
      <ErrorNote error={list.error} />
      <Card flush>
        {list.loading && !list.data ? <Spinner /> : !list.data?.length ? <Empty>No companies yet. Onboard your first one.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Company</Th><Th>Plan</Th><Th>Seats</Th><Th>Status</Th><Th>Last active</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3"><p className="font-bold text-slate-900">{c.name}</p><p className="font-mono text-xs text-slate-400">{c.domain}</p></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{stats.data?.plans[c.subscription.plan]?.label ?? c.subscription.plan}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{c.usage.employees} / {c.usage.seatLimit}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                    <td className="px-6 py-3 text-xs text-slate-500">{c.usage.lastActiveAt ? formatDateTime(c.usage.lastActiveAt) : 'never'}</td>
                    <td className="px-6 py-3 text-right"><Button small variant="secondary" onClick={() => setOpen(c.id)}>Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && stats.data && <CreateCompany plans={stats.data.plans} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />}
      {open && stats.data && <CompanyDetail id={open} plans={stats.data.plans} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  );
};

export default Companies;
