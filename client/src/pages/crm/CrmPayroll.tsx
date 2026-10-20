import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, money, monthLabel } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, StatTile, inputClass, statusTone } from '../../components/ui';

interface PayslipRow {
  id: string; month: string; currency: string; gross: number; totalDeductions: number; net: number;
  paidDays: number; workingDays: number; unpaidLeaveDays: number; status: 'Generated' | 'Paid';
  earnings: { basic: number; hra: number; allowances: number };
  deductions: { pf: number; tax: number; other: number };
  deductionItems?: { name: string; amount: number }[];
  user?: { name: string; department?: string };
}
interface StructureRow {
  user: { id: string; name: string; designation?: string };
  structure: { basic: number; hra: number; allowances: number; currency: string } | null;
}

const recentMonths = () => Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});

const Line = ({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1.5 text-[15px] ${strong ? 'mt-1 pt-2.5 border-t border-slate-200 font-extrabold text-slate-900' : 'text-slate-600'}`}>
    <span>{label}</span><span>{money(value, currency)}</span>
  </div>
);

const Payroll = ({ user }: { user: User }) => {
  const canWrite = can(user, 'payroll', 'write');
  const [month, setMonth] = useState(currentMonth());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slips = useAsync(() => apiJson<PayslipRow[]>(`/admin/payroll/payslips?month=${month}`), [month]);
  const structures = useAsync(() => apiJson<StructureRow[]>('/admin/payroll/structures'));

  const rows = slips.data ?? [];
  const current = rows.find((r) => r.id === pickedId) ?? rows[0];
  const withStructure = (structures.data ?? []).filter((s) => s.structure).length;
  const totals = rows.reduce((a, p) => ({ gross: a.gross + p.gross, net: a.net + p.net }), { gross: 0, net: 0 });
  const currency = rows[0]?.currency ?? 'INR';
  const unpaid = rows.some((p) => p.status === 'Generated');

  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setActionError(null);
    try { setBanner(await fn()); await slips.reload(); } catch (e) { setActionError(errorMessage(e)); } finally { setBusy(false); }
  };
  const generate = () => act(async () => {
    const r = await apiSend<{ created: number; skipped: number; totalNet: number; currency: string }>('POST', '/admin/payroll/run-monthly', { month });
    return r.created
      ? `Generated ${r.created} payslip(s) for ${monthLabel(month)}, net total ${money(r.totalNet, r.currency)}. Employees can see them under Payslips.`
      : `Nothing to generate: ${r.skipped} payslip(s) already exist for ${monthLabel(month)}.`;
  });
  const markPaid = () => act(async () => {
    const r = await apiSend<{ paid: number }>('POST', '/admin/payroll/payslips/mark-paid', { month });
    return `Marked ${r.paid} payslip(s) as paid.`;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Payroll"
        subtitle="Payslips are built from each employee’s salary structure and approved unpaid leave"
        actions={canWrite && <Button disabled={busy} onClick={generate}>Generate payslips · {monthLabel(month)}</Button>}
      />
      <ErrorNote error={actionError ?? slips.error ?? structures.error} />
      {banner && <p role="status" className="text-sm font-semibold text-blue-800">{banner}</p>}

      <section className="flex flex-wrap items-end gap-4">
        <label className="text-[13px] font-bold text-slate-600">
          Pay month
          <select className={`${inputClass} mt-1.5 w-56`} value={month} onChange={(e) => { setMonth(e.target.value); setPickedId(null); setBanner(null); }}>
            {recentMonths().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        {canWrite && <Button variant="secondary" disabled={busy || !unpaid} onClick={markPaid}>Mark all as paid</Button>}
        {can(user, 'payroll', 'read') && <Link to="/payroll" className="min-h-11 inline-flex items-center text-sm font-bold text-blue-800 hover:underline">Salary structures, bank file and accounting →</Link>}
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
        <StatTile label="Payslips this month" value={String(rows.length)} hint={`${withStructure} people have a salary structure`} />
        <StatTile label="Gross" value={money(totals.gross, currency)} />
        <StatTile label="Net payable" value={money(totals.net, currency)} hint={unpaid ? 'Waiting to be marked paid' : rows.length ? 'All paid' : undefined} />
      </section>

      {slips.loading && !slips.data ? <Spinner /> : !current ? (
        <div className="bg-white rounded-2xl border border-slate-200"><Empty>No payslips for {monthLabel(month)} yet. Generate them to publish to your employees’ Payslips page.</Empty></div>
      ) : (
        <section className="flex flex-wrap gap-5 items-start">
          <div className="flex-[4] basis-[34rem] min-w-0 p-5 rounded-2xl bg-white border border-slate-200">
            <h2 className="text-lg font-extrabold text-slate-900 mb-3">Generated payslips</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500">
                    {['Employee', 'Paid days', 'Gross', 'Net pay', 'Status'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">{h}</th>)}
                    <th scope="col" className="px-3 py-2.5 border-b border-slate-200"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={p.id === current.id ? 'bg-blue-50' : 'hover:bg-slate-50'}>
                      <td className="px-3 py-3 border-b border-slate-100 font-bold text-slate-900">{p.user?.name}</td>
                      <td className="px-3 py-3 border-b border-slate-100 text-slate-600">{p.paidDays}/{p.workingDays}</td>
                      <td className="px-3 py-3 border-b border-slate-100 text-slate-600">{money(p.gross, p.currency)}</td>
                      <td className="px-3 py-3 border-b border-slate-100 font-extrabold text-slate-900">{money(p.net, p.currency)}</td>
                      <td className="px-3 py-3 border-b border-slate-100"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                      <td className="px-3 py-3 border-b border-slate-100 text-right whitespace-nowrap">
                        <Button small variant="ghost" aria-pressed={p.id === current.id} aria-label={`Preview payslip for ${p.user?.name}`} onClick={() => setPickedId(p.id)}>Preview</Button>
                        <Button small variant="ghost" aria-label={`Download payslip for ${p.user?.name}`} onClick={() => downloadFile(`/admin/payroll/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`).catch((e) => setActionError(errorMessage(e)))}>PDF</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <article className="flex-[2] basis-72 min-w-0 p-6 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4" aria-live="polite">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-slate-500">Payslip preview · {monthLabel(current.month)}</span>
              <h2 className="text-xl font-extrabold text-slate-900">{current.user?.name}</h2>
              <span className="text-[13px] text-slate-500">{current.user?.department}</span>
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-slate-500 mb-1">Earnings</h3>
              <Line label="Basic" value={current.earnings.basic} currency={current.currency} />
              <Line label="House rent allowance" value={current.earnings.hra} currency={current.currency} />
              <Line label="Other allowances" value={current.earnings.allowances} currency={current.currency} />
              <Line label="Gross" value={current.gross} currency={current.currency} strong />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-slate-500 mb-1">Deductions</h3>
              <Line label="Provident fund" value={current.deductions.pf} currency={current.currency} />
              <Line label="Income tax" value={current.deductions.tax} currency={current.currency} />
              {current.deductionItems?.length
                ? current.deductionItems.map((d) => <Line key={d.name} label={d.name} value={d.amount} currency={current.currency} />)
                : <Line label="Other" value={current.deductions.other} currency={current.currency} />}
              <Line label="Total deductions" value={current.totalDeductions} currency={current.currency} strong />
            </div>
            <div className="flex items-baseline justify-between gap-4 p-4 rounded-xl bg-blue-600 text-white">
              <span className="font-bold">Net pay</span>
              <span className="text-2xl font-extrabold">{money(current.net, current.currency)}</span>
            </div>
            {current.unpaidLeaveDays > 0 && <p className="text-[13px] font-semibold text-amber-700">{current.unpaidLeaveDays} unpaid leave day(s) were deducted.</p>}
          </article>
        </section>
      )}
    </div>
  );
};

export default Payroll;
