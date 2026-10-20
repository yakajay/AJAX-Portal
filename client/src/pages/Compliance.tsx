import React, { useState } from 'react';
import { CheckCircle2, Plus, Trash2, Undo2 } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { errorMessage, formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, PageHeader, Spinner, StatTile, Tabs, inputClass } from '../components/ui';

interface Check { id: string; title: string; severity: 'error' | 'warning'; items: { userId: string; name: string; detail: string }[] }
interface Obligation { key: string; name: string; authority: string; note: string; frequency: string; period: string; dueDate: string; status: 'done' | 'overdue' | 'due_soon' | 'upcoming'; daysLeft: number; completedAt: string | null; completedBy: string | null; doneNote: string }
interface Report { checks: Check[]; filings: Obligation[]; summary: { errors: number; warnings: number; overdueFilings: number; dueSoon: number } }
interface Filing { key?: string; name: string; frequency: 'monthly' | 'quarterly' | 'yearly'; dueDay: number | string; dueMonth: number | string | null; since?: string | null; authority: string; note: string }
interface Settings {
  requireGovernmentId: boolean; requireTaxId: boolean; minimumWage: { amount: number | string | null; currency: string };
  noticePeriodDays: number | string | null; settlementDays: number | string | null; maxMonthlyOvertimeHours: number | string | null; filings: Filing[];
}

const statusTone = { done: 'green', overdue: 'rose', due_soon: 'amber', upcoming: 'slate' } as const;
const statusLabel = { done: 'Done', overdue: 'Overdue', due_soon: 'Due soon', upcoming: 'Upcoming' } as const;

