import { useState } from 'react';
import { CheckCircle2, Circle, Plus, Trash2, UserPlus } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend, requestDelete } from '../lib/api';
import { can } from '../lib/permissions';
import { errorMessage, formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, inputClass, statusTone } from '../components/ui';

interface Task { id: string; title: string; description: string; owner: 'EMPLOYEE' | 'HR'; requiresAck: boolean; done: boolean; acknowledged: boolean; doneAt: string | null }
interface ChecklistRecord { id: string; kind: 'ONBOARDING' | 'OFFBOARDING'; title: string; status: string; progress: number; tasks: Task[]; completedAt: string | null; user?: { id: string; name: string } }
interface TemplateTask { title: string; description?: string; owner: 'EMPLOYEE' | 'HR'; requiresAck: boolean }
interface Template { id: string; name: string; kind: 'ONBOARDING' | 'OFFBOARDING'; tasks: TemplateTask[] }
interface Person { id: string; name: string }

const Progress = ({ value }: { value: number }) => (
  <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full bg-blue-600 transition-all" style={{ width: `${value}%` }} />
  </div>
);

const ChecklistCard = ({ list, asAdmin, onToggle }: { list: ChecklistRecord; asAdmin: boolean; onToggle: (task: Task, done: boolean) => void }) => (
  <Card>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div>
        <h3 className="font-extrabold text-slate-900">{asAdmin ? list.user?.name : list.title}</h3>
        <p className="text-xs text-slate-400">{asAdmin ? list.title : list.kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}</p>
      </div>
      <Badge tone={statusTone(list.status)}>{list.status} · {list.progress}%</Badge>
    </div>
    <Progress value={list.progress} />
    <ul className="mt-4 divide-y divide-slate-100">
      {list.tasks.map((task) => {
        const editable = asAdmin || task.owner === 'EMPLOYEE';
        return (
          <li key={task.id} className="flex items-start gap-3 py-3">
            <button
              disabled={!editable}
              aria-label={`${task.done ? 'Reopen' : 'Complete'}: ${task.title}`}
              onClick={() => onToggle(task, !task.done)}
              className={`mt-0.5 ${editable ? 'text-blue-600' : 'text-slate-300 cursor-not-allowed'}`}
            >
              {task.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${task.done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</p>
              {task.description && <p className="text-xs text-slate-500">{task.description}</p>}
              <p className="text-xs text-slate-400 mt-0.5">
                {task.owner === 'HR' ? 'Handled by HR' : 'You'}{task.requiresAck ? ' · needs acknowledgement' : ''}{task.done && task.doneAt ? ` · done ${formatDate(task.doneAt)}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  </Card>
);

const Onboarding = ({ user }: { user: User | null }) => {
  const canManage = can(user, 'onboarding', 'read');
  const canWrite = can(user, 'onboarding', 'write');
  const [tab, setTab] = useState<'mine' | 'assigned' | 'templates'>('mine');
  const mine = useAsync(() => apiJson<ChecklistRecord[]>('/user/checklists'));
  const assigned = useAsync(() => (canManage ? apiJson<ChecklistRecord[]>('/admin/checklists') : Promise.resolve([] as ChecklistRecord[])), [canManage]);
  const templates = useAsync(() => (canManage ? apiJson<Template[]>('/admin/checklist-templates') : Promise.resolve([] as Template[])), [canManage]);
  const people = useAsync(() => (canWrite ? apiJson<Person[]>('/user/directory') : Promise.resolve([] as Person[])), [canWrite]);
  const [error, setError] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: '', templateId: '' });
  const [tplOpen, setTplOpen] = useState(false);
  const [tplForm, setTplForm] = useState<{ name: string; kind: 'ONBOARDING' | 'OFFBOARDING'; tasks: TemplateTask[] }>({ name: '', kind: 'ONBOARDING', tasks: [{ title: '', owner: 'EMPLOYEE', requiresAck: false }] });
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => Promise.all([mine.reload(), assigned.reload(), templates.reload()]);
  const guard = async (fn: () => Promise<unknown>, onError: (m: string) => void = setError) => {
    try { onError(''); await fn(); await refresh(); return true; } catch (e) { onError(errorMessage(e)); return false; }
  };

  const toggleMine = (list: ChecklistRecord) => (task: Task, done: boolean) => {
    let acknowledged = false;
    if (done && task.requiresAck) {
      acknowledged = window.confirm(`Acknowledge: ${task.title}\n\nBy continuing you confirm you have read and agree to this.`);
      if (!acknowledged) return;
    }
    void guard(() => apiSend('PUT', `/user/checklists/${list.id}/tasks/${task.id}`, { done, acknowledged }));
  };
  const toggleAdmin = (list: ChecklistRecord) => (task: Task, done: boolean) =>
    void guard(() => apiSend('PUT', `/admin/checklists/${list.id}/tasks/${task.id}`, { done, acknowledged: done }));

  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await guard(() => apiSend('POST', '/admin/checklist-templates', { ...tplForm, tasks: tplForm.tasks.filter((t) => t.title.trim()) }), (m) => setFormError(m || null))) setTplOpen(false);
  };
  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await guard(() => apiSend('POST', '/admin/checklists', assignForm), (m) => setFormError(m || null))) setAssignOpen(false);
  };

  const setTask = (i: number, patch: Partial<TemplateTask>) => setTplForm({ ...tplForm, tasks: tplForm.tasks.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) });

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Onboarding & offboarding"
        subtitle="Checklists for joining, moving on and policy sign-offs."
        actions={canWrite && <>
          <Button variant="secondary" onClick={() => { setFormError(null); setTplOpen(true); }}><Plus size={14} />New template</Button>
          <Button onClick={() => { setFormError(null); setAssignForm({ userId: '', templateId: templates.data?.[0]?.id ?? '' }); setAssignOpen(true); }}><UserPlus size={14} />Assign checklist</Button>
        </>}
      />
      {canManage && <Tabs tabs={[{ id: 'mine', label: 'My checklists' }, { id: 'assigned', label: 'All assigned' }, { id: 'templates', label: 'Templates' }]} value={tab} onChange={setTab} />}
      <ErrorNote error={error || mine.error} />

      {tab === 'mine' && (mine.loading ? <Spinner /> : !mine.data?.length ? <Card><Empty>No checklists assigned to you.</Empty></Card> : (
        <div className="space-y-4">{mine.data.map((l) => <ChecklistCard key={l.id} list={l} asAdmin={false} onToggle={toggleMine(l)} />)}</div>
      ))}

      {tab === 'assigned' && (assigned.loading ? <Spinner /> : !assigned.data?.length ? <Card><Empty>No checklists have been assigned.</Empty></Card> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {assigned.data.map((l) => (
            <div key={l.id} className="relative">
              <ChecklistCard list={l} asAdmin={canWrite} onToggle={toggleAdmin(l)} />
              {can(user, 'onboarding', 'delete') && (
                <button aria-label="Delete checklist" className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-rose-600" onClick={() => window.confirm('Request deletion of this checklist? The platform Super Admin has to approve it.') && void guard(async () => alert(await requestDelete(`/admin/checklists/${l.id}`)))}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      ))}

      {tab === 'templates' && (templates.loading ? <Spinner /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {templates.data?.map((t) => (
            <Card key={t.id} title={t.name} actions={<Badge tone="blue">{t.kind === 'ONBOARDING' ? 'Onboarding' : 'Offboarding'}</Badge>}>
              <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600">
                {t.tasks.map((task, i) => <li key={i}>{task.title}<span className="text-xs text-slate-400"> · {task.owner === 'HR' ? 'HR' : 'employee'}{task.requiresAck ? ' · acknowledge' : ''}</span></li>)}
              </ol>
            </Card>
          ))}
          {!templates.data?.length && <Card><Empty>No templates yet.</Empty></Card>}
        </div>
      ))}

      <Modal open={assignOpen} title="Assign a checklist" onClose={() => setAssignOpen(false)}>
        <form onSubmit={assign} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Employee"><select required className={inputClass} value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}><option value="">Choose…</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Template"><select required className={inputClass} value={assignForm.templateId} onChange={(e) => setAssignForm({ ...assignForm, templateId: e.target.value })}><option value="">Choose…</option>{templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Button type="submit" className="w-full">Assign</Button>
        </form>
      </Modal>

      <Modal open={tplOpen} title="New checklist template" wide onClose={() => setTplOpen(false)}>
        <form onSubmit={saveTemplate} className="space-y-4">
          <ErrorNote error={formError} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Name"><input required className={inputClass} value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} /></Field>
            <Field label="Kind"><select className={inputClass} value={tplForm.kind} onChange={(e) => setTplForm({ ...tplForm, kind: e.target.value as 'ONBOARDING' | 'OFFBOARDING' })}><option value="ONBOARDING">Onboarding</option><option value="OFFBOARDING">Offboarding</option></select></Field>
          </div>
          <div className="space-y-3">
            {tplForm.tasks.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input aria-label={`Task ${i + 1}`} className={`${inputClass} flex-1 min-w-48`} placeholder="Task" value={t.title} onChange={(e) => setTask(i, { title: e.target.value })} />
                <select aria-label="Owner" className={`${inputClass} w-32`} value={t.owner} onChange={(e) => setTask(i, { owner: e.target.value as 'EMPLOYEE' | 'HR' })}><option value="EMPLOYEE">Employee</option><option value="HR">HR</option></select>
                <label className="flex items-center gap-1 text-xs font-semibold text-slate-600"><input type="checkbox" checked={t.requiresAck} onChange={(e) => setTask(i, { requiresAck: e.target.checked })} />Acknowledge</label>
                <button type="button" aria-label="Remove task" className="p-2 text-slate-400 hover:text-rose-600" onClick={() => setTplForm({ ...tplForm, tasks: tplForm.tasks.filter((_, idx) => idx !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <Button variant="ghost" small onClick={() => setTplForm({ ...tplForm, tasks: [...tplForm.tasks, { title: '', owner: 'EMPLOYEE', requiresAck: false }] })}><Plus size={12} />Add task</Button>
          </div>
          <Button type="submit" className="w-full">Save template</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Onboarding;
