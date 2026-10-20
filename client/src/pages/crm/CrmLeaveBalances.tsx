import { useMemo, useState } from 'react';
import type { User } from '../../types';
import { apiJson } from '../../lib/api';
import { can } from '../../lib/permissions';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { LeavePolicyEditor } from '../../components/leave/LeaveAdmin';
import { ErrorNote, PageHeader, Spinner, inputClass } from '../../components/ui';
import { PersonChip } from '../../components/crm/shared';

interface BalanceRow {
  userId: string; name: string; department: string | null; joinDate: string | null;
  balances: { type: string; total: number; taken: number; pending: number; remaining: number; carriedForward: number }[];
}

const LeaveBalances = ({ user }: { user: User }) => {
  const balances = useAsync(() => apiJson<BalanceRow[]>('/admin/leave-balances'));
  const [q, setQ] = useState('');
  const rows = balances.data ?? [];
  const types = useMemo(() => rows[0]?.balances.map((b) => b.type) ?? [], [rows]);
  const shown = rows.filter((r) => !q.trim() || `${r.name} ${r.department ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader title="Leave balances" subtitle={`Leave year ${year} · accrued monthly or upfront, prorated for people who joined this year`} />
      <ErrorNote error={balances.error} />

      {can(user, 'leave', 'write') && <LeavePolicyEditor onSaved={() => void balances.reload()} />}

      <section className="p-5 rounded-2xl bg-white border border-slate-200 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-extrabold text-slate-900">Employee balances</h2>
          <label className="flex-1 basis-56 max-w-xs text-[13px] font-bold text-slate-600">
            Search
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or department" className={`${inputClass} mt-1.5`} />
          </label>
        </div>
        {balances.loading && !balances.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">Employee</th>
                  {types.map((t) => <th key={t} scope="col" className="px-3 py-2.5 border-b border-slate-200 font-bold">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.userId} className="hover:bg-slate-50">
                    <td className="px-3 py-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <PersonChip person={{ id: r.userId, name: r.name }} />
                        <span className="flex flex-col"><span className="font-bold text-slate-900">{r.name}</span><span className="text-[13px] text-slate-500">{r.joinDate ? `Joined ${formatDate(r.joinDate)}` : r.department}</span></span>
                      </div>
                    </td>
                    {types.map((t) => {
                      const b = r.balances.find((x) => x.type === t);
                      return (
                        <td key={t} className="px-3 py-3 border-b border-slate-100">
                          {b ? (
                            <span className="flex flex-col"><span className="font-extrabold text-slate-900">{b.remaining} left</span><span className="text-[13px] text-slate-500">of {b.total} · used {b.taken}{b.pending ? ` · ${b.pending} pending` : ''}</span></span>
                          ) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <p className="mt-4 text-[15px] text-slate-500">No employees match this search.</p>}
          </div>
        )}
      </section>
    </div>
  );
};

export default LeaveBalances;
