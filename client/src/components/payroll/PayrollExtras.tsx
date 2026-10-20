import React, { useState } from 'react';
import { Download, Pencil, Play, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, monthLabel, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Spinner, StatTile, Th, inputClass, statusTone } from '../ui';

interface Structure {
  id: string; currency: string; basic: number; hra: number; allowances: number; pfPercent: number; taxPercent: number; otherDeductions: number; deductionItems?: DeductionItem[];
}
interface DeductionItem { name: string; type: 'fixed' | 'percentOfBasic' | 'percentOfGross'; value: number | string; preTax: boolean }
interface StructureRow { user: { id: string; name: string; email: string; department?: string; designation?: string }; structure: Structure | null }

const gross = (s: Structure) => s.basic + s.hra + s.allowances;

export const SalaryStructures = ({ user }: { user: User }) => {
  const canWrite = can(user, 'payroll', 'write');
  const { data, loading, error, reload } = useAsync(() => apiJson<StructureRow[]>('/admin/payroll/structures'));
  const [editing, setEditing] = useState<StructureRow | null>(null);
  const [form, setForm] = useState({ basic: '', hra: '', allowances: '', pfPercent: '12', taxPercent: '10', otherDeductions: '0' });
  const [items, setItems] = useState<DeductionItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (row: StructureRow) => {
    const s = row.structure;
    setForm({
      basic: String(s?.basic ?? ''), hra: String(s?.hra ?? ''), allowances: String(s?.allowances ?? ''),
      pfPercent: String(s?.pfPercent ?? 12), taxPercent: String(s?.taxPercent ?? 10), otherDeductions: String(s?.otherDeductions ?? 0)
    });
    setItems((s?.deductionItems ?? []).map((i) => ({ ...i })));
    setFormError(null);
    setEditing(row);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiSend('PUT', `/admin/payroll/structures/${editing.user.id}`, { ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)])), deductionItems: items.map((i) => ({ ...i, value: Number(i.value) })) });
      setEditing(null);
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const num = (key: keyof typeof form, label: string, step = '0.01') => (
    <Field label={label}><input required type="number" min="0" step={step} className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></Field>
  );

  return (
    <Card title="Monthly salary structures" flush>
      <ErrorNote error={error} />
      {loading && !data ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Basic</Th><Th>HRA</Th><Th>Allowances</Th><Th>Gross</Th><Th>PF / tax</Th><Th right /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.map((row) => (
                <tr key={row.user.id}>
                  <td className="px-6 py-3"><p className="text-sm font-bold text-slate-900">{row.user.name}</p><p className="text-xs text-slate-400">{row.user.designation || row.user.department}</p></td>
                  {row.structure ? <>
                    <td className="px-6 py-3 text-sm text-slate-700">{money(row.structure.basic, row.structure.currency)}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{money(row.structure.hra, row.structure.currency)}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{money(row.structure.allowances, row.structure.currency)}</td>
                    <td className="px-6 py-3 text-sm font-extrabold text-slate-900">{money(gross(row.structure), row.structure.currency)}</td>
                    <td className="px-6 py-3 text-xs text-slate-500">{row.structure.pfPercent}% / {row.structure.taxPercent}%</td>
                  </> : <td colSpan={5} className="px-6 py-3 text-xs text-slate-400 italic">No structure — not included in payroll runs</td>}
                  <td className="px-6 py-3 text-right">{canWrite && <Button small variant="secondary" aria-label={`Edit salary for ${row.user.name}`} onClick={() => open(row)}><Pencil size={12} />{row.structure ? 'Edit' : 'Set up'}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!editing} title={`Salary — ${editing?.user.name ?? ''}`} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <div className="grid grid-cols-2 gap-4">{num('basic', 'Basic')}{num('hra', 'House rent allowance')}</div>
          <div className="grid grid-cols-2 gap-4">{num('allowances', 'Other allowances')}{num('otherDeductions', 'Other deductions')}</div>
          <div className="grid grid-cols-2 gap-4">{num('pfPercent', 'Provident fund (% of basic)', '0.1')}{num('taxPercent', 'Income tax (% of gross)', '0.1')}</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-400">Other deductions (itemised)</span>
              <Button small variant="secondary" aria-label="Add deduction" onClick={() => setItems([...items, { name: '', type: 'fixed', value: '', preTax: false }])}><Plus size={12} />Add</Button>
            </div>
            {items.map((item, i) => {
              const set = (patch: Partial<DeductionItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input aria-label="Deduction name" required maxLength={40} placeholder="e.g. Insurance" className={`${inputClass} col-span-4`} value={item.name} onChange={(e) => set({ name: e.target.value })} />
                  <select aria-label="Deduction type" className={`${inputClass} col-span-3`} value={item.type} onChange={(e) => set({ type: e.target.value as DeductionItem['type'] })}>
                    <option value="fixed">Fixed amount</option>
                    <option value="percentOfBasic">% of basic</option>
                    <option value="percentOfGross">% of gross</option>
                  </select>
                  <input aria-label="Deduction value" required type="number" min="0" step="0.01" className={`${inputClass} col-span-2`} value={item.value} onChange={(e) => set({ value: e.target.value })} />
                  <label className="col-span-2 text-xs text-slate-500 flex items-center gap-1" title="Reduces taxable income when tax slabs are in use"><input type="checkbox" checked={item.preTax} onChange={(e) => set({ preTax: e.target.checked })} />Pre-tax</label>
                  <button type="button" aria-label={`Remove ${item.name || 'deduction'}`} className="col-span-1 text-slate-400 hover:text-rose-600" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <p className="text-xs text-slate-400">Fixed amounts are charged in full each month; percentages follow paid earnings. The flat income tax % above is ignored when the company has tax slabs.</p>
          </div>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>
    </Card>
  );
};

interface PayslipRow {
  id: string; month: string; currency: string; gross: number; totalDeductions: number; net: number; paidDays: number; workingDays: number; unpaidLeaveDays: number;
  status: 'Generated' | 'Paid'; user?: { name: string; department?: string };
}

const recentMonths = () => Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});

export const MonthlyPayroll = ({ user }: { user: User }) => {
  const canWrite = can(user, 'payroll', 'write');
  const [month, setMonth] = useState(currentMonth());
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => apiJson<PayslipRow[]>(`/admin/payroll/payslips?month=${month}`), [month]);

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setActionError(null);
    try { setBanner(await fn()); await reload(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); }
  };

  const generate = () => act(async () => {
    const r = await apiSend<{ created: number; skipped: number; totalNet: number; currency: string }>('POST', '/admin/payroll/run-monthly', { month });
    return r.created ? `Generated ${r.created} payslip(s), net total ${money(r.totalNet, r.currency)}.` : `Nothing to generate — ${r.skipped} payslip(s) already exist for ${monthLabel(month)}.`;
  });
  const markPaid = () => act(async () => {
    const r = await apiSend<{ paid: number }>('POST', '/admin/payroll/payslips/mark-paid', { month });
    return `Marked ${r.paid} payslip(s) as paid.`;
  });

  const totals = (data ?? []).reduce((a, p) => ({ gross: a.gross + p.gross, net: a.net + p.net, ded: a.ded + p.totalDeductions }), { gross: 0, net: 0, ded: 0 });
  const currency = data?.[0]?.currency ?? 'INR';
  const unpaid = (data ?? []).some((p) => p.status === 'Generated');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Payroll month" className={`${inputClass} w-56`} value={month} onChange={(e) => { setMonth(e.target.value); setBanner(null); }}>
          {recentMonths().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        {canWrite && (
          <div className="flex gap-3">
            <Button disabled={busy} onClick={generate}><Play size={14} />Generate payslips</Button>
            <Button variant="secondary" disabled={busy || !unpaid} onClick={markPaid}><CheckCircle2 size={14} />Mark as paid</Button>
          </div>
        )}
      </div>
      {banner && <div role="status" className="px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold">{banner}</div>}
      <ErrorNote error={actionError ?? error} />
      <div className="grid sm:grid-cols-3 gap-4">
        <StatTile label="Gross" value={money(totals.gross, currency)} />
        <StatTile label="Deductions" value={money(totals.ded, currency)} />
        <StatTile label="Net payable" value={money(totals.net, currency)} />
      </div>
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.length ? <Empty>No payslips for {monthLabel(month)} yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>Employee</Th><Th>Days paid</Th><Th>Gross</Th><Th>Deductions</Th><Th>Net</Th><Th>Status</Th><Th right /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900">{p.user?.name}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{p.paidDays}/{p.workingDays}{p.unpaidLeaveDays > 0 && <span className="text-xs text-amber-700"> ({p.unpaidLeaveDays} unpaid)</span>}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{money(p.gross, p.currency)}</td>
                    <td className="px-6 py-3 text-sm text-slate-700">{money(p.totalDeductions, p.currency)}</td>
                    <td className="px-6 py-3 text-sm font-extrabold text-slate-900">{money(p.net, p.currency)}</td>
                    <td className="px-6 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                    <td className="px-6 py-3 text-right"><Button small variant="secondary" aria-label={`Download payslip for ${p.user?.name}`} onClick={() => downloadFile(`/admin/payroll/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`).catch((e) => setActionError(errorMessage(e)))}><Download size={12} />PDF</Button></td>
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

interface Slab { upTo: number | string | null; ratePercent: number | string }
interface TaxPolicy { slabs: Slab[]; standardDeduction: number | string; pfReducesTaxable: boolean }

// Company-wide income tax slabs. Rates are entered by the company: nothing statutory is assumed.
export const TaxPolicyEditor = ({ user }: { user: User }) => {
  const canWrite = can(user, 'payroll', 'write');
  const { data, loading, error } = useAsync(() => apiJson<TaxPolicy>('/admin/payroll/tax-policy'));
  const [draft, setDraft] = useState<TaxPolicy | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const policy = draft ?? data;

  const edit = (patch: Partial<TaxPolicy>) => { setSaved(false); setDraft({ ...policy!, ...patch }); };
  const setSlab = (i: number, patch: Partial<Slab>) => edit({ slabs: policy!.slabs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  // Keep the invariant "only the last slab is open-ended" while rows are added and removed
  const normalise = (slabs: Slab[]) => slabs.map((s, i) => (i === slabs.length - 1 ? { ...s, upTo: null } : s.upTo === null ? { ...s, upTo: '' } : s));
  const addSlab = () => edit({ slabs: normalise([...policy!.slabs, { upTo: null, ratePercent: '' }]) });
  const removeSlab = (i: number) => edit({ slabs: normalise(policy!.slabs.filter((_, j) => j !== i)) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy) return;
    try {
      setSaveError(null);
      const body = {
        slabs: policy.slabs.map((s) => ({ upTo: s.upTo === null || s.upTo === '' ? null : Number(s.upTo), ratePercent: Number(s.ratePercent) })),
        standardDeduction: Number(policy.standardDeduction || 0),
        pfReducesTaxable: policy.pfReducesTaxable
      };
      setDraft(await apiSend<TaxPolicy>('PUT', '/admin/payroll/tax-policy', body));
      setSaved(true);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  };

  return (
    <Card title="Income tax slabs">
      <ErrorNote error={error ?? saveError} />
      {loading && !policy ? <Spinner /> : policy && (
        <form onSubmit={save} className="space-y-5 max-w-2xl">
          <p className="text-sm text-slate-500">
            Tax is withheld monthly: yearly pay (after PF and pre-tax deductions, minus the standard deduction) is taxed band by band, then divided by 12.
            Each rate applies only to the income inside its band. With no slabs, every employee's flat tax % is used instead.
          </p>
          <div className="space-y-2">
            {policy.slabs.map((s, i) => {
              const last = i === policy.slabs.length - 1;
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-1 text-xs font-extrabold text-slate-400">#{i + 1}</span>
                  {last
                    ? <span className="col-span-5 text-sm text-slate-500">Everything above the previous band</span>
                    : <input aria-label={`Slab ${i + 1} upper limit`} required type="number" min="0" step="1" disabled={!canWrite} placeholder="Yearly income up to" className={`${inputClass} col-span-5`} value={s.upTo ?? ''} onChange={(e) => setSlab(i, { upTo: e.target.value })} />}
                  <input aria-label={`Slab ${i + 1} rate`} required type="number" min="0" max="100" step="0.01" disabled={!canWrite} placeholder="Rate %" className={`${inputClass} col-span-4`} value={s.ratePercent} onChange={(e) => setSlab(i, { ratePercent: e.target.value })} />
                  {canWrite && <button type="button" aria-label={`Remove slab ${i + 1}`} className="col-span-2 text-slate-400 hover:text-rose-600 justify-self-start" onClick={() => removeSlab(i)}><Trash2 size={14} /></button>}
                </div>
              );
            })}
            {!policy.slabs.length && <Empty>No slabs: flat tax % per employee is in use.</Empty>}
            {canWrite && <Button small variant="secondary" onClick={addSlab}><Plus size={12} />Add slab</Button>}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Standard deduction (per year)"><input type="number" min="0" step="1" disabled={!canWrite} className={inputClass} value={policy.standardDeduction} onChange={(e) => edit({ standardDeduction: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:mt-7"><input type="checkbox" disabled={!canWrite} checked={policy.pfReducesTaxable} onChange={(e) => edit({ pfReducesTaxable: e.target.checked })} />Provident fund reduces taxable income</label>
          </div>
          {canWrite && <div className="flex items-center gap-4"><Button type="submit">Save tax policy</Button>{saved && <span role="status" className="text-sm font-bold text-emerald-700">Saved. Applies to the next payroll run.</span>}</div>}
        </form>
      )}
    </Card>
  );
};
