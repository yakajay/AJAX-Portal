import { useState } from 'react';
import { Send } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { errorMessage, formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Spinner, Th, inputClass, statusTone } from '../ui';

export interface Ticket {
  id: string; subject: string; category: string; message: string;
  status: 'Open' | 'In Progress' | 'Waiting for response' | 'Closed'; priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  slaState: 'On Track' | 'At Risk' | 'Breached' | 'Met'; dueAt: string | null; createdAt: string;
  comments: { id: string; authorName: string; authorRole: string; message: string; createdAt: string }[];
  user?: { name: string; email?: string } | null; assignee?: { id?: string; name: string } | null; assigneeId?: string | null;
}
interface Person { id: string; name: string; role: string }

/** How people refer to priorities: P1 is the most urgent */
export const PRIORITY_CODE = { Urgent: 'P1', High: 'P2', Medium: 'P3', Low: 'P4' } as const;
const PRIORITY_TONE = { Low: 'slate', Medium: 'blue', High: 'amber', Urgent: 'rose' } as const;

const dueText = (t: Ticket) => {
  if (!t.dueAt || t.status === 'Closed') return null;
  const ms = new Date(t.dueAt).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / 3600000);
  const label = hours >= 48 ? `${Math.round(hours / 24)}d` : hours >= 1 ? `${hours}h` : `${Math.max(Math.round(Math.abs(ms) / 60000), 1)}m`;
  return ms >= 0 ? `due in ${label}` : `overdue by ${label}`;
};

