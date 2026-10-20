import { useEffect, useState } from 'react';
import { Download, ShieldCheck, Landmark, BookOpen } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, downloadFile } from '../../lib/api';
import { can } from '../../lib/permissions';
import { currentMonth, errorMessage, monthLabel, money } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Spinner, StatTile, inputClass } from '../ui';

const recentMonths = () => Array.from({ length: 12 }, (_, i) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});

interface Finding { severity: 'error' | 'warning' | 'info'; code: string; userId: string; name: string; message: string }
interface ChecksResult {
  month: string; previousMonth: string; previousRunFound: boolean; findings: Finding[];
  summary: { errors: number; warnings: number; info: number; payslips: number; compared: number; thresholdPercent: number };
}
const tone = { error: 'rose', warning: 'amber', info: 'slate' } as const;

const ChecksPanel = ({ month }: { month: string }) => {
  const [threshold, setThreshold] = useState('20');
  const { data, loading, error } = useAsync(() => apiJson<ChecksResult>(`/admin/payroll/checks?month=${month}&threshold=${Number(threshold) > 0 ? threshold : 20}`), [month, threshold]);
  return (
    <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} />Checks against the previous run</span>} actions={
      <label className="text-xs text-slate-500 flex items-center gap-2">Flag changes of
        <input aria-label="Change threshold percent" type="number" min="1" step="1" className={`${inputClass} w-20 py-1.5`} value={threshold} onChange={(e) => setThreshold(e.target.value)} />%
      </label>
    }>
      <ErrorNote error={error} />
      {loading && !data ? <Spinner /> : data && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <StatTile label="Errors" value={data.summary.errors} hint="Fix before paying" />
            <StatTile label="Warnings" value={data.summary.warnings} hint="Worth a look" />
            <StatTile label="Compared" value={`${data.summary.compared}/${data.summary.payslips}`} hint={data.previousRunFound ? `with ${monthLabel(data.previousMonth)}` : `no run found for ${monthLabel(data.previousMonth)}`} />
          </div>
          {!data.summary.payslips ? <Empty>No payslips for {monthLabel(month)} yet. Generate them first.</Empty>
            : !data.findings.length ? <p role="status" className="text-sm font-bold text-emerald-700">Nothing unusual compared with {monthLabel(data.previousMonth)}.</p>
            : (
              <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {data.findings.map((f, i) => (
                  <li key={`${f.userId}-${f.code}-${i}`} className="px-4 py-3 flex items-start gap-3">
                    <Badge tone={tone[f.severity]}>{f.severity}</Badge>
                    <div><p className="text-sm font-bold text-slate-900">{f.name}</p><p className="text-sm text-slate-600">{f.message}</p></div>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </Card>
  );
};

interface Entity { id: string; name: string; active: boolean }
interface BankPreview { ready: number; total: number; currency: string | null; skipped: { userId: string; name: string; reason: string }[]; formats: { id: string; label: string }[] }

const BankPanel = ({ month }: { month: string }) => {
  const [format, setFormat] = useState('standard');
  const [entityId, setEntityId] = useState('');
  const [includePaid, setIncludePaid] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => { apiJson<Entity[]>('/admin/entities').then((e) => setEntities(e.filter((x) => x.active))).catch(() => setEntities([])); }, []);
  const query = `month=${month}&format=${format}&includePaid=${includePaid}${entityId ? `&entityId=${entityId}` : ''}`;
  const { data, loading, error } = useAsync(() => apiJson<BankPreview>(`/admin/payroll/bank-export/preview?${query}`), [query]);

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Landmark size={16} />Bank payment file</span>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Download the net pay and account details for {monthLabel(month)} to upload in your bank's bulk-payment portal. Each download is recorded in the audit log. Check the column order against your bank's current template.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Layout"><select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value)}>
            {(data?.formats ?? [{ id: 'standard', label: 'Standard (all details)' }]).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select></Field>
          <Field label="Employer record"><select className={inputClass} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">All employees</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></Field>
          <label className="flex items-center gap-2 text-sm text-slate-600 sm:mt-7"><input type="checkbox" checked={includePaid} onChange={(e) => setIncludePaid(e.target.checked)} />Include payslips already paid</label>
        </div>
        <ErrorNote error={error ?? actionError} />
        {loading && !data ? <Spinner /> : data && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700"><b>{data.ready}</b> {data.ready === 1 ? 'person is' : 'people are'} ready{data.currency ? <>, total <b>{money(data.total, data.currency)}</b></> : null}.</p>
            {data.skipped.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-sm font-bold text-amber-800">{data.skipped.length} left out of the file</p>
                <ul className="mt-1 text-sm text-amber-800 list-disc pl-5">{data.skipped.map((s) => <li key={s.userId}>{s.name}: {s.reason}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <Button disabled={!data?.ready} onClick={() => { setActionError(null); downloadFile(`/admin/payroll/bank-export?${query}`, `bank-file-${month}.csv`).catch((e) => setActionError(errorMessage(e))); }}><Download size={14} />Download bank file</Button>
      </div>
    </Card>
  );
};

const ACCOUNT_LABELS: Record<string, string> = {
  salaryExpense: 'Salaries expense (debit: gross pay)', pfPayable: 'Provident fund payable (credit)', taxPayable: 'Income tax withheld payable (credit)',
  otherPayable: 'Other deductions payable (credit)', salariesPayable: 'Salaries payable (credit: net pay)'
};
interface AccountingSettings { accounts: Record<string, string>; defaults: Record<string, string>; entityName: string; formats: { id: string; label: string }[] }
interface JournalPreview { payslips: number; currency: string | null; date: string; lines: { account: string; debit: string; credit: string }[] }

const AccountingPanel = ({ month, canWrite }: { month: string; canWrite: boolean }) => {
  const { data: settings, loading, error } = useAsync(() => apiJson<AccountingSettings>('/admin/payroll/accounting'));
  const [draft, setDraft] = useState<AccountingSettings | null>(null);
  const [format, setFormat] = useState('csv');
  const [saved, setSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: preview, error: previewError, reload: reloadPreview } = useAsync(() => apiJson<JournalPreview>(`/admin/payroll/accounting-export/preview?month=${month}`), [month]);
  const current = draft ?? settings;

  const save = async () => {
    if (!current) return;
    setActionError(null);
    try { setDraft(await apiSend<AccountingSettings>('PUT', '/admin/payroll/accounting', { accounts: current.accounts, entityName: current.entityName })); setSaved(true); await reloadPreview(); }
    catch (e) { setActionError(errorMessage(e)); }
  };
  const edit = (next: AccountingSettings) => { setSaved(false); setDraft(next); };

  return (
    <Card title={<span className="inline-flex items-center gap-2"><BookOpen size={16} />Accounting journal</span>}>
      <div className="space-y-5">
        <p className="text-sm text-slate-500">Exports one balanced payroll journal for {monthLabel(month)} that you import into your accounting package. This is a file export, not a live connection: Xero, QuickBooks Online, Tally Prime or any package that takes a CSV journal. Use your own ledger account names or codes below so the entry lands in the right accounts.</p>
        <ErrorNote error={error ?? actionError ?? previewError} />
        {loading && !current ? <Spinner /> : current && (
          <>
            <div className="grid sm:grid-cols-2 gap-4">
              {Object.keys(ACCOUNT_LABELS).map((key) => (
                <Field key={key} label={ACCOUNT_LABELS[key]}>
                  <input disabled={!canWrite} className={inputClass} maxLength={120} value={current.accounts[key]} onChange={(e) => edit({ ...current, accounts: { ...current.accounts, [key]: e.target.value } })} />
                </Field>
              ))}
              <Field label="Company name in Tally (optional)"><input disabled={!canWrite} className={inputClass} maxLength={120} value={current.entityName} onChange={(e) => edit({ ...current, entityName: e.target.value })} /></Field>
            </div>
            {canWrite && <div className="flex items-center gap-4"><Button variant="secondary" onClick={save}>Save accounts</Button>{saved && <span role="status" className="text-sm font-bold text-emerald-700">Saved.</span>}</div>}
          </>
        )}
        {preview && preview.lines.length > 0 && (
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400"><tr><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{preview.lines.map((l, i) => <tr key={i}><td className="px-4 py-2">{l.account}</td><td className="px-4 py-2 text-right">{l.debit}</td><td className="px-4 py-2 text-right">{l.credit}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {preview && !preview.lines.length && <Empty>No payslips for {monthLabel(month)} yet.</Empty>}
        {canWrite && (
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Format"><select className={`${inputClass} w-72`} value={format} onChange={(e) => setFormat(e.target.value)}>
              {(settings?.formats ?? [{ id: 'csv', label: 'Generic journal (CSV)' }]).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select></Field>
            <Button disabled={!preview?.lines.length} onClick={() => { setActionError(null); downloadFile(`/admin/payroll/accounting-export?month=${month}&format=${format}`, `payroll-journal-${month}.${format === 'tally' ? 'xml' : 'csv'}`).catch((e) => setActionError(errorMessage(e))); }}><Download size={14} />Download journal</Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export const PayrollControls = ({ user }: { user: User }) => {
  const [month, setMonth] = useState(currentMonth());
  const canWrite = can(user, 'payroll', 'write');
  return (
    <div className="space-y-6">
      <select aria-label="Payroll month" className={`${inputClass} w-56`} value={month} onChange={(e) => setMonth(e.target.value)}>
        {recentMonths().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <ChecksPanel month={month} />
      {canWrite && <BankPanel month={month} />}
      <AccountingPanel month={month} canWrite={canWrite} />
    </div>
  );
};
