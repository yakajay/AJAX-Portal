import React, { useEffect, useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';

// Small shared building blocks for the newer pages. They reuse the same Tailwind vocabulary as the
// older pages (slate neutrals, blue brand accent) so light/dark theming applies automatically.

export const labelClass = 'block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5';
export const inputClass =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-all disabled:opacity-60';

// Password field with a show/hide toggle that appears once something has been typed.
export const PasswordInput = ({ className = '', style, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) => {
  const [visible, setVisible] = useState(false);
  const hasValue = String(props.value ?? '').length > 0;
  return (
    <div className="relative">
      <input {...props} type={visible && hasValue ? 'text' : 'password'} className={className} style={hasValue ? { ...style, paddingRight: '2.75rem' } : style} />
      {hasValue && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:text-slate-700"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
  );
};

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div>
      <h1 className="text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
      {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </div>
);

export const Card = ({ title, actions, children, className = '', flush = false }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean;
}) => (
  <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
    {(title || actions) && (
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h2 className="font-black text-slate-900 tracking-tight">{title}</h2>
        {actions}
      </div>
    )}
    <div className={flush ? '' : 'p-6'}>{children}</div>
  </section>
);

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20',
  secondary: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100'
};

export const Button = ({ variant = 'primary', small = false, className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) => (
  <button
    type="button"
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
      small ? 'px-3 py-1.5 text-[10px]' : 'px-5 py-2.5 text-xs'
    } ${variants[variant]} ${className}`}
  />
);

type Tone = 'green' | 'amber' | 'rose' | 'slate' | 'blue';
const tones: Record<Tone, string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-100 text-blue-800'
};

export const Badge = ({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tones[tone]}`}>
    {children}
  </span>
);

export const statusTone = (status: string): Tone => {
  if (['Approved', 'Completed', 'Paid', 'Done', 'Met', 'Success', 'Reimbursed', 'On Track', 'Active', 'Closed'].includes(status)) return 'green';
  if (['Pending', 'Pending Self', 'Pending Manager', 'Submitted', 'Generated', 'Sent', 'In Progress', 'At Risk', 'Draft', 'Open', 'Processing', 'Regularization Pending'].includes(status)) return 'amber';
  if (['Rejected', 'Overdue', 'Breached', 'Failed', 'Cancelled', 'Ended'].includes(status)) return 'rose';
  return 'slate';
};

export const Modal = ({ open, title, onClose, children, wide = false }: {
  open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-3xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100`}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 z-10">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block">
    <span className={labelClass}>{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
  </label>
);

export const Tabs = <T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; badge?: number }[]; value: T; onChange: (id: T) => void;
}) => (
  <div className="flex flex-wrap border-b border-slate-200" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        role="tab"
        aria-selected={value === tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-5 py-3 text-xs font-black tracking-widest uppercase transition-all border-b-2 ${
          value === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
        }`}
      >
        {tab.label}
        {tab.badge ? <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px]">{tab.badge}</span> : null}
      </button>
    ))}
  </div>
);

export const Spinner = () => (
  <div className="p-10 flex justify-center text-blue-600" role="status" aria-label="Loading">
    <Loader2 className="animate-spin" size={28} />
  </div>
);

export const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="p-10 text-center text-slate-400 font-bold text-sm">{children}</div>
);

export const ErrorNote = ({ error }: { error: string | null }) =>
  error ? <div role="alert" className="px-4 py-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold">{error}</div> : null;

export const Th = ({ children, right = false }: { children?: React.ReactNode; right?: boolean }) => (
  <th className={`px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest ${right ? 'text-right' : ''}`}>{children}</th>
);

export const StatTile = ({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ElementType }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between">
      <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{label}</h3>
      {Icon && <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Icon size={16} /></div>}
    </div>
    <p className="text-2xl font-black text-slate-900 mt-2 tracking-tight">{value}</p>
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);
