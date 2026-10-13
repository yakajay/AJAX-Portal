import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { apiJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, Th, inputClass } from '../components/ui';

interface AuditEntry {
  id: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  summary: string;
  ip: string;
}
interface AuditPage { items: AuditEntry[]; total: number; page: number; pages: number }

const ENTITIES = ['user', 'leave', 'attendance', 'payroll', 'salary', 'transaction', 'document', 'contractor', 'invoice', 'timesheet', 'ticket', 'department', 'announcement', 'expense', 'review_cycle', 'review', 'checklist'];

const AuditLog = () => {
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ q: '', entity: '' });

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (applied.q) params.set('q', applied.q);
  if (applied.entity) params.set('entity', applied.entity);
  const { data, loading, error } = useAsync(() => apiJson<AuditPage>(`/admin/audit?${params}`), [page, applied.q, applied.entity]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setApplied({ q, entity });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" subtitle="Who changed what, and when. Visible to Super Admins only." />
      <form onSubmit={search} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input aria-label="Search the audit log" className={`${inputClass} pl-9`} placeholder="Search summary or person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Filter by area" className={`${inputClass} w-48`} value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All areas</option>
          {ENTITIES.map((en) => <option key={en} value={en}>{en.replace('_', ' ')}</option>)}
        </select>
        <Button type="submit">Filter</Button>
      </form>
      <ErrorNote error={error} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.items.length ? <Empty>No matching activity.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th><Th>IP</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900 whitespace-nowrap">{a.actorName}<span className="block text-[10px] font-semibold text-slate-400">{a.actorRole.replace('_', ' ')}</span></td>
                    <td className="px-6 py-3"><Badge tone="blue">{a.action}</Badge></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{a.summary}</td>
                    <td className="px-6 py-3 text-xs text-slate-400 whitespace-nowrap">{a.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400 font-semibold">{data.total} entries · page {data.page} of {data.pages}</span>
          <div className="flex gap-2">
            <Button small variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} />Previous</Button>
            <Button small variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next<ChevronRight size={14} /></Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLog;
