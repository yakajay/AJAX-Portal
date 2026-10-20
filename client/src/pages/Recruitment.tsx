import React, { useRef, useState } from 'react';
import { Download, Plus, Upload, UserCheck } from 'lucide-react';
import type { User } from '../types';
import { apiFetch, apiJson, apiSend, downloadFile, readError } from '../lib/api';
import { can } from '../lib/permissions';
import { errorMessage, formatDateTime } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, inputClass } from '../components/ui';

const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'] as const;
type Stage = (typeof STAGES)[number];
const MOVABLE = STAGES.filter((s) => s !== 'Hired');
const RESUME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

interface Job { id: string; title: string; department: string; location: string; description: string; openings: number; status: 'Open' | 'Closed'; stageCounts: Partial<Record<Stage, number>> }
interface Note { id: string; authorName: string; text: string; createdAt: string }
interface Candidate {
  id: string; jobId: string; name: string; email: string; phone: string; source: string; stage: Stage; rejectionReason: string;
  notes: Note[]; hasResume: boolean; resumeName: string; hiredUserId: string | null; createdAt: string;
}

const stageTone = (s: Stage) => (s === 'Hired' ? 'green' : s === 'Rejected' ? 'rose' : s === 'Offer' ? 'amber' : s === 'Applied' ? 'slate' : 'blue');

