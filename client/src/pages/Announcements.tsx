import { useState } from 'react';
import { Megaphone, Pin, Plus, Pencil, Trash2 } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend, requestDelete } from '../lib/api';
import { can } from '../lib/permissions';
import { formatDateTime, errorMessage } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, inputClass } from '../components/ui';

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  author?: { name: string } | null;
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

const Announcements = ({ user }: { user: User | null }) => {
  const canWrite = can(user, 'announcements', 'write');
  const canDelete = can(user, 'announcements', 'delete');
  const { data, loading, error, reload } = useAsync(() => apiJson<AnnouncementRecord[]>(canWrite ? '/admin/announcements' : '/user/announcements'), [canWrite]);
  const [editing, setEditing] = useState<AnnouncementRecord | 'new' | null>(null);
  const [form, setForm] = useState({ title: '', body: '', pinned: false, expiresAt: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openForm = (item: AnnouncementRecord | 'new') => {
    setEditing(item);
    setFormError(null);
    setForm(item === 'new' ? { title: '', body: '', pinned: false, expiresAt: '' } : { title: item.title, body: item.body, pinned: item.pinned, expiresAt: toDateInput(item.expiresAt) });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = { ...form, expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null };
      if (editing === 'new') await apiSend('POST', '/admin/announcements', payload);
      else if (editing) await apiSend('PUT', `/admin/announcements/${editing.id}`, payload);
      setEditing(null);
      await reload();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: AnnouncementRecord) => {
    if (!window.confirm(`Request deletion of "${a.title}"? The platform's Super Admin has to approve it.`)) return;
    try {
      alert(await requestDelete(`/admin/announcements/${a.id}`));
      await reload();
    } catch (err) {
      alert(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Announcements"
        subtitle="News and notices from across the company."
        actions={canWrite && <Button onClick={() => openForm('new')}><Plus size={14} />New announcement</Button>}
      />
      <ErrorNote error={error} />
      {loading ? <Spinner /> : !data?.length ? (
        <Card><Empty><Megaphone className="mx-auto mb-2" />No announcements.</Empty></Card>
      ) : (
        <div className="space-y-4">
          {data.map((a) => {
            const expired = a.expiresAt ? new Date(a.expiresAt) < new Date() : false;
            return (
              <Card key={a.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold text-slate-900">{a.title}</h2>
                      {a.pinned && <Badge tone="blue"><Pin size={10} className="mr-1" />Pinned</Badge>}
                      {expired && <Badge tone="slate">Expired</Badge>}
                    </div>
                    <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-slate-400 mt-3">{a.author?.name ?? 'Admin'} · {formatDateTime(a.createdAt)}</p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <button aria-label="Edit" onClick={() => openForm(a)} className="p-2 text-slate-400 hover:text-blue-600"><Pencil size={16} /></button>
                      {canDelete && <button aria-label="Delete" onClick={() => remove(a)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} title={editing === 'new' ? 'New announcement' : 'Edit announcement'} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Title"><input required className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Message"><textarea required rows={5} className={inputClass} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <Field label="Hide after (optional)"><input type="date" className={inputClass} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to the top
          </label>
          <Button type="submit" disabled={saving} className="w-full">{saving ? 'Saving…' : editing === 'new' ? 'Publish' : 'Save changes'}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Announcements;
