import { useState } from 'react';
import { apiJson, apiSend } from '../lib/api';
import { errorMessage, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, Th, inputClass, statusTone } from '../components/ui';
import type { User } from '../types';

export interface DeleteRequestRecord {
  id: string;
  targetType: string;
  targetLabel: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedByName: string;
  decidedByName: string;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
}

export const TARGET_LABELS: Record<string, string> = {
  company: 'Company account', user: 'Employee', department: 'Department', announcement: 'Announcement',
  checklistTemplate: 'Checklist template', checklist: 'Checklist', holiday: 'Public holiday'
};

type Filter = 'all' | 'Pending' | 'Approved' | 'Rejected';

/** Company admins cannot delete directly: they raise a request here, and the platform Super Admin decides. */
const DeleteRequests = ({ user }: { user: User }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const { data, error, loading, reload } = useAsync(
    () => apiJson<DeleteRequestRecord[]>(`/admin/delete-requests${filter === 'all' ? '' : `?status=${filter}`}`),
    [filter]
  );
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const requestCompanyDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await apiSend('POST', '/admin/delete-requests', { targetType: 'company', reason });
      setAsking(false);
      setReason('');
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delete requests"
        subtitle="Admins can't delete records directly. A request goes to the platform's Super Admin, who approves or rejects it. Every step is in the audit log."
        actions={user.role === 'SUPER_ADMIN' ? <Button variant="danger" onClick={() => setAsking(true)}>Request company deletion</Button> : undefined}
      />
      <Tabs
        tabs={[{ id: 'all', label: 'All' }, { id: 'Pending', label: 'Pending' }, { id: 'Approved', label: 'Approved' }, { id: 'Rejected', label: 'Rejected' }]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorNote error={error} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>No delete requests.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Record</Th><Th>Requested by</Th><Th>Reason</Th><Th>Status</Th><Th>Decision</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3"><p className="text-sm font-bold text-slate-900">{r.targetLabel}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{TARGET_LABELS[r.targetType] ?? r.targetType}</p></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.requestedByName}<span className="block text-xs text-slate-400">{formatDateTime(r.createdAt)}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.reason || '—'}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="px-6 py-3 text-sm text-slate-600">
                      {r.status === 'Pending' ? <span className="text-slate-400">Waiting for the Super Admin</span> : (
                        <>{r.decidedByName}<span className="block text-xs text-slate-400">{formatDateTime(r.decidedAt)}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</span></>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={asking} title="Request company deletion" onClose={() => setAsking(false)}>
        <form onSubmit={requestCompanyDeletion} className="space-y-4">
          <p className="text-sm text-slate-500">
            This asks the platform to close your whole company account. Nothing is deleted until the Super Admin approves, and you can follow the status here.
          </p>
          <Field label="Why do you want to close the account?"><textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <ErrorNote error={formError} />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={busy}>Send request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default DeleteRequests;