const JobModal = ({ job, onClose, onSaved }: { job: Partial<Job> | null; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({ title: '', department: '', location: '', description: '', openings: '1', ...job, ...(job ? { openings: String(job.openings ?? 1) } : {}) });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Record<string, string>) => setForm({ ...form, ...patch });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { title: form.title, department: form.department, location: form.location, description: form.description, openings: Number(form.openings) };
      await (job?.id ? apiSend('PUT', `/admin/recruitment/jobs/${job.id}`, body) : apiSend('POST', '/admin/recruitment/jobs', body));
      onSaved();
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal open={!!job} title={job?.id ? 'Edit position' : 'New position'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Job title"><input required maxLength={100} className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Department"><input className={inputClass} value={form.department} onChange={(e) => set({ department: e.target.value })} /></Field>
          <Field label="Location"><input className={inputClass} value={form.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        </div>
        <Field label="Openings"><input type="number" min={1} max={500} className={inputClass} value={form.openings} onChange={(e) => set({ openings: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={4} className={inputClass} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <ErrorNote error={error} />
        <Button type="submit" className="w-full">Save</Button>
      </form>
    </Modal>
  );
};

const CandidateModal = ({ jobId, onClose, onSaved }: { jobId: string; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({ name: '', email: '', phone: '', source: '' });
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await apiSend('POST', '/admin/recruitment/candidates', { jobId, ...form }); onSaved(); onClose(); } catch (err) { setError(errorMessage(err)); }
  };
  return (
    <Modal open title="Add candidate" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Full name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><input type="tel" className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Source"><input className={inputClass} placeholder="Referral, job board…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
        </div>
        <ErrorNote error={error} />
        <Button type="submit" className="w-full">Add candidate</Button>
      </form>
    </Modal>
  );
};

interface HireResult { tempPassword: string; user: { name: string; email: string; employeeId: string } }

const CandidateDetail = ({ candidate, canWrite, canHire, onClose, onChanged }: {
  candidate: Candidate; canWrite: boolean; canHire: boolean; onClose: () => void; onChanged: () => void;
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(candidate);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [hiring, setHiring] = useState(false);
  const [hire, setHire] = useState({ employeeId: '', joinDate: '' });
  const [hired, setHired] = useState<HireResult | null>(null);
  const base = `/admin/recruitment/candidates/${current.id}`;

  const run = async (fn: () => Promise<Candidate | void>) => {
    try { setError(null); const next = await fn(); if (next) setCurrent(next); onChanged(); } catch (err) { setError(errorMessage(err)); }
  };
  const move = (stage: Stage) => {
    const reason = stage === 'Rejected' ? window.prompt('Reason for rejecting (optional, internal):') ?? '' : '';
    return run(() => apiSend<Candidate>('PUT', `${base}/stage`, { stage, reason }));
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const type = RESUME_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!type) return setError('The resume must be a PDF or DOCX file.');
    if (file.size > MAX_RESUME_BYTES) return setError('The resume must be 5 MB or smaller.');
    await run(async () => {
      const res = await apiFetch(`${base}/resume`, { method: 'PUT', headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      if (!res.ok) throw new Error(await readError(res, 'Upload failed'));
      return res.json();
    });
  };
  const doHire = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const r = await apiSend<HireResult & { candidate: Candidate }>('POST', `${base}/hire`, { employeeId: hire.employeeId, ...(hire.joinDate ? { joinDate: hire.joinDate } : {}) });
      setCurrent(r.candidate);
      setHired(r);
      setHiring(false);
      onChanged();
    } catch (err) { setError(errorMessage(err)); }
  };

  const final = current.stage === 'Hired';
  return (
    <Modal open title={current.name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <Badge tone={stageTone(current.stage)}>{current.stage}</Badge>
          <span>{current.email}</span>{current.phone && <span>· {current.phone}</span>}{current.source && <span>· via {current.source}</span>}
        </div>
        {current.rejectionReason && <p className="text-sm text-rose-700">Rejected: {current.rejectionReason}</p>}
        <ErrorNote error={error} />
        {hired && (
          <div role="status" className="px-4 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm">
            {hired.user.name} is now an employee ({hired.user.employeeId}). Temporary password, shown only now: <code className="font-extrabold">{hired.tempPassword}</code>. Share it privately.
          </div>
        )}

        {canWrite && !final && (
          <Field label="Stage">
            <select className={inputClass} value={current.stage} onChange={(e) => move(e.target.value as Stage)}>
              {MOVABLE.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {current.hasResume && <Button variant="secondary" small onClick={() => downloadFile(`${base}/resume`, current.resumeName).catch((e) => setError(errorMessage(e)))}><Download size={13} />{current.resumeName}</Button>}
          {canWrite && (
            <>
              <input ref={fileInput} type="file" accept=".pdf,.docx" aria-label="Resume file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
              <Button variant="secondary" small onClick={() => fileInput.current?.click()}><Upload size={13} />{current.hasResume ? 'Replace resume' : 'Upload resume'}</Button>
            </>
          )}
          {canHire && !final && current.stage !== 'Rejected' && !hiring && <Button small onClick={() => setHiring(true)}><UserCheck size={13} />Hire</Button>}
        </div>

        {hiring && (
          <form onSubmit={doHire} className="grid sm:grid-cols-3 gap-3 items-end p-4 rounded-xl border border-slate-200 bg-slate-50">
            <Field label="Employee ID"><input required className={inputClass} value={hire.employeeId} onChange={(e) => setHire({ ...hire, employeeId: e.target.value })} placeholder="EMP-042" /></Field>
            <Field label="Join date"><input type="date" className={inputClass} value={hire.joinDate} onChange={(e) => setHire({ ...hire, joinDate: e.target.value })} /></Field>
            <div className="flex gap-2"><Button type="submit">Create employee</Button><Button variant="ghost" onClick={() => setHiring(false)}>Cancel</Button></div>
            <p className="sm:col-span-3 text-xs text-slate-400">Creates a regular employee account from the candidate's details and the job's department and title. {current.phone ? '' : 'Add a phone number to the candidate first.'}</p>
          </form>
        )}

        <div>
          <h3 className="text-xs font-extrabold text-slate-400 mb-2">Notes</h3>
          {!current.notes.length ? <p className="text-sm text-slate-400 italic">No notes yet.</p> : (
            <ul className="space-y-2">
              {current.notes.map((n) => (
                <li key={n.id} className="text-sm bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-slate-800 whitespace-pre-wrap">{n.text}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.authorName} · {formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(async () => { const next = await apiSend<Candidate>('POST', `${base}/notes`, { text: note }); setNote(''); return next; }); }}>
              <input aria-label="New note" className={inputClass} placeholder="Add interview feedback…" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" disabled={!note.trim()}>Add</Button>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Recruitment = ({ user }: { user: User }) => {
  const canWrite = can(user, 'recruitment', 'write');
  const canHire = canWrite && can(user, 'users', 'write');
  const jobs = useAsync(() => apiJson<Job[]>('/admin/recruitment/jobs'));
  const [jobId, setJobId] = useState<string | null>(null);
  const job = jobs.data?.find((j) => j.id === jobId) ?? jobs.data?.find((j) => j.status === 'Open') ?? jobs.data?.[0] ?? null;
  const candidates = useAsync(() => (job ? apiJson<Candidate[]>(`/admin/recruitment/candidates?jobId=${job.id}`) : Promise.resolve([] as Candidate[])), [job?.id]);
  const [jobForm, setJobForm] = useState<Partial<Job> | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = candidates.data?.find((c) => c.id === openId) ?? null;
  const refresh = () => Promise.all([jobs.reload(), candidates.reload()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment"
        subtitle="Track openings and candidates from first contact to hire."
        actions={canWrite && <Button onClick={() => setJobForm({})}><Plus size={14} />New position</Button>}
      />
      <ErrorNote error={jobs.error ?? candidates.error} />
      {jobs.loading && !jobs.data ? <Spinner /> : !jobs.data?.length ? (
        <Card><Empty>No positions yet. Create one to start adding candidates.</Empty></Card>
      ) : (
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="space-y-2" role="list" aria-label="Positions">
            {jobs.data.map((j) => {
              const total = Object.values(j.stageCounts).reduce((a, b) => a + (b ?? 0), 0);
              return (
                <button key={j.id} role="listitem" aria-current={job?.id === j.id} onClick={() => setJobId(j.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${job?.id === j.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                  <span className="block font-extrabold text-slate-900">{j.title}</span>
                  <span className="block text-xs text-slate-500">{[j.department, j.location].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="flex items-center gap-2 mt-2 text-xs text-slate-500"><Badge tone={j.status === 'Open' ? 'green' : 'slate'}>{j.status}</Badge>{total} candidate{total === 1 ? '' : 's'} · {j.stageCounts.Hired ?? 0}/{j.openings} hired</span>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-3 space-y-4">
            {job && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-xl font-extrabold text-slate-900">{job.title}</h2>{job.description && <p className="text-sm text-slate-500 max-w-2xl whitespace-pre-wrap">{job.description}</p>}</div>
                {canWrite && (
                  <div className="flex gap-2">
                    <Button variant="secondary" small onClick={() => setJobForm(job)}>Edit</Button>
                    <Button variant="secondary" small onClick={() => apiSend('PUT', `/admin/recruitment/jobs/${job.id}`, { status: job.status === 'Open' ? 'Closed' : 'Open' }).then(refresh, () => undefined)}>{job.status === 'Open' ? 'Close position' : 'Reopen'}</Button>
                    <Button small disabled={job.status !== 'Open'} onClick={() => setAdding(true)}><Plus size={13} />Add candidate</Button>
                  </div>
                )}
              </div>
            )}
            {candidates.loading && !candidates.data ? <Spinner /> : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {STAGES.map((stage) => {
                  const list = (candidates.data ?? []).filter((c) => c.stage === stage);
                  return (
                    <section key={stage} aria-label={`${stage} candidates`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                      <h3 className="flex justify-between text-xs font-extrabold text-slate-400 px-1"><span>{stage}</span><span>{list.length}</span></h3>
                      {list.map((c) => (
                        <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left bg-white rounded-xl border border-slate-200 px-3 py-2 hover:border-blue-400">
                          <span className="block text-sm font-bold text-slate-900">{c.name}</span>
                          <span className="block text-xs text-slate-400 truncate">{c.email}</span>
                        </button>
                      ))}
                      {!list.length && <p className="text-xs text-slate-300 italic px-1">None</p>}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {jobForm && <JobModal job={jobForm} onClose={() => setJobForm(null)} onSaved={refresh} />}
      {adding && job && <CandidateModal jobId={job.id} onClose={() => setAdding(false)} onSaved={refresh} />}
      {open && <CandidateDetail key={open.id} candidate={open} canWrite={canWrite} canHire={canHire} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
};

export default Recruitment;