const TicketDetail = ({ ticketId, staff, canWrite, user, onClose, onChanged }: {
  ticketId: string; staff: boolean; canWrite: boolean; user: User; onClose: () => void; onChanged: () => void;
}) => {
  const base = staff ? '/admin/support/tickets' : '/user/support/tickets';
  const { data: ticket, error, reload } = useAsync(() => apiJson<Ticket>(`${base}/${ticketId}`), [ticketId]);
  const people = useAsync(() => (staff ? apiJson<Person[]>('/user/directory') : Promise.resolve([] as Person[])), [staff]);
  const [reply, setReply] = useState('');
  const [waitNote, setWaitNote] = useState<string | null>(null); // set while the assignee is writing what they need from the requester
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try { await fn(); await reload(); onChanged(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); }
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    void run(async () => { await apiSend('POST', `${base}/${ticketId}/comments`, { message: reply }); setReply(''); });
  };
  const update = (patch: Record<string, unknown>) => run(() => apiSend('PUT', `${base}/${ticketId}`, patch));

  const admins = (people.data ?? []).filter((p) => p.role === 'ADMIN' || p.role === 'SUPER_ADMIN');

  return (
    <Modal open title={ticket?.subject ?? 'Ticket'} wide onClose={onClose}>
      <ErrorNote error={error ?? actionError} />
      {!ticket ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(ticket.status)}>{ticket.status}</Badge>
            <Badge tone={PRIORITY_TONE[ticket.priority]}>{PRIORITY_CODE[ticket.priority]} · {ticket.priority}</Badge>
            <Badge tone={statusTone(ticket.slaState)}>SLA {ticket.slaState}</Badge>
            {dueText(ticket) && <span className="text-xs text-slate-500">{dueText(ticket)}</span>}
            <span className="text-xs text-slate-400 ml-auto">{ticket.category} · opened {formatDateTime(ticket.createdAt)}{ticket.user ? ` by ${ticket.user.name}` : ''}</span>
          </div>

          {staff && canWrite && (
            <div className="grid sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <Field label="Status"><select disabled={busy} className={inputClass} value={ticket.status} onChange={(e) => (e.target.value === 'Waiting for response' ? setWaitNote('') : void update({ status: e.target.value }))}><option>Open</option><option>In Progress</option>{(ticket.status === 'Waiting for response' || ticket.assigneeId === user.id || ticket.assignee?.id === user.id || user.role === 'SUPER_ADMIN') && <option>Waiting for response</option>}<option>Closed</option></select></Field>
              <Field label="Priority"><select disabled={busy} className={inputClass} value={ticket.priority} onChange={(e) => update({ priority: e.target.value })}><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></Field>
              <Field label="Assigned to"><select disabled={busy} className={inputClass} value={ticket.assigneeId ?? ''} onChange={(e) => update({ assigneeId: e.target.value || null })}><option value="">Unassigned</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
          )}

          {staff && canWrite && waitNote !== null && (
            <form
              className="space-y-3 p-4 rounded-xl border-2 border-blue-600 bg-blue-50"
              onSubmit={(e) => { e.preventDefault(); void update({ status: 'Waiting for response', comment: waitNote }).then(() => setWaitNote(null)); }}
            >
              <Field label={`What do you need from ${ticket.user?.name ?? 'the requester'}?`} hint="They get this by email. Reminders and the SLA clock pause until they reply.">
                <textarea required rows={3} className={inputClass} value={waitNote} onChange={(e) => setWaitNote(e.target.value)} />
              </Field>
              <div className="flex gap-2"><Button type="submit" disabled={busy || !waitNote.trim()}>Wait for response and pause reminders</Button><Button variant="secondary" onClick={() => setWaitNote(null)}>Cancel</Button></div>
            </form>
          )}
          {ticket.status === 'Waiting for response' && (
            <p role="status" className="p-3 rounded-xl bg-blue-50 text-sm font-semibold text-blue-900">
              {staff ? 'Waiting for the requester. Reminders and the SLA clock are paused until they reply.' : 'We are waiting for your reply. Answer below and we will pick it up again.'}
            </p>
          )}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.message}</p>
          </div>

          <ul className="space-y-3" aria-label="Conversation">
            {ticket.comments.map((c) => (
              <li key={c.id} className={`rounded-xl p-4 text-sm ${c.authorRole === 'USER' ? 'bg-slate-50' : 'bg-blue-50'}`}>
                <p className="flex justify-between text-xs"><strong className="text-slate-900">{c.authorName}{c.authorRole !== 'USER' && <span className="ml-2 text-blue-700">Support</span>}</strong><span className="text-slate-400">{formatDateTime(c.createdAt)}</span></p>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap">{c.message}</p>
              </li>
            ))}
          </ul>

          {(staff ? canWrite : true) && (
            <form onSubmit={send} className="flex gap-2 items-end">
              <textarea aria-label="Reply" rows={2} className={`${inputClass} flex-1`} placeholder={ticket.status === 'Closed' ? 'Replying will re-open this ticket…' : 'Write a reply…'} value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button type="submit" disabled={busy || !reply.trim()}><Send size={14} />Send</Button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
};

export const TicketList = ({ user, scope }: { user: User; scope: 'mine' | 'queue' }) => {
  const staff = scope === 'queue';
  const canWrite = can(user, 'support', 'write');
  const [filter, setFilter] = useState<'open' | 'all' | 'mine'>('open');
  const { data, loading, error, reload } = useAsync(() => apiJson<Ticket[]>(staff ? '/admin/support/tickets' : '/user/support/tickets'), [staff]);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = (data ?? []).filter((t) => {
    if (filter === 'open') return t.status !== 'Closed';
    if (filter === 'mine') return t.assigneeId === user.id || t.assignee?.id === user.id;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tickets">
        {(staff ? (['open', 'mine', 'all'] as const) : (['open', 'all'] as const)).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`px-4 py-1.5 rounded-full text-xs font-extrabold ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {f === 'mine' ? 'Assigned to me' : f}
          </button>
        ))}
      </div>
      {staff && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <Button small variant="secondary" onClick={() => void downloadFile('/admin/support/report?format=csv', 'ticket-resolution-report.csv')}>Download resolution report</Button>
          <span>P1 and P2 tickets remind everyone involved every 30 minutes, the rest every hour, until closed. Managers get the report daily.</span>
        </div>
      )}
      <ErrorNote error={error} />
      <Card flush>
        {loading && !data ? <Spinner /> : !rows.length ? <Empty>No tickets here.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Ticket</Th>{staff && <Th>From</Th>}<Th>Priority</Th><Th>Status</Th><Th>SLA</Th>{staff && <Th>Assignee</Th>}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setOpenId(t.id)}>
                    <td className="px-6 py-3">
                      <button className="text-left text-sm font-bold text-slate-900 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); setOpenId(t.id); }}>{t.subject}</button>
                      <p className="text-xs text-slate-400">{t.category} · {formatDateTime(t.createdAt)}{t.comments.length ? ` · ${t.comments.length} repl${t.comments.length === 1 ? 'y' : 'ies'}` : ''}</p>
                    </td>
                    {staff && <td className="px-6 py-3 text-sm text-slate-600">{t.user?.name ?? '—'}</td>}
                    <td className="px-6 py-3"><Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_CODE[t.priority]} · {t.priority}</Badge></td>
                    <td className="px-6 py-3"><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                    <td className="px-6 py-3"><Badge tone={statusTone(t.slaState)}>{t.slaState}</Badge><span className="block text-xs text-slate-400 mt-0.5">{dueText(t)}</span></td>
                    {staff && <td className="px-6 py-3 text-sm text-slate-600">{t.assignee?.name ?? <span className="text-slate-300">Unassigned</span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {openId && <TicketDetail ticketId={openId} staff={staff} canWrite={canWrite} user={user} onClose={() => setOpenId(null)} onChanged={() => void reload()} />}
    </div>
  );
};
