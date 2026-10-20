import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { apiJson } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, Th, inputClass } from '../../components/ui';

interface Entry { id: string; createdAt: string; actorName: string; actorRole: string; action: string; summary: string; companyId: string | null }
interface Page { items: Entry[]; total: number; page: number; pages: number }
interface CompanyOption { id: string; name: string }

/** Everything the platform did on companies, including each unmasked support view. Companies see their own part of it. */
const PlatformAudit = () => {
  const [q, setQ] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ q: '', companyId: '' });
  const companies = useAsync(() => apiJson<CompanyOption[]>('/platform/companies?status='), []);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (applied.q) params.set('q', applied.q);
  if (applied.companyId) params.set('companyId', applied.companyId);
  const { data, loading, error } = useAsync(() => apiJson<Page>(`/platform/audit?${params}`), [page, applied.q, applied.companyId]);
  const names = new Map((companies.data ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Platform audit log" subtitle="Company onboarding, status changes, delete decisions and support-access views." />
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied({ q, companyId }); }} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input aria-label="Search the audit log" className={`${inputClass} pl-9`} placeholder="Search summary or person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Filter by company" className={`${inputClass} w-56`} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">All companies</option>
          {(companies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button type="submit">Filter</Button>
      </form>
      <ErrorNote error={error} />
      <Card flush>
        {loading && !data ? <Spinner /> : !data?.items.length ? <Empty>No matching activity.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50"><tr><Th>When</Th><Th>Company</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{a.companyId ? names.get(a.companyId) ?? '—' : 'Platform'}</td>
                    <td className="px-6 py-3 text-sm font-bold text-slate-900 whitespace-nowrap">{a.actorName}<span className="block text-xs font-semibold text-slate-400">{a.actorRole.replace('_', ' ')}</span></td>
                    <td className="px-6 py-3"><Badge tone={a.action.startsWith('support.') ? 'amber' : 'blue'}>{a.action}</Badge></td>
                    <td className="px-6 py-3 text-sm text-slate-600">{a.summary}</td>
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

export default PlatformAudit;
