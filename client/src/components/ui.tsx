import React, { useEffect, useState } from 'react';
import { X, Loader2, Eye, EyeOff } from 'lucide-react';

// Shared building blocks. They use the same Tailwind vocabulary as the older pages (slate neutrals, the
// "blue" scale remapped to the brand green) so light/dark theming applies automatically.
// Look: sentence-case labels, 10px controls with 44px touch targets, 16px cards.

export const labelClass = 'block text-[13px] font-bold text-slate-600 mb-1.5';
export const inputClass =
  'w-full min-h-11 px-3 py-2 bg-white border-[1.5px] border-slate-300 rounded-[10px] text-[15px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-colors disabled:opacity-60 disabled:bg-slate-50';

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

/** `subtitle` is the small line above the title, as on every screen of the design. */
export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div className="flex flex-col gap-1">
      {subtitle && <p className="text-sm font-semibold text-slate-500 order-first">{subtitle}</p>}
      <h1 className="text-[32px] leading-tight font-extrabold text-slate-900 tracking-tight">{title}</h1>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </div>
);

export const Card = ({ title, actions, children, className = '', flush = false }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean;
}) => (
  <section className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${className}`}>
    {(title || actions) && (
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">{title}</h2>
        {actions}
      </div>
    )}
    <div className={flush ? '' : 'p-6'}>{children}</div>
  </section>
);

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-white border-[1.5px] border-blue-600 text-blue-800 hover:bg-blue-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  ghost: 'text-slate-600 hover:bg-slate-100'
};

export const Button = ({ variant = 'primary', small = false, className = '', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) => (
  <button
    type="button"
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      small ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-5 text-[15px]'
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
  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[13px] font-bold whitespace-nowrap ${tones[tone]}`}>
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
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200`}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 rounded-full transition-colors text-slate-500">
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
  <div className="flex flex-wrap gap-2" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        role="tab"
        aria-selected={value === tab.id}
        onClick={() => onChange(tab.id)}
        className={`min-h-11 px-4 rounded-[10px] text-sm font-bold border-[1.5px] border-blue-600 transition-colors ${
          value === tab.id ? 'bg-blue-600 text-white' : 'bg-white text-blue-800 hover:bg-blue-50'
        }`}
      >
        {tab.label}
        {tab.badge ? <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-xs">{tab.badge}</span> : null}
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
  <div className="p-10 text-center text-slate-500 font-semibold text-sm">{children}</div>
);

export const ErrorNote = ({ error }: { error: string | null }) =>
  error ? <div role="alert" className="px-4 py-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold">{error}</div> : null;

export const Th = ({ children, right = false }: { children?: React.ReactNode; right?: boolean }) => (
  <th scope="col" className={`px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${right ? 'text-right' : ''}`}>{children}</th>
);

export const StatTile = ({ label, value, hint, icon: Icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ElementType }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <h3 className="text-slate-500 text-[13px] font-semibold">{label}</h3>
      {Icon && <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Icon size={16} /></div>}
    </div>
    <p className="text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
    {hint && <p className="text-[13px] text-slate-500">{hint}</p>}
  </div>
);
