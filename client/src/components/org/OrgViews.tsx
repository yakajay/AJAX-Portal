import { useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { User } from '../../types';
import { apiJson, apiSend, requestDelete } from '../../lib/api';
import { can } from '../../lib/permissions';
import { errorMessage } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Avatar } from '../Avatar';
import { Button, Card, Empty, ErrorNote, Field, Modal, Spinner, inputClass } from '../ui';

interface OrgNode { id: string; name: string; email: string; employeeId?: string | null; avatarVersion?: number | null; department?: string; designation?: string; reports: OrgNode[] }

const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const Node = ({ node, depth, query }: { node: OrgNode; depth: number; query: string }) => {
  const [open, setOpen] = useState(depth < 2);
  const match = query && node.name.toLowerCase().includes(query);
  return (
    <li>
      <div className={`inline-flex items-center gap-3 rounded-xl border px-3 py-2 bg-white ${match ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200'}`}>
        <span className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold overflow-hidden flex items-center justify-center shrink-0" aria-hidden="true"><Avatar person={node} initials={initials(node.name)} /></span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900">{node.name}</span>
          <span className="block text-xs text-slate-400">{[node.employeeId, node.designation, node.department].filter(Boolean).join(' · ') || node.email}</span>
        </span>
        {node.reports.length > 0 && (
          <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.name}'s team`} className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{node.reports.length}
          </button>
        )}
      </div>
      {open && node.reports.length > 0 && (
        <ul className="ml-5 mt-2 pl-5 border-l-2 border-slate-200 space-y-2">
          {node.reports.map((child) => <Node key={child.id} node={child} depth={depth + 1} query={query} />)}
        </ul>
      )}
    </li>
  );
};

export const OrgChart = () => {
  const { data, loading, error } = useAsync(() => apiJson<OrgNode[]>('/user/org-chart'));
  const [query, setQuery] = useState('');
  return (
    <Card title="Reporting structure" actions={<input aria-label="Highlight a person" className={`${inputClass} !w-56 !py-1.5`} placeholder="Highlight a person…" value={query} onChange={(e) => setQuery(e.target.value.toLowerCase())} />}>
      <ErrorNote error={error} />
      {loading ? <Spinner /> : !data?.length ? <Empty>No reporting lines yet. Set a manager on each employee to build the chart.</Empty> : (
        <ul className="space-y-3 overflow-x-auto pb-2">{data.map((root) => <Node key={root.id} node={root} depth={0} query={query} />)}</ul>
      )}
    </Card>
  );
};

interface Department { id: string; name: string; description: string; memberCount: number; head?: { id?: string; name: string } | null; headId?: string | null }

export const Departments = ({ user }: { user: User }) => {
  const canWrite = can(user, 'org', 'write');
  const canDelete = can(user, 'org', 'delete');
  const { data, loading, error, reload } = useAsync(() => apiJson<Department[]>('/user/departments'));
  const people = useAsync(() => (canWrite ? apiJson<{ id: string; name: string }[]>('/user/directory') : Promise.resolve([])), [canWrite]);
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [form, setForm] = useState({ name: '', description: '', headId: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const open = (d: Department | 'new') => {
    setEditing(d);
    setFormError(null);
    setForm(d === 'new' ? { name: '', description: '', headId: '' } : { name: d.name, description: d.description, headId: d.headId ?? '' });
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { ...form, headId: form.headId || null };
      if (editing === 'new') await apiSend('POST', '/admin/departments', body);
      else if (editing) await apiSend('PUT', `/admin/departments/${editing.id}`, body);
      setEditing(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };
  const remove = async (d: Department) => {
    if (!window.confirm(`Request deletion of the ${d.name} department? The platform's Super Admin has to approve it.`)) return;
    try { setActionError(null); alert(await requestDelete(`/admin/departments/${d.id}`)); await reload(); } catch (err) { setActionError(errorMessage(err)); }
  };

  return (
    <div className="space-y-4">
      {canWrite && <div className="flex justify-end"><Button onClick={() => open('new')}><Plus size={14} />New department</Button></div>}
      <ErrorNote error={error ?? actionError} />
      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900">{d.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{d.description || 'No description'}</p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0">
                    <button aria-label={`Edit ${d.name}`} className="p-2 text-slate-400 hover:text-blue-600" onClick={() => open(d)}><Pencil size={15} /></button>
                    {canDelete && <button aria-label={`Delete ${d.name}`} className="p-2 text-slate-400 hover:text-rose-600" onClick={() => remove(d)}><Trash2 size={15} /></button>}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500">
                <span className="inline-flex items-center gap-1"><Users size={14} />{d.memberCount} {d.memberCount === 1 ? 'person' : 'people'}</span>
                <span>Head: {d.head?.name ?? '—'}</span>
              </div>
            </Card>
          ))}
          {!data?.length && <Card><Empty>No departments yet.</Empty></Card>}
        </div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'New department' : 'Edit department'} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Department head"><select className={inputClass} value={form.headId} onChange={(e) => setForm({ ...form, headId: e.target.value })}><option value="">None</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>
    </div>
  );
};
