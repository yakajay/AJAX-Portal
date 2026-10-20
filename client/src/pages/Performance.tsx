import { useState } from 'react';
import { Plus, Star, Target, Trash2 } from 'lucide-react';
import type { User } from '../types';
import { apiJson, apiSend } from '../lib/api';
import { can } from '../lib/permissions';
import { errorMessage, formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, inputClass, statusTone } from '../components/ui';

interface Cycle { id: string; name: string; startDate: string; endDate: string; status: 'Open' | 'Closed'; total: number; completed: number }
interface Review {
  id: string; status: 'Pending Self' | 'Pending Manager' | 'Completed';
  selfRating: number | null; selfComment: string; managerRating: number | null; managerComment: string;
  user?: { name: string; department?: string }; reviewer?: { name: string } | null; cycle?: { name: string; status: string };
}
interface KeyResult { id?: string; title: string; target: number; current: number; unit?: string }
interface Goal { id: string; title: string; description: string; dueDate: string | null; status: 'On Track' | 'At Risk' | 'Done'; progress: number; keyResults: KeyResult[]; user?: { name: string } }

const Stars = ({ value, onChange, label }: { value: number | null; onChange?: (n: number) => void; label: string }) => (
  <div className="flex gap-1" role={onChange ? 'radiogroup' : 'img'} aria-label={`${label}: ${value ?? 'not rated'} of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" disabled={!onChange} role={onChange ? 'radio' : undefined} aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
        onClick={() => onChange?.(n)} className={onChange ? 'cursor-pointer' : 'cursor-default'}>
        <Star size={22} className={(value ?? 0) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
      </button>
    ))}
  </div>
);

const ReviewForm = ({ review, mode, onSaved }: { review: Review; mode: 'self' | 'manager'; onSaved: () => void }) => {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!rating) return setError('Choose a rating first.');
    try {
      setError(null);
      await apiSend('PUT', mode === 'self' ? `/user/performance/reviews/${review.id}/self` : `/user/team/reviews/${review.id}`, { rating, comment });
      onSaved();
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <div className="space-y-3 mt-4">
      <ErrorNote error={error} />
      <Stars value={rating} onChange={setRating} label={mode === 'self' ? 'Your self rating' : 'Your rating'} />
      <textarea aria-label="Comments" rows={3} className={inputClass} placeholder={mode === 'self' ? 'What went well? What would you do differently?' : 'Feedback for this person'} value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button onClick={submit}>{mode === 'self' ? 'Submit self-assessment' : 'Complete review'}</Button>
    </div>
  );
};

const ReviewCard = ({ review, mode, onSaved }: { review: Review; mode: 'mine' | 'team' | 'admin'; onSaved: () => void }) => (
  <Card title={mode === 'mine' ? review.cycle?.name : `${review.user?.name} · ${review.cycle?.name}`} actions={<Badge tone={statusTone(review.status)}>{review.status}</Badge>}>
    <div className="grid sm:grid-cols-2 gap-6">
      <div>
        <p className="text-xs font-extrabold text-slate-400 mb-1">Self-assessment</p>
        {review.selfRating ? <><Stars value={review.selfRating} label="Self rating" /><p className="text-sm text-slate-600 mt-2">{review.selfComment || 'No comment.'}</p></> : <p className="text-sm text-slate-400">Not submitted yet.</p>}
      </div>
      <div>
        <p className="text-xs font-extrabold text-slate-400 mb-1">Manager review{review.reviewer ? ` · ${review.reviewer.name}` : ''}</p>
        {review.managerRating ? <><Stars value={review.managerRating} label="Manager rating" /><p className="text-sm text-slate-600 mt-2">{review.managerComment || 'No comment.'}</p></> : <p className="text-sm text-slate-400">Pending.</p>}
      </div>
    </div>
    {mode === 'mine' && review.status === 'Pending Self' && review.cycle?.status === 'Open' && <ReviewForm review={review} mode="self" onSaved={onSaved} />}
    {mode === 'team' && review.status === 'Pending Manager' && <ReviewForm review={review} mode="manager" onSaved={onSaved} />}
  </Card>
);

const GoalCard = ({ goal, editable, onChanged }: { goal: Goal; editable: boolean; onChanged: () => void }) => {
  const [error, setError] = useState<string | null>(null);
  const update = async (patch: Partial<Goal>) => {
    try { setError(null); await apiSend('PUT', `/user/goals/${goal.id}`, patch); onChanged(); } catch (e) { setError(errorMessage(e)); }
  };
  const setCurrent = (i: number, current: number) =>
    update({ keyResults: goal.keyResults.map((kr, idx) => ({ ...kr, current: idx === i ? current : kr.current })) });
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-slate-900">{goal.title}</h3>
          {goal.user && <p className="text-xs text-slate-400">{goal.user.name}</p>}
          {goal.description && <p className="text-sm text-slate-500 mt-1">{goal.description}</p>}
          {goal.dueDate && <p className="text-xs text-slate-400 mt-1">Due {formatDate(goal.dueDate)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {editable && goal.status !== 'Done' ? (
            <select aria-label="Goal status" className={`${inputClass} !py-1.5 w-32`} value={goal.status} onChange={(e) => update({ status: e.target.value as Goal['status'] })}>
              <option>On Track</option><option>At Risk</option><option>Done</option>
            </select>
          ) : <Badge tone={statusTone(goal.status)}>{goal.status}</Badge>}
          {editable && <button aria-label={`Delete ${goal.title}`} className="p-2 text-slate-400 hover:text-rose-600" onClick={() => window.confirm('Delete this goal?') && apiSend('DELETE', `/user/goals/${goal.id}`).then(onChanged).catch((e) => setError(errorMessage(e)))}><Trash2 size={16} /></button>}
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-label={`${goal.title} progress`} aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${goal.progress}%` }} />
      </div>
      <p className="text-xs font-bold text-slate-500 mt-1">{goal.progress}% complete</p>
      <ErrorNote error={error} />
      {goal.keyResults.length > 0 && (
        <ul className="mt-3 space-y-2">
          {goal.keyResults.map((kr, i) => (
            <li key={kr.id ?? i} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="flex-1 min-w-40 text-slate-700 font-semibold">{kr.title}</span>
              {editable ? (
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="number" min={0} aria-label={`${kr.title} current value`} className={`${inputClass} !py-1 w-24`} defaultValue={kr.current}
                    onBlur={(e) => Number(e.target.value) !== kr.current && setCurrent(i, Number(e.target.value))} />
                  / {kr.target} {kr.unit}
                </label>
              ) : <span className="text-xs text-slate-500">{kr.current} / {kr.target} {kr.unit}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

type TabId = 'reviews' | 'goals' | 'team' | 'cycles';

const Performance = ({ user }: { user: User | null }) => {
  const canAdmin = can(user, 'performance', 'read');
  const canWrite = can(user, 'performance', 'write');
  const [tab, setTab] = useState<TabId>('reviews');
  const reviews = useAsync(() => apiJson<Review[]>('/user/performance/reviews'));
  const goals = useAsync(() => apiJson<Goal[]>('/user/goals'));
  const teamReviews = useAsync(() => apiJson<Review[]>('/user/team/reviews'));
  const teamGoals = useAsync(() => apiJson<Goal[]>('/user/team/goals'));
  const cycles = useAsync(() => (canAdmin ? apiJson<Cycle[]>('/admin/performance/cycles') : Promise.resolve([] as Cycle[])), [canAdmin]);

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', dueDate: '', keyResults: [{ title: '', target: '', unit: '' }] });
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({ name: '', startDate: '', endDate: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const hasTeam = (teamReviews.data?.length ?? 0) > 0 || (teamGoals.data?.length ?? 0) > 0;
  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'reviews', label: 'My reviews' }, { id: 'goals', label: 'Goals' },
    ...(hasTeam ? [{ id: 'team' as const, label: 'My team', badge: teamReviews.data?.filter((r) => r.status === 'Pending Manager').length }] : []),
    ...(canAdmin ? [{ id: 'cycles' as const, label: 'Cycles' }] : [])
  ];
  const reloadAll = () => { void reviews.reload(); void teamReviews.reload(); void cycles.reload(); };

  const saveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormError(null);
      await apiSend('POST', '/user/goals', {
        title: goalForm.title, description: goalForm.description, dueDate: goalForm.dueDate || null,
        keyResults: goalForm.keyResults.filter((k) => k.title.trim()).map((k) => ({ title: k.title, target: Number(k.target), current: 0, unit: k.unit }))
      });
      setGoalOpen(false);
      setGoalForm({ title: '', description: '', dueDate: '', keyResults: [{ title: '', target: '', unit: '' }] });
      await goals.reload();
    } catch (err) { setFormError(errorMessage(err)); }
  };
  const saveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setFormError(null); await apiSend('POST', '/admin/performance/cycles', cycleForm); setCycleOpen(false); setCycleForm({ name: '', startDate: '', endDate: '' }); reloadAll(); } catch (err) { setFormError(errorMessage(err)); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title="Performance" subtitle="Review cycles, self-assessments and goals." actions={
        tab === 'goals' ? <Button onClick={() => { setFormError(null); setGoalOpen(true); }}><Plus size={14} />New goal</Button>
        : tab === 'cycles' && canWrite ? <Button onClick={() => { setFormError(null); setCycleOpen(true); }}><Plus size={14} />Start review cycle</Button> : undefined} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <ErrorNote error={reviews.error ?? goals.error} />

      {tab === 'reviews' && (reviews.loading ? <Spinner /> : !reviews.data?.length ? <Card><Empty>No review cycles yet.</Empty></Card> : (
        <div className="space-y-4">{reviews.data.map((r) => <ReviewCard key={r.id} review={r} mode="mine" onSaved={reloadAll} />)}</div>
      ))}

      {tab === 'goals' && (goals.loading ? <Spinner /> : !goals.data?.length ? <Card><Empty><Target className="mx-auto mb-2" />Set a goal with measurable key results to track progress.</Empty></Card> : (
        <div className="space-y-4">{goals.data.map((g) => <GoalCard key={g.id} goal={g} editable onChanged={() => void goals.reload()} />)}</div>
      ))}

      {tab === 'team' && (
        <div className="space-y-6">
          {teamReviews.data?.map((r) => <ReviewCard key={r.id} review={r} mode="team" onSaved={reloadAll} />)}
          {teamGoals.data && teamGoals.data.length > 0 && <h2 className="text-sm font-extrabold text-slate-400">Team goals</h2>}
          {teamGoals.data?.map((g) => <GoalCard key={g.id} goal={g} editable={false} onChanged={() => undefined} />)}
        </div>
      )}

      {tab === 'cycles' && (cycles.loading ? <Spinner /> : !cycles.data?.length ? <Card><Empty>No cycles yet.</Empty></Card> : (
        <div className="grid md:grid-cols-2 gap-4">
          {cycles.data.map((c) => (
            <Card key={c.id} title={c.name} actions={<Badge tone={c.status === 'Open' ? 'green' : 'slate'}>{c.status}</Badge>}>
              <p className="text-sm text-slate-500">{formatDate(c.startDate)} – {formatDate(c.endDate)}</p>
              <p className="text-sm font-bold text-slate-900 mt-2">{c.completed} of {c.total} reviews completed</p>
              {c.status === 'Open' && canWrite && <Button small variant="secondary" className="mt-3" onClick={() => apiSend('PUT', `/admin/performance/cycles/${c.id}/close`).then(() => cycles.reload()).catch((e) => alert(errorMessage(e)))}>Close cycle</Button>}
            </Card>
          ))}
        </div>
      ))}

      <Modal open={goalOpen} title="New goal" wide onClose={() => setGoalOpen(false)}>
        <form onSubmit={saveGoal} className="space-y-4">
          <ErrorNote error={formError} />
          <Field label="Goal"><input required className={inputClass} value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} placeholder="e.g. Grow weekly active users" /></Field>
          <Field label="Description"><textarea rows={2} className={inputClass} value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} /></Field>
          <Field label="Due date"><input type="date" className={inputClass} value={goalForm.dueDate} onChange={(e) => setGoalForm({ ...goalForm, dueDate: e.target.value })} /></Field>
          <div>
            <p className="text-xs font-extrabold text-slate-400 mb-1.5">Key results</p>
            {goalForm.keyResults.map((k, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input aria-label={`Key result ${i + 1}`} className={`${inputClass} flex-1`} placeholder="Measurable outcome" value={k.title} onChange={(e) => setGoalForm({ ...goalForm, keyResults: goalForm.keyResults.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <input aria-label="Target" type="number" min={0} className={`${inputClass} w-24`} placeholder="Target" value={k.target} onChange={(e) => setGoalForm({ ...goalForm, keyResults: goalForm.keyResults.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })} />
                <input aria-label="Unit" className={`${inputClass} w-24`} placeholder="Unit" value={k.unit} onChange={(e) => setGoalForm({ ...goalForm, keyResults: goalForm.keyResults.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
              </div>
            ))}
            <Button variant="ghost" small onClick={() => setGoalForm({ ...goalForm, keyResults: [...goalForm.keyResults, { title: '', target: '', unit: '' }] })}><Plus size={12} />Add key result</Button>
          </div>
          <Button type="submit" className="w-full">Create goal</Button>
        </form>
      </Modal>

      <Modal open={cycleOpen} title="Start a review cycle" onClose={() => setCycleOpen(false)}>
        <form onSubmit={saveCycle} className="space-y-4">
          <ErrorNote error={formError} />
          <p className="text-sm text-slate-500">Everyone gets a review; their manager becomes the reviewer.</p>
          <Field label="Name"><input required className={inputClass} value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="H1 2027 Review" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts"><input required type="date" className={inputClass} value={cycleForm.startDate} onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })} /></Field>
            <Field label="Ends"><input required type="date" className={inputClass} value={cycleForm.endDate} onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} /></Field>
          </div>
          <Button type="submit" className="w-full">Start cycle</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Performance;
