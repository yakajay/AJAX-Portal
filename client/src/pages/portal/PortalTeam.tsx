import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, StatTile, Tabs, Th, inputClass } from '../../components/ui';
import { useMyPortalLevel } from './shared';

type Role = 'viewer' | 'admin' | 'super';
const ROLE_LABEL: Record<Role, string> = { viewer: 'Portal Viewer', admin: 'Portal Admin', super: 'Portal Super Admin' };
const ROLE_HINT: Record<Role, string> = {
  viewer: 'View only: track clients and plans. No changes.',
  admin: 'Manage clients: profiles, plans, admins. Cannot delete.',
  super: 'Everything, including deleting and the platform team.'
};

interface Member { id: string; name: string; email: string; team: string; title: string; role: Role; locked: boolean; createdAt: string }
interface AccessRequest {
  id: string; name: string; email: string; phone: string; employeeId: string; title: string; team: string; manager: string;
  wantedRole: Role; reason: string; status: 'Pending' | 'Approved' | 'Rejected'; grantedRole: Role | null; note: string;
  decidedByName: string; decidedAt: string | null; createdAt: string;
}
type Tab = 'requests' | 'team' | 'all';

/** Who can use the client portal and what they can do. Portal Super Admins approve requests and set roles. */
const PortalTeam = () => {
  const me = useMyPortalLevel();
  const { data, error, loading, reload } = useAsync(() => apiJson<{ members: Member[]; requests: AccessRequest[] }>('/platform/team'), []);
  const [tab, setTab] = useState<Tab>('requests');
  const [roles, setRoles] = useState<Record<string, Role>>({}); // role chosen per pending request
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setNotice(null);
    setActionError(null);
    try {
      await fn();
      setNotice(done);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (me !== 'super') return <Card title="Portal Super Admins only"><p className="text-sm text-slate-600">Only a Portal Super Admin can manage the platform team.</p></Card>;
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;

  const pending = data.requests.filter((r) => r.status === 'Pending');
  const decided = data.requests.filter((r) => r.status !== 'Pending');
  const active = data.members.filter((m) => !m.locked);

  const approve = (r: AccessRequest) => {
    const role = roles[r.id] ?? r.wantedRole;
    void run(r.id, () => apiSend('PATCH', `/platform/team/requests/${r.id}`, { decision: 'approve', role }), `${r.name} approved as ${ROLE_LABEL[role]}. They were emailed how to set a password.`);
  };
  const reject = (r: AccessRequest) => {
    const note = window.prompt(`Why are you rejecting ${r.name}? They will see your answer.`);
    if (!note) return;
    void run(r.id, () => apiSend('PATCH', `/platform/team/requests/${r.id}`, { decision: 'reject', note }), `${r.name} was rejected.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform team"
        subtitle="Who can use the client portal, and what they can do"
        actions={<Link to="/portal-signup" className="inline-flex items-center min-h-11 px-5 rounded-[10px] border-[1.5px] border-blue-600 text-blue-800 font-bold text-[15px] hover:bg-blue-50">View sign-up page</Link>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Waiting for approval" value={pending.length} />
        <StatTile label="Active members" value={active.length} />
        <StatTile label="Portal Super Admins" value={active.filter((m) => m.role === 'super').length} />
        <StatTile label="Disabled" value={data.members.length - active.length} />
      </div>
      <Tabs<Tab> tabs={[{ id: 'requests', label: 'Requests', badge: pending.length }, { id: 'team', label: 'Team' }, { id: 'all', label: 'Decided' }]} value={tab} onChange={setTab} />
      {notice && <p role="status" className="text-sm font-semibold text-emerald-700">{notice}</p>}
      <ErrorNote error={actionError} />

      {tab === 'requests' && (
        pending.length === 0 ? <Card><Empty>No sign-up requests waiting. New requests from the sign-up page appear here.</Empty></Card> : (
          <div className="space-y-4">
            {pending.map((r) => (
              <Card key={r.id} title={r.name} actions={<Badge tone="amber">Asked for {ROLE_LABEL[r.wantedRole]}</Badge>}>
                <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs font-extrabold text-slate-400">Work email</dt><dd className="text-slate-800">{r.email}</dd></div>
                  <div><dt className="text-xs font-extrabold text-slate-400">Role · team</dt><dd className="text-slate-800">{r.title} · {r.team}</dd></div>
                  <div><dt className="text-xs font-extrabold text-slate-400">Phone</dt><dd className="text-slate-800">{r.phone}</dd></div>
                  <div><dt className="text-xs font-extrabold text-slate-400">Employee ID</dt><dd className="text-slate-800">{r.employeeId}</dd></div>
                  <div><dt className="text-xs font-extrabold text-slate-400">Manager</dt><dd className="text-slate-800">{r.manager}</dd></div>
                  <div><dt className="text-xs font-extrabold text-slate-400">Requested</dt><dd className="text-slate-800">{formatDateTime(r.createdAt)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-xs font-extrabold text-slate-400">Reason</dt><dd className="text-slate-800">{r.reason}</dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <select aria-label={`Role for ${r.name}`} className={`${inputClass} w-56`} value={roles[r.id] ?? r.wantedRole} onChange={(e) => setRoles({ ...roles, [r.id]: e.target.value as Role })}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                  </select>
                  <Button disabled={busy === r.id} aria-label={`Approve ${r.name}`} onClick={() => approve(r)}>Approve</Button>
                  <Button variant="secondary" disabled={busy === r.id} aria-label={`Reject ${r.name}`} onClick={() => reject(r)}>Reject</Button>
                </div>
                <p className="mt-2 text-xs text-slate-500">{ROLE_HINT[roles[r.id] ?? r.wantedRole]}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === 'team' && (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Member</Th><Th>Team</Th><Th>Portal role</Th><Th>Status</Th><Th>Since</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3"><p className="font-bold text-slate-900">{m.name}</p><p className="text-xs text-slate-400">{m.email}</p></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{m.team || '—'}</td>
                    <td className="px-6 py-3">
                      <select
                        aria-label={`Portal role for ${m.name}`}
                        className={`${inputClass} w-52`}
                        value={m.role}
                        disabled={busy === m.id}
                        onChange={(e) => void run(m.id, () => apiSend('PATCH', `/platform/team/${m.id}`, { role: e.target.value }), `${m.name} is now ${ROLE_LABEL[e.target.value as Role]}. It applies at their next sign-in.`)}
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-3"><Badge tone={m.locked ? 'slate' : 'green'}>{m.locked ? 'Disabled' : 'Active'}</Badge></td>
                    <td className="px-6 py-3 text-xs text-slate-500">{formatDateTime(m.createdAt)}</td>
                    <td className="px-6 py-3 text-right">
                      <Button small variant={m.locked ? 'secondary' : 'danger'} disabled={busy === m.id} onClick={() => void run(m.id, () => apiSend('PATCH', `/platform/team/${m.id}`, { locked: !m.locked }), m.locked ? `${m.name} can sign in again.` : `${m.name} was disabled and signed out.`)}>
                        {m.locked ? 'Enable' : 'Disable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'all' && (
        <Card flush>
          {!decided.length ? <Empty>No decisions yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50"><tr><Th>Person</Th><Th>Outcome</Th><Th>Decided by</Th><Th>Note</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {decided.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-3"><p className="font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-400">{r.email}</p></td>
                      <td className="px-6 py-3"><Badge tone={r.status === 'Approved' ? 'green' : 'rose'}>{r.status === 'Approved' && r.grantedRole ? `Approved · ${ROLE_LABEL[r.grantedRole]}` : r.status}</Badge></td>
                      <td className="px-6 py-3 text-sm text-slate-600">{r.decidedByName}<span className="block text-xs text-slate-400">{formatDateTime(r.decidedAt)}</span></td>
                      <td className="px-6 py-3 text-sm text-slate-600">{r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default PortalTeam;
