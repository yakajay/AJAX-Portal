import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, ErrorNote, Field, PageHeader, Spinner, Th, inputClass } from '../../components/ui';
import { ModuleBoxes, statusTone, useCan, usePortalStats, type CompanySummary } from './shared';

interface EmployeeRow {
  id: string; name: string; email: string; role: string; department: string; designation: string;
  sensitive: { bankName: string | null; bankAccount: string | null; bankIfsc: string | null; governmentId: string | null; taxId: string | null; monthlyGross: string | number | null; currency: string | null };
}
interface EmployeeView { unmasked: boolean; accessExpiresAt: string | null; employees: EmployeeRow[] }

/** One client company: status, plan and modules, admin invitations and (under support access) its people. */
const PortalClientDetail = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stats = usePortalStats();
  const canEdit = useCan('admin');
  const plans = stats.data?.plans ?? {};
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

  if (loading && !data) return <Spinner />;
  if (!data) return <div className="space-y-4"><ErrorNote error={error} /><Button variant="secondary" onClick={() => navigate('/portal/clients')}>Back to clients</Button></div>;
  const startEdit = () => setEdit({ plan: data.subscription.plan, seatLimit: String(data.subscription.seatLimit), modules: data.modules, customLogo: data.features.customLogo, customEmail: !!data.features.customEmail, contactName: data.primaryContact.name, contactEmail: data.primaryContact.email });

  return (
    <div className="space-y-6">
      <Link to="/portal/clients" className="inline-flex items-center gap-1 text-sm font-bold text-blue-800 hover:underline"><ChevronLeft size={16} />All clients</Link>
      <PageHeader title={data.name} subtitle={`${data.domain} · client details`} />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={statusTone(data.status)}>{data.status}</Badge>
          <a href={data.origin} target="_blank" rel="noreferrer" className="font-mono text-sm text-blue-700">{data.domain}</a>
          <span className="text-xs text-slate-400">{data.usage.employees} / {data.usage.seatLimit} seats · last active {data.usage.lastActiveAt ? formatDateTime(data.usage.lastActiveAt) : 'never'}</span>
        </div>
        {data.statusReason && <p className="text-sm text-slate-500">Reason: {data.statusReason}</p>}
        <ErrorNote error={actionError} />
        {notice && <p role="status" className="text-sm font-semibold text-emerald-700">{notice}</p>}

        {canEdit && <div className="flex flex-wrap gap-2">
          {data.status !== 'active' && <Button small onClick={() => changeStatus('active')} disabled={busy}>Activate</Button>}
          {data.status === 'active' && <Button small variant="secondary" onClick={() => changeStatus('suspended')} disabled={busy}>Suspend</Button>}
          {data.status !== 'inactive' && <Button small variant="danger" onClick={() => changeStatus('inactive')} disabled={busy}>Deactivate</Button>}
        </div>}

        <Card title="Subscription & modules" actions={canEdit && !edit && <Button small variant="secondary" onClick={startEdit}>Edit</Button>}>
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
              <div><dt className="text-xs font-extrabold text-slate-400">Plan</dt><dd className="text-slate-800">{plans[data.subscription.plan]?.label ?? data.subscription.plan}</dd></div>
              <div><dt className="text-xs font-extrabold text-slate-400">Primary contact</dt><dd className="text-slate-800">{data.primaryContact.name || '—'} {data.primaryContact.email && `· ${data.primaryContact.email}`}</dd></div>
              <div><dt className="text-xs font-extrabold text-slate-400">Custom logo</dt><dd className="text-slate-800">{data.features.customLogo ? 'Enabled' : 'Not enabled'}</dd></div>
              <div><dt className="text-xs font-extrabold text-slate-400">Own sender email</dt><dd className="text-slate-800">{data.features.customEmail ? 'Enabled' : 'Not enabled'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-extrabold text-slate-400">Modules</dt><dd className="flex flex-wrap gap-2 mt-1">{data.modules.map((m) => <Badge key={m} tone="blue">{m}</Badge>)}</dd></div>
            </dl>
          )}
        </Card>

        {canEdit && <Card title="Invite a company admin">
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
        </Card>}

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
    </div>
  );
};


export default PortalClientDetail;
