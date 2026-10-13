import { useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { apiJson, downloadFile } from '../lib/api';
import { money, monthLabel, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, statusTone } from '../components/ui';

export interface PayslipRecord {
  id: string;
  month: string;
  currency: string;
  earnings: { basic: number; hra: number; allowances: number };
  deductions: { pf: number; tax: number; other: number };
  gross: number;
  totalDeductions: number;
  net: number;
  workingDays: number;
  paidDays: number;
  unpaidLeaveDays: number;
  status: 'Generated' | 'Paid';
}

const Row = ({ label, value, currency, strong = false }: { label: string; value: number; currency: string; strong?: boolean }) => (
  <div className={`flex justify-between py-1.5 text-sm ${strong ? 'font-black text-slate-900 border-t border-slate-200 mt-1 pt-2' : 'text-slate-600'}`}>
    <span>{label}</span><span>{money(value, currency)}</span>
  </div>
);

const Payslips = () => {
  const { data, loading, error } = useAsync(() => apiJson<PayslipRecord[]>('/user/payslips'));
  const [open, setOpen] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = async (p: PayslipRecord) => {
    try {
      setDownloadError(null);
      await downloadFile(`/user/payslips/${p.id}/pdf`, `payslip-${p.month}.pdf`);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="My payslips" subtitle="Download a PDF of any month's payslip." />
      <ErrorNote error={error ?? downloadError} />
      {loading ? <Spinner /> : !data?.length ? (
        <Card><Empty>No payslips yet. They appear here once payroll has run for a month.</Empty></Card>
      ) : (
        <div className="space-y-3">
          {data.map((p) => (
            <Card key={p.id} flush>
              <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                <button onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} className="flex-1 min-w-48 flex items-center gap-3 text-left">
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${open === p.id ? 'rotate-180' : ''}`} />
                  <span>
                    <span className="block font-black text-slate-900">{monthLabel(p.month)}</span>
                    <span className="block text-xs text-slate-400">{p.paidDays} of {p.workingDays} days paid</span>
                  </span>
                </button>
                <div className="text-right">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Net pay</p>
                  <p className="text-lg font-black text-slate-900">{money(p.net, p.currency)}</p>
                </div>
                <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                <Button small variant="secondary" onClick={() => download(p)}><Download size={13} />PDF</Button>
              </div>
              {open === p.id && (
                <div className="grid sm:grid-cols-2 gap-8 px-6 pb-6 pt-2 border-t border-slate-100">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Earnings</h3>
                    <Row label="Basic" value={p.earnings.basic} currency={p.currency} />
                    <Row label="House rent allowance" value={p.earnings.hra} currency={p.currency} />
                    <Row label="Other allowances" value={p.earnings.allowances} currency={p.currency} />
                    <Row label="Gross" value={p.gross} currency={p.currency} strong />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Deductions</h3>
                    <Row label="Provident fund" value={p.deductions.pf} currency={p.currency} />
                    <Row label="Income tax" value={p.deductions.tax} currency={p.currency} />
                    <Row label="Other" value={p.deductions.other} currency={p.currency} />
                    <Row label="Total deductions" value={p.totalDeductions} currency={p.currency} strong />
                  </div>
                  {p.unpaidLeaveDays > 0 && <p className="sm:col-span-2 text-xs text-amber-700 font-semibold">{p.unpaidLeaveDays} unpaid leave day(s) were deducted this month.</p>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Payslips;
