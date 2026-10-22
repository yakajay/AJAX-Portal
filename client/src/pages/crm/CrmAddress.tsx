import { useState } from 'react';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, Spinner, Th, inputClass } from '../../components/ui';
import { ACTION_LABEL, ticketTone, type AddressTicket } from '../portal/shared';

interface AddressInfo {
  current: { dedicated: boolean; slug: string; address: string; shared: string; plan: string; baseDomain: string };
  tickets: AddressTicket[];
}

/** Where this company's people sign in. Changing it is a ticket the platform team approves, and every step is kept for audits. */
const CrmAddress = () => {
  const { data, error, loading, reload } = useAsync(() => apiJson<AddressInfo>('/admin/company/address-requests'), []);
  const [action, setAction] = useState<'enable' | 'disable' | 'rename'>('enable');
  const [slug, setSlug] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorNote error={error} />;
  const { current, tickets } = data;
  const trial = current.plan === 'trial';
  const pending = tickets.find((t) => t.status === 'Pending');
  const choices: { id: typeof action; label: string }[] = current.dedicated
    ? [{ id: 'rename', label: 'Rename our subdomain' }, { id: 'disable', label: 'Go back to the shared address' }]
    : [{ id: 'enable', label: 'Get our own address' }];
  const effective = choices.some((c) => c.id === action) ? action : choices[0].id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const ticket = await apiSend<AddressTicket>('POST', '/admin/company/address-requests', { action: effective, slug: effective === 'disable' ? undefined : slug, reason });
      setNotice(`Request ${ticket.ticketNo} sent. The platform team will review it; nothing changes until they approve.`);
      setReason('');
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Sign-in address" subtitle="Where your employees and admins sign in" />
      <Card title="Current address" actions={<Badge tone={current.dedicated ? 'green' : 'slate'}>{current.dedicated ? 'Own address' : 'Shared address'}</Badge>}>
        <p className="font-mono text-lg font-bold text-slate-900">{current.address}</p>
        <p className="mt-2 text-sm text-slate-600">
          {current.dedicated
            ? 'Your company has its own address. People who sign in at the shared address are sent here.'
            : `Everyone signs in at ${current.shared}. The roles on each account decide what they see.`}
        </p>
      </Card>

      <Card title="Ask for a change">
        {trial ? (
          <p className="text-sm text-slate-600">Trial companies use the shared address. Once you are on a paid plan you can ask for your own.</p>
        ) : pending ? (
          <p className="text-sm text-slate-600"><span className="font-mono font-bold">{pending.ticketNo}</span> is waiting for the platform team. You can ask again once it is decided.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {choices.length > 1 && (
              <Field label="What do you need?">
                <select className={inputClass} value={effective} onChange={(e) => setAction(e.target.value as typeof action)}>{choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </Field>
            )}
            {effective !== 'disable' && (
              <Field label="Subdomain you would like" hint={effective === 'enable' ? `Leave blank to keep "${current.slug}".` : undefined}>
                <div className="flex items-center gap-2">
                  <input className={`${inputClass} max-w-60`} placeholder={current.slug} required={effective === 'rename'} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
                  <span className="text-sm text-slate-500">.{current.baseDomain}</span>
                </div>
              </Field>
            )}
            <Field label="Why do you need this?" hint="Saved with the ticket for audits.">
              <textarea required rows={3} className={`${inputClass} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <ErrorNote error={actionError} />
            <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</Button>
          </form>
        )}
        {notice && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>}
      </Card>

      <Card title="Ticket history" flush>
        {!tickets.length ? <Empty>No address changes yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Ticket</Th><Th>Change</Th><Th>By</Th><Th>Reason</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-3 font-mono text-sm font-bold text-slate-900">{t.ticketNo}<span className="block text-xs font-sans font-normal text-slate-400">{formatDateTime(t.createdAt)}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{ACTION_LABEL[t.action]}{t.after.slug && t.after.dedicated && <span className="block font-mono text-xs text-slate-400">{t.after.slug}</span>}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{t.requestedBy.name}<span className="block text-xs text-slate-400">{t.source === 'platform' ? 'Platform team' : 'Company admin'}</span></td>
                    <td className="px-6 py-3 text-sm text-slate-600 max-w-xs">{t.reason}</td>
                    <td className="px-6 py-3"><Badge tone={ticketTone(t.status)}>{t.status}</Badge>{t.status !== 'Pending' && <span className="block text-xs text-slate-400 mt-1">{t.decidedBy.name}{t.decisionNote && ` · ${t.decisionNote}`}</span>}</td>
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

export default CrmAddress;
