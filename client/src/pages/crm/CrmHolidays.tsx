import React, { useState } from 'react';
import type { User } from '../../types';
import { apiJson, apiSend, requestDelete } from '../../lib/api';
import { can } from '../../lib/permissions';
import { errorMessage, formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, StatTile, inputClass } from '../../components/ui';

interface Holiday { id: string; date: string; iso: string | null; name: string }

const EMPTY = { id: '', name: '', date: '' };

const Holidays = ({ user }: { user: User }) => {
  const holidays = useAsync(() => apiJson<Holiday[]>('/user/holidays'));
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState<'All' | 'Upcoming' | 'Past'>('All');
  const [pending, setPending] = useState<Holiday | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = can(user, 'hr', 'write');
  const canDelete = can(user, 'hr', 'delete');
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const all = [...(holidays.data ?? [])].sort((a, b) => (a.iso ?? '').localeCompare(b.iso ?? ''));
  const upcoming = all.filter((h) => (h.iso ?? '') >= today);
  const rows = all.filter((h) => filter === 'All' || (filter === 'Upcoming') === ((h.iso ?? '') >= today));
  const next = upcoming[0];
  const thisYear = all.filter((h) => h.iso?.startsWith(String(year))).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const body = { name: form.name.trim(), date: form.date };
      if (form.id) await apiSend('PUT', `/admin/holidays/${form.id}`, body);
      else await apiSend('POST', '/admin/holidays', body);
      setMsg(form.id ? `${body.name} updated.` : `${body.name} added to the calendar.`);
      setForm(EMPTY);
      await holidays.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      setMsg(await requestDelete(`/admin/holidays/${pending.id}`));
      setPending(null);
      await holidays.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Holiday calendar" subtitle={`Calendar year ${year} · shown on every employee’s dashboard and leave page`} />
      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
        <StatTile label={`Holidays in ${year}`} value={String(thisYear)} />
        <StatTile label="Still to come" value={String(upcoming.length)} hint="From today onwards" />
        <StatTile label="Next holiday" value={next?.name ?? '—'} hint={next?.iso ? formatDate(next.iso, { weekday: 'long', day: 'numeric', month: 'short' }) : 'None scheduled'} />
      </section>
      <ErrorNote error={error ?? holidays.error} />
      {msg && <p role="status" className="text-sm font-semibold text-blue-800">{msg}</p>}

      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex-[3] basis-[28rem] min-w-0 p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">Holidays</h2>
            <div role="group" aria-label="Filter holidays" className="flex gap-2">
              {(['All', 'Upcoming', 'Past'] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={`min-h-11 px-3.5 rounded-full text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {holidays.loading && !holidays.data ? <Spinner /> : rows.length === 0 ? <Empty>No holidays to show.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Date</th>
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Holiday</th>
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => {
                    const past = (h.iso ?? '') < today;
                    return (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 border-b border-slate-100">
                          <span className="flex flex-col"><span className="font-bold text-slate-900">{h.iso ? formatDate(h.iso, { day: 'numeric', month: 'short' }) : h.date}</span><span className="text-[13px] text-slate-500">{h.iso ? formatDate(h.iso, { weekday: 'long' }) : ''}</span></span>
                        </td>
                        <td className="px-3 py-3 border-b border-slate-100 font-semibold text-slate-900">{h.name} {past && <Badge tone="slate">Past</Badge>}</td>
                        <td className="px-3 py-3 border-b border-slate-100 text-right whitespace-nowrap">
                          {canWrite && <Button small variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => { setForm({ id: h.id, name: h.name, date: h.iso ?? '' }); setMsg(null); }}>Edit</Button>}
                          {canDelete && <Button small variant="ghost" aria-label={`Delete ${h.name}`} onClick={() => setPending(h)}>Delete</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canWrite && (
          <form onSubmit={submit} className="flex-1 basis-72 min-w-0 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
            <h2 className="text-lg font-extrabold text-slate-900">{form.id ? 'Edit holiday' : 'Add a holiday'}</h2>
            <Field label="Holiday name"><input required maxLength={100} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Date"><input required type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <p className="text-[13px] text-slate-500">Leave requests skip public holidays when counting working days.</p>
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" disabled={busy}>{form.id ? 'Save holiday' : 'Add holiday'}</Button>
              {form.id && <Button variant="secondary" onClick={() => setForm(EMPTY)}>Cancel</Button>}
            </div>
          </form>
        )}
      </section>

      <Modal open={!!pending} title={`Delete ${pending?.name ?? ''}?`} onClose={() => setPending(null)}>
        <div className="space-y-4">
          <p className="text-[15px] text-slate-600">{pending?.iso ? formatDate(pending.iso) : pending?.date} becomes a normal working day once the platform administrator approves the removal.</p>
          <div className="flex justify-end gap-2.5">
            <Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={busy}>Request removal</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Holidays;
