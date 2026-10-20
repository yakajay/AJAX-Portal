import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiJson, downloadFile } from '../lib/api';
import { money, monthLabel, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, statusTone } from '../components/ui';

export interface PayslipRecord {
  id: string;
  month: string;
  currency: string;
  earnings: { basic: number; hra: number; allowances: number };
  deductions: { pf: number; tax: number; other: number };
  deductionItems?: { name: string; amount: number }[];
  taxMethod?: 'flat' | 'slabs';
  gross: number;
  totalDeductions: number;
  net: number;
  workingDays: number;
  paidDays: number;
  unpaidLeaveDays: number;
  status: 'Generated' | 'Paid';
}

const Row = ({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1.5 text-[15px] ${strong ? 'font-extrabold text-slate-900 border-t border-slate-200 mt-1 pt-2.5' : 'text-slate-600'}`}>
    <span>{label}</span><span>{money(value, currency)}</span>
  </div>
);

const Payslips = () => {
  const { data, loading, error } = useAsync(() => apiJson<PayslipRecord[]>('/user/payslips'));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const slips = data ?? [];
  const current = slips.find((p) => p.id === pickedId) ?? slips[0];

  const download = async (p: PayslipRecord) => {
    try {
      setDownloadError(null);
      await downloadFile(`/user/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Payslips" subtitle="Pick a month to see the breakup, or download it as a PDF" />
      <ErrorNote error={error ?? downloadError} />
      {loading && !data ? <Spinner /> : !current ? (
        <div className="bg-white rounded-2xl border border-slate-200"><Empty>No payslips yet. They appear here once payroll has run for a month.</Empty></div>
      ) : (
        <div className="flex flex-wrap gap-5 items-start">
          <ul className="flex-1 basis-60 min-w-0 flex flex-col gap-2" aria-label="Payslip months">
            {slips.map((p) => {
              const on = p.id === current.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPickedId(p.id)}
                    className={`w-full min-h-14 px-4 py-3 rounded-xl border-[1.5px] flex items-center justify-between gap-3 text-left transition-colors ${on ? 'border-blue-600 bg-blue-100' : 'border-slate-200 bg-white hover:bg-blue-50'}`}
                  >
                    <span className="font-bold text-[15px] text-slate-900">{monthLabel(p.month)}</span>
                    <span className="text-[15px] font-semibold text-slate-600">{money(p.net, p.currency)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <article className="flex-[3] basis-[26rem] min-w-0 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-slate-500">Payslip for</span>
                <h2 className="text-2xl font-extrabold text-slate-900">{monthLabel(current.month)}</h2>
                <span className="text-[13px] text-slate-500">{current.paidDays} of {current.workingDays} days paid</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={statusTone(current.status)}>{current.status}</Badge>
                <Button onClick={() => download(current)}><Download size={16} aria-hidden="true" />Download PDF</Button>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-8">
              <div>
                <h3 className="text-[13px] font-bold text-slate-500 mb-1.5">Earnings</h3>
                <Row label="Basic" value={current.earnings.basic} currency={current.currency} />
                <Row label="House rent allowance" value={current.earnings.hra} currency={current.currency} />
                <Row label="Other allowances" value={current.earnings.allowances} currency={current.currency} />
                <Row label="Gross" value={current.gross} currency={current.currency} strong />
              </div>
              <div>
                <h3 className="text-[13px] font-bold text-slate-500 mb-1.5">Deductions</h3>
                <Row label="Provident fund" value={current.deductions.pf} currency={current.currency} />
                <Row label="Income tax" value={current.deductions.tax} currency={current.currency} />
                {current.deductionItems?.length
                  ? current.deductionItems.map((l) => <Row key={l.name} label={l.name} value={l.amount} currency={current.currency} />)
                  : <Row label="Other" value={current.deductions.other} currency={current.currency} />}
                <Row label="Total deductions" value={current.totalDeductions} currency={current.currency} strong />
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-4 p-5 rounded-xl bg-blue-600 text-white">
              <span className="text-base font-bold">Net pay</span>
              <span className="text-[28px] font-extrabold tracking-tight">{money(current.net, current.currency)}</span>
            </div>
            {current.unpaidLeaveDays > 0 && <p className="text-[13px] font-semibold text-amber-700">{current.unpaidLeaveDays} unpaid leave day(s) were deducted this month.</p>}
          </article>
        </div>
      )}
    </div>
  );
};

export default Payslips;
