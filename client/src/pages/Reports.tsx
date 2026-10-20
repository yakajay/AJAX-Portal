import { useState } from 'react';
import { Download } from 'lucide-react';
import type { User } from '../types';
import { apiJson, downloadFile } from '../lib/api';
import { can } from '../lib/permissions';
import { money, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Button, Card, Empty, ErrorNote, PageHeader, Spinner, StatTile, Th, inputClass } from '../components/ui';

interface Workforce {
  headcount: number; locked: number; attritionPercent: number; averageTenureYears: number; leaversLast12Months: number;
  byDepartment: { name: string; count: number }[]; trend: { month: string; joiners: number; leavers: number }[];
}
interface PayrollCost { months: { month: string; employees: number; gross: number; deductions: number; net: number; paid: number }[]; byDepartment: { department: string; gross: number; net: number }[] }
interface LeaveUsage { totalDays: number; byType: { name: string; days: number }[]; byDepartment: { name: string; days: number }[] }

const thisMonth = () => new Date().toISOString().slice(0, 7);

const Reports = ({ user }: { user: User | null }) => {
  const [month, setMonth] = useState(thisMonth());
  const [error, setError] = useState<string | null>(null);
  const canUsers = can(user, 'users', 'read');
  const canPay = can(user, 'payroll', 'read');
  const canLeave = can(user, 'leave', 'read');
  const canAtt = can(user, 'attendance', 'read');

  const workforce = useAsync(() => (canUsers ? apiJson<Workforce>('/admin/reports/workforce') : Promise.resolve(null)), [canUsers]);
  const payroll = useAsync(() => (canPay ? apiJson<PayrollCost>('/admin/reports/payroll') : Promise.resolve(null)), [canPay]);
  const leave = useAsync(() => (canLeave ? apiJson<LeaveUsage>('/admin/reports/leave') : Promise.resolve(null)), [canLeave]);

  const download = async (path: string, name: string) => {
    try { setError(null); await downloadFile(path, name); } catch (err) { setError(errorMessage(err)); }
  };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Headcount, payroll cost, leave and attendance, with CSV exports." />
      <ErrorNote error={error ?? workforce.error ?? payroll.error ?? leave.error} />

      <Card>
        <h2 className="text-sm font-extrabold text-slate-900 mb-3">Exports</h2>
        <div className="flex flex-wrap items-end gap-3">
          <input type="month" aria-label="Month" className={`${inputClass} w-44`} value={month} onChange={(e) => setMonth(e.target.value)} />
          {canUsers && <Button variant="secondary" onClick={() => download('/admin/users/export', 'employees.csv')}><Download size={14} />Employees</Button>}
          {canPay && <Button variant="secondary" onClick={() => download(`/admin/payroll/payslips/export?month=${month}`, `payslips-${month}.csv`)}><Download size={14} />Payslips for month</Button>}
          {canAtt && <Button variant="secondary" onClick={() => download(`/admin/attendance/report?format=csv&month=${month}&tz=${encodeURIComponent(tz)}`, `attendance-${month}.csv`)}><Download size={14} />Attendance &amp; overtime</Button>}
        </div>
      </Card>

      {canUsers && (workforce.loading ? <Spinner /> : workforce.data && (
        <section className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-4">
            <StatTile label="Headcount" value={workforce.data.headcount} hint={`${workforce.data.locked} locked`} />
            <StatTile label="Leavers (12 mo)" value={workforce.data.leaversLast12Months} />
            <StatTile label="Attrition" value={`${workforce.data.attritionPercent}%`} />
            <StatTile label="Avg tenure" value={`${workforce.data.averageTenureYears} yrs`} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card flush>
              <table className="w-full text-left"><thead className="bg-slate-50"><tr><Th>Department</Th><Th right>People</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{workforce.data.byDepartment.map((d) => <tr key={d.name}><td className="px-6 py-3 text-sm">{d.name}</td><td className="px-6 py-3 text-sm font-bold text-right">{d.count}</td></tr>)}</tbody></table>
            </Card>
            <Card flush>
              <table className="w-full text-left"><thead className="bg-slate-50"><tr><Th>Month</Th><Th right>Joiners</Th><Th right>Leavers</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">{workforce.data.trend.map((t) => <tr key={t.month}><td className="px-6 py-3 text-sm">{t.month}</td><td className="px-6 py-3 text-sm text-right">{t.joiners}</td><td className="px-6 py-3 text-sm text-right">{t.leavers}</td></tr>)}</tbody></table>
            </Card>
          </div>
        </section>
      ))}

      {canPay && payroll.data && (
        <Card flush>
          {!payroll.data.months.length ? <Empty>No payslips in the last six months.</Empty> : (
            <table className="w-full text-left"><thead className="bg-slate-50"><tr><Th>Month</Th><Th right>Employees</Th><Th right>Gross</Th><Th right>Deductions</Th><Th right>Net</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">{payroll.data.months.map((m) => <tr key={m.month}><td className="px-6 py-3 text-sm">{m.month}</td><td className="px-6 py-3 text-sm text-right">{m.employees}</td><td className="px-6 py-3 text-sm text-right">{money(m.gross, 'INR')}</td><td className="px-6 py-3 text-sm text-right">{money(m.deductions, 'INR')}</td><td className="px-6 py-3 text-sm font-bold text-right">{money(m.net, 'INR')}</td></tr>)}</tbody></table>
          )}
        </Card>
      )}

      {canLeave && leave.data && (
        <Card flush>
          <table className="w-full text-left"><thead className="bg-slate-50"><tr><Th>Leave taken this year ({leave.data.totalDays} days)</Th><Th right>Days</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">{leave.data.byType.map((t) => <tr key={t.name}><td className="px-6 py-3 text-sm">{t.name}</td><td className="px-6 py-3 text-sm font-bold text-right">{t.days}</td></tr>)}</tbody></table>
        </Card>
      )}
    </div>
  );
};

export default Reports;
