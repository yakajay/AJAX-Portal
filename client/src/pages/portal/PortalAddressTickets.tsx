import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, Tabs, Th } from '../../components/ui';
import { ACTION_LABEL, ticketTone, useCan, type AddressTicket } from './shared';

type Filter = 'Pending' | 'Approved' | 'Rejected' | 'all';

/** Tickets for changes to a client's own sign-in address: asked for by company admins, or made by the platform. */
const PortalAddressTickets = ({ onChanged }: { onChanged?: () => void }) => {
  const [filter, setFilter] = useState<Filter>('Pending');
  const { data, error, loading, reload } = useAsync(() => apiJson<AddressTicket[]>(`/platform/address-requests${filter === 'all' ? '' : `?status=${filter}`}`), [filter]);
  const canDecide = useCan('admin');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const decide = async (t: AddressTicket, decision: 'approve' | 'reject') => {
    let note = '';
    if (decision === 'reject') {
      const answer = window.prompt(`Why are you rejecting ${t.ticketNo}? ${t.companyName} will see your answer.`);
      if (!answer) return;
      note = answer;
    } else if (!window.confirm(`Approve ${t.ticketNo}? ${t.companyName}'s sign-in address changes straight away.`)) {
      return;
    }
    setBusy(t.id);
    setActionError(null);
    try {
      await apiSend('PATCH', `/platform/address-requests/${t.id}`, { decision, note });
      await reload();
      onChanged?.();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Address tickets" subtitle="Every change to a client's own sign-in address, with who asked, why and who decided." />
      <Tabs<Filter> tabs={[{ id: 'Pending', label: 'Pending' }, { id: 'Approved', label: 'Approved' }, { id: 'Rejected', label: 'Rejected' }, { id: 'all', label: 'All' }]} value={filter} onChange={setFilter} />
      <ErrorNote error={error ?? actionError} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>No tickets here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Ticket</Th><Th>Company</Th><Th>Change</Th><Th>Asked by</Th><Th>Reason</Th><Th>Status</Th><Th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-3 font-mono text-sm font-bold text-slate-900">{t.ticketNo}<span className="block text-xs font-sans font-normal text-slate-400">{formatDateTime(t.createdAt)}</span></td>
                    <td className="px-6 py-3 text-sm"><Link to={`/portal/clients/${t.company}`} className="font-bold text-slate-900 hover:underline">{t.companyName}</Link></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{ACTION_LABEL[t.action]}{t.requestedSlug && <span className="block font-mono text-xs text-slate-400">{t.requestedSlug}</span>}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{t.requestedBy.name}<span className="block text-xs text-slate-400">{t.source === 'platform' ? 'Platform team' : 'Company admin'}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600 max-w-xs">{t.reason}</td>
                    <td className="px-6 py-3"><Badge tone={ticketTone(t.status)}>{t.status}</Badge>{t.status !== 'Pending' && <span className="block text-xs text-slate-400 mt-1">{t.decidedBy.name}{t.decisionNote && ` · ${t.decisionNote}`}</span>}</td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {t.status === 'Pending' && canDecide && (
                        <div className="flex justify-end gap-2">
                          <Button small disabled={busy === t.id} aria-label={`Approve ${t.ticketNo}`} onClick={() => void decide(t, 'approve')}>Approve</Button>
                          <Button small variant="secondary" disabled={busy === t.id} aria-label={`Reject ${t.ticketNo}`} onClick={() => void decide(t, 'reject')}>Reject</Button>
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

export default PortalAddressTickets;