const Overview = ({ canWrite, onConfigure }: { canWrite: boolean; onConfigure: () => void }) => {
  const { data, loading, error, reload } = useAsync(() => apiJson<Report>('/admin/compliance'));
  const [actionError, setActionError] = useState<string | null>(null);
  const flagged = data?.checks.filter((c) => c.items.length) ?? [];

  const mark = async (o: Obligation, done: boolean) => {
    setActionError(null);
    try {
      const note = done ? window.prompt(`Reference or note for "${o.name}" (${o.period}), optional:`, '') : '';
      if (note === null) return;
      await apiSend('POST', '/admin/compliance/filings', { key: o.key, period: o.period, done, note });
      await reload();
    } catch (e) { setActionError(errorMessage(e)); }
  };

  if (loading && !data) return <Spinner />;
  return (
    <div className="space-y-6">
      <ErrorNote error={error ?? actionError} />
      {data && (
        <>
          <div className="grid sm:grid-cols-4 gap-4">
            <StatTile label="Rule errors" value={data.summary.errors} />
            <StatTile label="Rule warnings" value={data.summary.warnings} />
            <StatTile label="Overdue filings" value={data.summary.overdueFilings} />
            <StatTile label="Due in 7 days" value={data.summary.dueSoon} />
          </div>
          <Card title="Filings and payments calendar" flush>
            {!data.filings.length ? <div className="p-6"><Empty>No recurring filings set up. <button className="underline font-bold" onClick={onConfigure}>Add the ones that apply to your company</button>.</Empty></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400"><tr><th className="px-6 py-3">Filing</th><th className="px-6 py-3">Period</th><th className="px-6 py-3">Due</th><th className="px-6 py-3">Status</th><th className="px-6 py-3" /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.filings.map((o) => (
                      <tr key={`${o.key}-${o.period}`}>
                        <td className="px-6 py-3"><p className="font-bold text-slate-900">{o.name}</p><p className="text-xs text-slate-400">{[o.authority, o.note].filter(Boolean).join(' · ')}</p></td>
                        <td className="px-6 py-3 text-slate-600">{o.period}</td>
                        <td className="px-6 py-3 text-slate-600">{formatDate(o.dueDate)}{o.status !== 'done' && <span className="text-xs text-slate-400"> ({o.daysLeft < 0 ? `${-o.daysLeft}d late` : `in ${o.daysLeft}d`})</span>}</td>
                        <td className="px-6 py-3"><Badge tone={statusTone[o.status]}>{statusLabel[o.status]}</Badge>{o.status === 'done' && <p className="text-xs text-slate-400 mt-1">{o.completedBy}{o.doneNote ? ` · ${o.doneNote}` : ''}</p>}</td>
                        <td className="px-6 py-3 text-right">{canWrite && (o.status === 'done'
                          ? <Button small variant="ghost" aria-label={`Reopen ${o.name} ${o.period}`} onClick={() => mark(o, false)}><Undo2 size={12} />Reopen</Button>
                          : <Button small variant="secondary" aria-label={`Mark ${o.name} ${o.period} done`} onClick={() => mark(o, true)}><CheckCircle2 size={12} />Mark done</Button>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card title="Rule checks">
            {!flagged.length ? <p role="status" className="text-sm font-bold text-emerald-700">No issues found against your current rules.</p> : (
              <div className="space-y-5">
                {flagged.map((c) => (
                  <div key={c.id}>
                    <p className="flex items-center gap-2 text-sm font-black text-slate-900"><Badge tone={c.severity === 'error' ? 'rose' : 'amber'}>{c.severity}</Badge>{c.title} <span className="text-slate-400">({c.items.length})</span></p>
                    <ul className="mt-2 text-sm text-slate-600 divide-y divide-slate-100 border border-slate-100 rounded-xl">
                      {c.items.map((i) => <li key={`${c.id}-${i.userId}`} className="px-4 py-2 flex justify-between gap-4"><span className="font-bold text-slate-800">{i.name}</span><span className="text-right">{i.detail}</span></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

const Rules = ({ canWrite }: { canWrite: boolean }) => {
  const { data, loading, error } = useAsync(() => apiJson<Settings>('/admin/compliance/settings'));
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const s = draft ?? data;
  const edit = (patch: Partial<Settings>) => { setSaved(false); setDraft({ ...s!, ...patch }); };
  const setFiling = (i: number, patch: Partial<Filing>) => edit({ filings: s!.filings.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const blank = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!s) return;
    setSaveError(null);
    try {
      setDraft(await apiSend<Settings>('PUT', '/admin/compliance/settings', {
        ...s, minimumWage: { amount: blank(s.minimumWage.amount), currency: s.minimumWage.currency },
        noticePeriodDays: blank(s.noticePeriodDays), settlementDays: blank(s.settlementDays), maxMonthlyOvertimeHours: blank(s.maxMonthlyOvertimeHours)
      }));
      setSaved(true);
    } catch (err) { setSaveError(errorMessage(err)); }
  };
  const num = (label: string, key: 'noticePeriodDays' | 'settlementDays' | 'maxMonthlyOvertimeHours', hint: string) => (
    <Field label={label} hint={hint}><input type="number" min="0" step="1" disabled={!canWrite} className={inputClass} value={s![key] ?? ''} onChange={(e) => edit({ [key]: e.target.value })} /></Field>
  );

  return (
    <Card title="Compliance rules">
      <ErrorNote error={error ?? saveError} />
      {loading && !s ? <Spinner /> : s && (
        <form onSubmit={save} className="space-y-6 max-w-3xl">
          <p className="text-sm text-slate-500">Labour law differs by country and changes over time, so no legal limits are built in. Enter the thresholds and filings that apply to your company; leave a field empty to switch that rule off.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Minimum monthly gross pay" hint="Employees below this are flagged"><input type="number" min="0" step="0.01" disabled={!canWrite} className={inputClass} value={s.minimumWage.amount ?? ''} onChange={(e) => edit({ minimumWage: { ...s.minimumWage, amount: e.target.value } })} /></Field>
            <Field label="Currency"><input maxLength={3} disabled={!canWrite} className={inputClass} value={s.minimumWage.currency} onChange={(e) => edit({ minimumWage: { ...s.minimumWage, currency: e.target.value.toUpperCase() } })} /></Field>
            {num('Minimum notice period (days)', 'noticePeriodDays', 'Flags resignations approved with shorter notice')}
            {num('Final settlement deadline (days)', 'settlementDays', 'Flags exits not settled this long after the last day')}
            {num('Overtime limit per month (hours)', 'maxMonthlyOvertimeHours', 'Flags people above it this month')}
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" disabled={!canWrite} checked={s.requireGovernmentId} onChange={(e) => edit({ requireGovernmentId: e.target.checked })} />Every employee must have a government ID on file</label>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" disabled={!canWrite} checked={s.requireTaxId} onChange={(e) => edit({ requireTaxId: e.target.checked })} />Every employee must have a tax ID on file</label>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs font-black text-slate-400 uppercase tracking-widest">Recurring filings and payments</span>
              {canWrite && <Button small variant="secondary" onClick={() => edit({ filings: [...s.filings, { name: '', frequency: 'monthly', dueDay: 15, dueMonth: null, authority: '', note: '' }] })}><Plus size={12} />Add filing</Button>}</div>
            {!s.filings.length && <Empty>No filings yet. Examples: provident fund return, tax-deducted-at-source payment, social security contribution.</Empty>}
            {s.filings.map((f, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-xl p-3">
                <input aria-label={`Filing ${i + 1} name`} required maxLength={80} disabled={!canWrite} placeholder="Name" className={`${inputClass} col-span-12 sm:col-span-4`} value={f.name} onChange={(e) => setFiling(i, { name: e.target.value })} />
                <select aria-label={`Filing ${i + 1} frequency`} disabled={!canWrite} className={`${inputClass} col-span-6 sm:col-span-2`} value={f.frequency} onChange={(e) => setFiling(i, { frequency: e.target.value as Filing['frequency'], dueMonth: e.target.value === 'yearly' ? f.dueMonth ?? 6 : null })}>
                  <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
                </select>
                <input aria-label={`Filing ${i + 1} due day`} required type="number" min="1" max="31" disabled={!canWrite} placeholder="Day" title="Due day of the month" className={`${inputClass} col-span-3 sm:col-span-2`} value={f.dueDay} onChange={(e) => setFiling(i, { dueDay: e.target.value })} />
                {f.frequency === 'yearly'
                  ? <input aria-label={`Filing ${i + 1} due month`} required type="number" min="1" max="12" disabled={!canWrite} placeholder="Month" title="Due month (1-12)" className={`${inputClass} col-span-3 sm:col-span-2`} value={f.dueMonth ?? ''} onChange={(e) => setFiling(i, { dueMonth: e.target.value })} />
                  : <span className="col-span-3 sm:col-span-2 text-xs text-slate-400">{f.frequency === 'monthly' ? 'of the next month' : 'of the month after quarter end'}</span>}
                <input aria-label={`Filing ${i + 1} authority`} maxLength={80} disabled={!canWrite} placeholder="Authority (optional)" className={`${inputClass} col-span-10 sm:col-span-1`} value={f.authority} onChange={(e) => setFiling(i, { authority: e.target.value })} />
                {canWrite && <button type="button" aria-label={`Remove filing ${i + 1}`} className="col-span-2 sm:col-span-1 text-slate-400 hover:text-rose-600 justify-self-end" onClick={() => edit({ filings: s.filings.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                <label className="col-span-12 text-xs text-slate-500 flex items-center gap-2">Track deadlines from
                  <input type="date" disabled={!canWrite} className={`${inputClass} w-44 py-1.5`} value={f.since ?? ''} onChange={(e) => setFiling(i, { since: e.target.value || null })} />
                  <span className="text-slate-400">(earlier deadlines are not listed as overdue; empty means today)</span></label>
              </div>
            ))}
          </div>
          {canWrite && <div className="flex items-center gap-4"><Button type="submit">Save rules</Button>{saved && <span role="status" className="text-sm font-bold text-emerald-700">Saved.</span>}</div>}
        </form>
      )}
    </Card>
  );
};

const Compliance = ({ user }: { user: User }) => {
  const [tab, setTab] = useState<'overview' | 'rules'>('overview');
  const canWrite = can(user, 'hr', 'write');
  return (
    <div className="space-y-6">
      <PageHeader title="Compliance" subtitle="Rule checks on your people data, and a calendar of the filings and payments your company owes." />
      <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'rules', label: 'Rules & filings' }]} value={tab} onChange={setTab} />
      {tab === 'overview' ? <Overview canWrite={canWrite} onConfigure={() => setTab('rules')} /> : <Rules canWrite={canWrite} />}
    </div>
  );
};

export default Compliance;
