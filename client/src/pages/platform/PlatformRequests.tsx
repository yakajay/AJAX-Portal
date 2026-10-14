import { useState } from 'react';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, Tabs, Th, statusTone } from '../../components/ui';
import { TARGET_LABELS, type DeleteRequestRecord } from '../DeleteRequests';

type PlatformRequest = DeleteRequestRecord & { company: { name: string; slug: string } | null };
type Filter = 'Pending' | 'Approved' | 'Rejected' | 'all';

/** The Super Admin's queue: approve (carries out the deletion) or reject (with a reason the company sees). */
const PlatformRequests = () => {
  const [filter, setFilter] = useState<Filter>('Pending');
  const { data, error, loading, reload } = useAsync(
    () => apiJson<PlatformRequest[]>(`/platform/delete-requests${filter === 'all' ? '' : `?status=${filter}`}`),
    [filter]
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const decide = async (r: PlatformRequest, decision: 'approve' | 'reject') => {
    let note = '';
    if (decision === 'reject') {
      const answer = window.prompt(`Why are you rejecting this? ${r.company?.name ?? 'The company'} will see your answer.`);
      if (!answer) return;
      note = answer;
    } else if (!window.confirm(`Approve and delete ${r.targetLabel} (${TARGET_LABELS[r.targetType] ?? r.targetType}) for ${r.company?.name}? This can't be undone.`)) {
      return;
    }
    setBusyId(r.id);
    setActionError(null);
    try {
      await apiSend('PATCH', `/platform/delete-requests/${r.id}`, { decision, note });
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Delete requests" subtitle="Companies can't delete records themselves. Approving carries out the deletion; both outcomes are audited and visible to the company." />
      <Tabs
        tabs={[{ id: 'Pending', label: 'Pending' }, { id: 'Approved', label: 'Approved' }, { id: 'Rejected', label: 'Rejected' }, { id: 'all', label: 'All' }]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorNote error={error ?? actionError} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>Nothing here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Company</Th><Th>Record</Th><Th>Requested</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900">{r.company?.name ?? '—'}</td>
                    <td className="px-6 py-3"><p className="text-sm font-bold text-slate-900">{r.targetLabel}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{TARGET_LABELS[r.targetType] ?? r.targetType}</p></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.requestedByName}<span className="block text-xs text-slate-400">{formatDateTime(r.createdAt)}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{r.reason || '—'}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge>{r.decisionNote && <span className="block text-xs text-slate-400 mt-1">{r.decisionNote}</span>}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {r.status === 'Pending' && (
                        <div className="flex justify-end gap-2">
                          <Button small variant="danger" disabled={busyId === r.id} onClick={() => void decide(r, 'approve')}>Approve</Button>
                          <Button small variant="secondary" disabled={busyId === r.id} onClick={() => void decide(r, 'reject')}>Reject</Button>
                        </div>
                      )}
                    </td>
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

export default PlatformRequests;
