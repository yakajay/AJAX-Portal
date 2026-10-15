import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { apiFetch, downloadFile } from '../../lib/api';
import { errorMessage } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../ui';

interface ImportError { line: number; message: string }
interface Created { name: string; email: string; tempPassword: string }

const MAX_BYTES = 512 * 1024;

// Pick a CSV, check it (dry run), then import. Nothing is created unless every row is valid.
export const ImportUsers = ({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [checked, setChecked] = useState<number | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setCsv(null); setFileName(''); setChecked(null); setErrors([]); setError(null); setCreated(null); };
  const close = () => { reset(); onClose(); };

  const send = async (text: string, dryRun: boolean) => {
    setBusy(true);
    setError(null);
    setErrors([]);
    try {
      const res = await apiFetch(`/admin/users/import${dryRun ? '?dryRun=1' : ''}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChecked(null);
        setError(body.message ?? 'Import failed');
        setErrors(body.errors ?? []);
        return;
      }
      if (dryRun) setChecked(body.count);
      else { setCreated(body.created); onImported(); }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file?: File) => {
    if (!file) return;
    reset();
    if (file.size > MAX_BYTES) { setError('That file is larger than 512 KB.'); return; }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await send(text, true);
  };

  const downloadPasswords = () => {
    const rows = ['name,email,temporary_password', ...(created ?? []).map((c) => [c.name, c.email, c.tempPassword].map((v) => `"${v.replace(/"/g, '""')}"`).join(','))];
    const url = URL.createObjectURL(new Blob([rows.join('\r\n')], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'new-employee-passwords.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} title="Import employees from CSV" onClose={close} wide>
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700"><strong>{created.length}</strong> employees were created. Temporary passwords are shown only now - download them and share each one privately.</p>
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-sm">
            {created.map((c) => <div key={c.email} className="px-4 py-2 flex justify-between gap-3"><span>{c.name} <span className="text-slate-400">{c.email}</span></span><code>{c.tempPassword}</code></div>)}
          </div>
          <div className="flex justify-end gap-3"><Button variant="secondary" onClick={downloadPasswords}><Download size={14} />Download passwords</Button><Button onClick={close}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Required columns: <code>name</code>, <code>email</code>, <code>phone</code>, <code>employee_id</code>. Optional: <code>department</code>, <code>designation</code>, <code>manager_email</code>, <code>join_date</code>, <code>date_of_birth</code> (YYYY-MM-DD).
            Everyone is created as a regular employee. Up to 500 rows.{' '}
            <button type="button" className="text-blue-600 font-bold hover:underline" onClick={() => downloadFile('/admin/users/import/template', 'employee-import-template.csv').catch((e) => setError(errorMessage(e)))}>Download template</button>
          </p>
          <input ref={fileInput} type="file" accept=".csv,text/csv" aria-label="CSV file" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={14} />{fileName || 'Choose CSV file'}</Button>
          <ErrorNote error={error} />
          {errors.length > 0 && (
            <ul className="max-h-48 overflow-y-auto text-sm text-rose-700 space-y-1 border border-rose-200 bg-rose-50 rounded-xl p-3">
              {errors.map((er, i) => <li key={i}>Line {er.line}: {er.message}</li>)}
            </ul>
          )}
          {checked !== null && <p className="text-sm font-bold text-emerald-700">File looks good: {checked} employees ready to import.</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button disabled={busy || checked === null || !csv} onClick={() => csv && send(csv, false)}>{busy ? 'Working…' : `Import ${checked ?? ''} employees`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
