import React, { useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, inputClass } from '../components/ui';

interface Entity {
  id: string; name: string; legalName: string; country: string; registrationNumber: string; taxId: string; address: string; currency: string; contactEmail: string; notes: string;
  isDefault: boolean; active: boolean; employeeCount: number; payrollBank?: { bankName: string; accountLast4: string; routing: string; accountSet: boolean };
}
interface Person { id: string; name: string; email: string; department?: string; entityId?: string | null }

const empty = { name: '', legalName: '', country: '', registrationNumber: '', taxId: '', address: '', currency: 'INR', contactEmail: '', notes: '', bankName: '', account: '', routing: '' };

const Employers = ({ user }: { user: User }) => {
  const canWrite = can(user, 'hr', 'write');
  const { data, loading, error, reload } = useAsync(() => apiJson<Entity[]>('/admin/entities'));
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [form, setForm] = useState(empty);
  const [formError, setFormError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Entity | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const open = (e: Entity | 'new') => {
    setForm(e === 'new' ? empty : { ...empty, name: e.name, legalName: e.legalName, country: e.country, registrationNumber: e.registrationNumber, taxId: e.taxId, address: e.address, currency: e.currency, contactEmail: e.contactEmail, notes: e.notes, bankName: e.payrollBank?.bankName ?? '', routing: e.payrollBank?.routing ?? '' });
    setFormError(null);
    setEditing(e);
  };

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const { bankName, account, routing, ...rest } = form;
    // A blank account number keeps the stored one: it is never sent back to the browser
    const payrollBank = { bankName, routing, ...(account ? { account } : {}) };
    try {
      if (editing === 'new') await apiSend('POST', '/admin/entities', { ...rest, payrollBank: { bankName, routing, account } });
      else if (editing) await apiSend('PUT', `/admin/entities/${editing.id}`, { ...rest, payrollBank });
      setEditing(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };

  const toggle = async (e: Entity, patch: Partial<Entity>) => {
    try { await apiSend('PUT', `/admin/entities/${e.id}`, patch); await reload(); } catch (err) { setFormError(errorMessage(err)); }
  };

  const openAssign = async (e: Entity) => {
    setFormError(null);
    try {
      const list = await apiJson<Person[]>('/admin/users');
      setPeople(list);
      setPicked(new Set(list.filter((p) => p.entityId === e.id).map((p) => p.id)));
      setAssigning(e);
    } catch (err) { setFormError(errorMessage(err)); }
  };

  const saveAssign = async () => {
    if (!assigning) return;
    try {
      const was = new Set(people.filter((p) => p.entityId === assigning.id).map((p) => p.id));
      const add = [...picked].filter((id) => !was.has(id));
      const remove = [...was].filter((id) => !picked.has(id));
      if (add.length) await apiSend('PUT', '/admin/entities/assign', { entityId: assigning.id, userIds: add });
      if (remove.length) await apiSend('PUT', '/admin/entities/assign', { entityId: null, userIds: remove });
      setAssigning(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };

  const text = (key: keyof typeof empty, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label}><input className={inputClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} /></Field>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Employer records" subtitle="The legal entities your employees are employed by: subsidiaries, branches or registered companies." actions={canWrite && <Button onClick={() => open('new')}><Plus size={14} />Add employer</Button>} />
      <ErrorNote error={error ?? (editing || assigning ? null : formError)} />
      {loading && !data ? <Spinner /> : !data?.length ? <Card><Empty>No employer records yet. Add the legal entity that employs your staff, then assign employees to it.</Empty></Card> : (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.map((e) => (
            <Card key={e.id} title={<span className="inline-flex items-center gap-2">{e.name}{e.isDefault && <Badge tone="blue">Default</Badge>}{!e.active && <Badge>Inactive</Badge>}</span>}
              actions={canWrite && <Button small variant="secondary" aria-label={`Edit ${e.name}`} onClick={() => open(e)}><Pencil size={12} />Edit</Button>}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-slate-400">Legal name</dt><dd className="text-slate-800">{e.legalName || '—'}</dd>
                <dt className="text-slate-400">Country</dt><dd className="text-slate-800">{e.country || '—'}</dd>
                <dt className="text-slate-400">Registration no.</dt><dd className="text-slate-800">{e.registrationNumber || '—'}</dd>
                <dt className="text-slate-400">Tax ID</dt><dd className="text-slate-800">{e.taxId || '—'}</dd>
                <dt className="text-slate-400">Payroll currency</dt><dd className="text-slate-800">{e.currency}</dd>
                <dt className="text-slate-400">Payroll bank</dt><dd className="text-slate-800">{e.payrollBank?.accountSet ? `${e.payrollBank.bankName || 'Account'} ••••${e.payrollBank.accountLast4}` : '—'}</dd>
                <dt className="text-slate-400">Employees</dt><dd className="text-slate-800 font-bold">{e.employeeCount}</dd>
              </dl>
              {canWrite && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button small variant="secondary" disabled={!e.active} onClick={() => openAssign(e)}><Users size={12} />Assign employees</Button>
                  {!e.isDefault && e.active && <Button small variant="ghost" onClick={() => toggle(e, { isDefault: true })}>Make default</Button>}
                  {!e.isDefault && <Button small variant="ghost" onClick={() => toggle(e, { active: !e.active })}>{e.active ? 'Deactivate' : 'Reactivate'}</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!editing} title={editing === 'new' ? 'Add employer' : 'Edit employer'} onClose={() => setEditing(null)} wide>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <div className="grid sm:grid-cols-2 gap-4">
            {text('name', 'Short name', { required: true, maxLength: 120 })}
            {text('legalName', 'Registered legal name', { maxLength: 200 })}
            {text('country', 'Country (2-letter code)', { maxLength: 2, placeholder: 'IN' })}
            {text('currency', 'Payroll currency', { maxLength: 3, required: true })}
            {text('registrationNumber', 'Registration number', { maxLength: 60 })}
            {text('taxId', 'Tax ID', { maxLength: 60 })}
            {text('contactEmail', 'Contact email', { type: 'email', maxLength: 200 })}
            {text('address', 'Registered address', { maxLength: 400 })}
          </div>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest pt-2">Payroll bank account (encrypted)</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {text('bankName', 'Bank', { maxLength: 64 })}
            {text('account', 'Account number', { maxLength: 64, placeholder: editing !== 'new' && editing?.payrollBank?.accountSet ? `Keep current (••••${editing.payrollBank.accountLast4})` : '' })}
            {text('routing', 'IFSC / routing code', { maxLength: 64 })}
          </div>
          <Button type="submit" className="w-full">Save</Button>
        </form>
      </Modal>
      <Modal open={!!assigning} title={`Employees of ${assigning?.name ?? ''}`} onClose={() => setAssigning(null)}>
        <div className="space-y-3">
          <ErrorNote error={formError} />
          <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {people.map((p) => (
              <li key={p.id}><label className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={picked.has(p.id)} onChange={(ev) => { const next = new Set(picked); if (ev.target.checked) next.add(p.id); else next.delete(p.id); setPicked(next); }} />
                <span className="font-bold text-slate-800">{p.name}</span><span className="text-slate-400">{p.department}</span>
                {p.entityId && p.entityId !== assigning?.id && <span className="ml-auto text-xs text-amber-700">will move here</span>}
              </label></li>
            ))}
          </ul>
          <Button className="w-full" onClick={saveAssign}>Save</Button>
        </div>
      </Modal>
    </div>
  );
};

export default Employers;
