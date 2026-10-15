import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { apiJson, apiSend } from '../../lib/api';
import { errorMessage, formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Button, Card, Empty, ErrorNote, Field, Modal, inputClass } from '../ui';

export interface PolicyRow { type: string; yearly: number | null; accrual: 'monthly' | 'upfront' | 'none'; carryForwardMax: number }
export interface HolidayRow { id: string; date: string; iso: string | null; name: string }

const UNPAID = 'Unpaid Leave';

export const LeavePolicyEditor = ({ onSaved }: { onSaved: () => void }) => {
  const policy = useAsync(() => apiJson<PolicyRow[]>('/admin/leave-policy'));
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (policy.data) setRows(policy.data); }, [policy.data]);

  const change = (i: number, patch: Partial<PolicyRow>) => {
    setSaved(false);
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setRows(await apiSend<PolicyRow[]>('PUT', '/admin/leave-policy', { policy: rows }));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Leave types and entitlements" actions={
      <Button small onClick={() => setRows((r) => [...r.filter((x) => x.type !== UNPAID), { type: '', yearly: 5, accrual: 'upfront', carryForwardMax: 0 }, ...r.filter((x) => x.type === UNPAID)])}>
        <Plus size={14} />Add type
      </Button>
    }>
      <ErrorNote error={error ?? policy.error} />
      <p className="text-xs text-slate-500 mb-4">
        "Monthly" grants yearly days ÷ 12 each month; "upfront" grants the full year on 1 January. Unused days carry forward up to the limit.
        {` ${UNPAID} must stay (payroll deducts it) and is unlimited.`}
      </p>
      <div className="space-y-3">
        {rows.map((row, i) => {
          const unpaid = row.type === UNPAID;
          return (
            <div key={i} className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
              <Field label="Name"><input className={inputClass} value={row.type} disabled={unpaid} maxLength={40} onChange={(e) => change(i, { type: e.target.value })} /></Field>
              <Field label="Days / year"><input type="number" min={0} max={365} step="0.5" className={inputClass} disabled={unpaid} value={unpaid ? '' : row.yearly ?? ''} placeholder={unpaid ? 'Unlimited' : ''} onChange={(e) => change(i, { yearly: Number(e.target.value) })} /></Field>
              <Field label="Accrual">
                <select className={inputClass} disabled={unpaid} value={row.accrual} onChange={(e) => change(i, { accrual: e.target.value as PolicyRow['accrual'] })}>
                  {unpaid ? <option value="none">None</option> : <><option value="upfront">Upfront</option><option value="monthly">Monthly</option></>}
                </select>
              </Field>
              <Field label="Max carry-forward"><input type="number" min={0} step="0.5" className={inputClass} disabled={unpaid} value={unpaid ? '' : row.carryForwardMax} onChange={(e) => change(i, { carryForwardMax: Number(e.target.value) })} /></Field>
              {unpaid ? <span /> : <button aria-label={`Remove ${row.type || 'leave type'}`} className="p-2 mb-1 text-rose-500 hover:bg-rose-50 rounded-lg" onClick={() => { setSaved(false); setRows((r) => r.filter((_, idx) => idx !== i)); }}><Trash2 size={16} /></button>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-6">
        <Button onClick={save} disabled={saving || rows.length === 0}>{saving ? 'Saving…' : 'Save policy'}</Button>
        {saved && <span className="text-xs font-semibold text-emerald-600" role="status">Saved. New balances apply immediately.</span>}
      </div>
    </Card>
  );
};

export const HolidayManager = ({ onChanged }: { onChanged: () => void }) => {
  const holidays = useAsync(() => apiJson<HolidayRow[]>('/user/holidays'));
  const [editing, setEditing] = useState<HolidayRow | 'new' | null>(null);
  const [form, setForm] = useState({ date: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const open = (h: HolidayRow | 'new') => {
    setEditing(h);
    setError(null);
    setForm(h === 'new' ? { date: '', name: '' } : { date: h.iso ?? '', name: h.name });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing === 'new') await apiSend('POST', '/admin/holidays', form);
      else if (editing) await apiSend('PUT', `/admin/holidays/${editing.id}`, form);
      setEditing(null);
      await holidays.reload();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const remove = async (h: HolidayRow) => {
    if (!window.confirm(`Request removal of "${h.name}"? The platform administrator must approve it.`)) return;
    try {
      const res = await apiSend<{ message?: string }>('DELETE', `/admin/holidays/${h.id}`, {});
      setNote(res.message ?? 'Removal requested.');
    } catch (err) {
      setNote(errorMessage(err));
    }
  };

  const sorted = [...(holidays.data ?? [])].sort((a, b) => (a.iso ?? '').localeCompare(b.iso ?? ''));

  return (
    <Card title="Public holidays" flush actions={<Button small onClick={() => open('new')}><Plus size={14} />Add holiday</Button>}>
      <ErrorNote error={holidays.error} />
      {note && <p className="px-6 pt-4 text-xs font-semibold text-slate-600" role="status">{note}</p>}
      {sorted.length === 0 ? <Empty>No holidays yet. Add the days your company is closed.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((h) => (
            <li key={h.id} className="flex items-center gap-4 px-6 py-3">
              <span className="w-32 text-sm font-bold text-slate-500">{h.iso ? formatDate(h.iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : h.date}</span>
              <span className="flex-1 text-sm font-bold text-slate-900">{h.name}</span>
              <button aria-label={`Edit ${h.name}`} className="p-2 hover:bg-slate-100 rounded-lg" onClick={() => open(h)}><Pencil size={15} /></button>
              <button aria-label={`Remove ${h.name}`} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg" onClick={() => remove(h)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'Add holiday' : 'Edit holiday'} onClose={() => setEditing(null)}>
        <form onSubmit={submit} className="space-y-4">
          <ErrorNote error={error} />
          <Field label="Date"><input required type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Name"><input required maxLength={100} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>
    </Card>
  );
};
